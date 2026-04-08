/**
 * Connection Routes
 *
 * POST /api/v1/connect   — Store connection config, run bootstrap, cache in Redis
 * DELETE /api/v1/connect  — Disconnect, clear cache
 * GET /api/v1/health      — Health check including Canton connectivity
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CantonClient, type CantonClientOptions } from '../canton/client.js';
import {
  setActiveConnection,
  clearActiveConnection,
  getActiveClient,
  getActiveBootstrapInfo,
} from '../middleware/canton-context.js';
import type { CacheService } from '../services/cache.js';
import { unsubscribeAll } from '../services/event-stream.js';
import { OAuth2TokenService, discoverKeycloakCredentials } from '../services/oauth2.js';
import type { ConnectionConfig, BootstrapInfo, ApiResponse } from '../types.js';

// Module-level reference so we can stop it on disconnect
let activeOAuth2Service: OAuth2TokenService | null = null;

export function registerConnectionRoutes(app: FastifyInstance, cache: CacheService): void {
  /**
   * GET /api/v1/connect
   *
   * Return the existing connection's bootstrap info without re-connecting.
   * Used by the frontend on page load to restore state.
   */
  app.get('/api/v1/connect', {
    schema: {
      description: 'Get existing connection bootstrap info',
      tags: ['Connection'],
      response: {
        200: { type: 'object', additionalProperties: true },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const client = getActiveClient();
    const bootstrapInfo = getActiveBootstrapInfo();

    if (client?.isConnected() && bootstrapInfo) {
      // If refresh requested, re-fetch dynamic data (parties, packages, offset)
      const refresh = (request.query as Record<string, string>).refresh === 'true';
      if (refresh) {
        try {
          // Re-fetch known parties
          const partyResult = await client.partyManagementService.listKnownParties();
          bootstrapInfo.knownParties = partyResult.parties
            .filter((p) => p.isLocal)
            .map((p) => p.party);
          // Re-fetch packages
          const packages = await client.packageService.listPackagesWithMetadata();
          bootstrapInfo.packages = packages;
          // Re-fetch current offset
          bootstrapInfo.currentOffset = await client.stateService.getLedgerEnd();
          // Update cached bootstrap
          setActiveConnection(client, bootstrapInfo);
        } catch (err) {
          request.log.warn({ err }, 'Failed to refresh bootstrap data');
        }
      }

      return reply.send({
        data: bootstrapInfo,
        meta: {
          offset: bootstrapInfo.currentOffset,
          timestamp: bootstrapInfo.connectedAt,
        },
      });
    }

    // Not connected — return empty
    return reply.code(204).send();
  });

  /**
   * POST /api/v1/connect
   *
   * Establish a connection to a Canton participant node.
   * Runs the full bootstrap sequence (Section 4.7).
   */
  app.post<{
    Body: ConnectionConfig;
  }>('/api/v1/connect', {
    schema: {
      description: 'Connect to a Canton participant node and run bootstrap sequence',
      tags: ['Connection'],
      body: {
        type: 'object',
        required: ['ledgerApiEndpoint'],
        properties: {
          ledgerApiEndpoint: { type: 'string', description: 'gRPC endpoint (host:port)' },
          iamUrl: { type: 'string', description: 'OIDC issuer URL for OAuth2 token acquisition (optional for sandbox)' },
          sandboxId: { type: 'string', description: 'Sandbox ID if connecting to managed sandbox' },
          clientId: { type: 'string', description: 'OAuth2 client ID (auto-discovered from Keycloak if omitted)' },
          clientSecret: { type: 'string', description: 'OAuth2 client secret (auto-discovered from Keycloak if omitted)' },
          audience: { type: 'string', description: 'OAuth2 audience (defaults to https://canton.network.global)' },
        },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: ConnectionConfig }>, reply: FastifyReply) => {
    const { ledgerApiEndpoint, iamUrl, sandboxId, clientId, clientSecret, audience } = request.body;

    // Clean up streaming subscriptions before disconnecting
    unsubscribeAll();

    // Disconnect existing connection if any
    if (activeOAuth2Service) {
      activeOAuth2Service.stop();
      activeOAuth2Service = null;
    }
    clearActiveConnection();
    await cache.clearBootstrapInfo();
    await cache.clearConnectionConfig();

    // ============================================================
    // OAuth2 Token Acquisition (when iamUrl is provided)
    // ============================================================
    let initialToken: string | undefined;

    if (iamUrl) {
      app.log.info({ iamUrl }, 'IAM URL provided — acquiring OAuth2 token');

      // Resolve client credentials: use provided values, or auto-discover from Keycloak
      let resolvedClientId = clientId;
      let resolvedClientSecret = clientSecret;

      if (!resolvedClientId || !resolvedClientSecret) {
        app.log.info('Client credentials not provided — attempting Keycloak auto-discovery');
        const discovered = await discoverKeycloakCredentials(iamUrl);
        if (discovered) {
          resolvedClientId = resolvedClientId ?? discovered.clientId;
          resolvedClientSecret = resolvedClientSecret ?? discovered.clientSecret;
          app.log.info({ clientId: resolvedClientId }, 'Auto-discovered Keycloak client credentials');
        } else {
          app.log.warn('Keycloak auto-discovery failed — will try with defaults');
          resolvedClientId = resolvedClientId ?? 'app-provider-backend';
        }
      }

      if (!resolvedClientSecret) {
        return reply.code(400).send({
          code: 'OAUTH2_CREDENTIALS_MISSING',
          message:
            'Could not determine OAuth2 client credentials. ' +
            'Either provide clientId and clientSecret in the request body, ' +
            'or ensure the Keycloak admin API is accessible for auto-discovery.',
        });
      }

      // Create OAuth2 token service (onTokenRefreshed will be set after client is created)
      const oauth2Service = new OAuth2TokenService({
        issuerUrl: iamUrl,
        clientId: resolvedClientId,
        clientSecret: resolvedClientSecret,
        audience: audience ?? 'https://canton.network.global',
      });

      // Discover OIDC endpoints
      try {
        await oauth2Service.discoverEndpoints();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OIDC discovery failed';
        return reply.code(502).send({
          code: 'OIDC_DISCOVERY_FAILED',
          message: `Failed to discover OIDC endpoints from ${iamUrl}: ${message}`,
        });
      }

      // Acquire initial token
      try {
        initialToken = await oauth2Service.getToken();
        app.log.info('OAuth2 token acquired successfully');
      } catch (err) {
        oauth2Service.stop();
        const message = err instanceof Error ? err.message : 'Token acquisition failed';
        return reply.code(502).send({
          code: 'OAUTH2_TOKEN_FAILED',
          message: `Failed to acquire OAuth2 token: ${message}`,
        });
      }

      activeOAuth2Service = oauth2Service;
    }

    // Create and connect Canton client
    const clientOptions: CantonClientOptions = {
      tls: ledgerApiEndpoint.includes(':443') || request.body.ledgerApiEndpoint.startsWith('https'),
      token: initialToken ?? (request.jwtToken || undefined),
    };

    const client = new CantonClient(ledgerApiEndpoint, clientOptions);

    // Wire up the token refresh callback so background refreshes update the client
    if (activeOAuth2Service) {
      activeOAuth2Service.setTokenRefreshCallback((jwt: string) => {
        client.setToken(jwt);
        app.log.info('OAuth2 token refreshed and applied to Canton client');
      });
    }

    // Connect with retry — Canton sandboxes may need a few seconds to register all gRPC services
    let bootstrapInfo: BootstrapInfo | null = null;
    let lastError: string = '';
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Reconnect fresh on each attempt (reflection results may differ)
        if (attempt > 1) {
          client.disconnect();
          await new Promise(r => setTimeout(r, 2000));
        }
        await client.connect();

        bootstrapInfo = await client.bootstrap({
          skipUserManagement: !iamUrl,
        });
        break; // Success
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Connection failed';
        const isRetryable = lastError.includes('not initialized') ||
                            lastError.includes('UNAVAILABLE') ||
                            lastError.includes('not found in proto');
        if (!isRetryable || attempt === maxAttempts) {
          app.log.warn({ attempt, maxAttempts, error: lastError }, 'Connection attempt failed');
          break;
        }
        app.log.info({ attempt, maxAttempts }, `Canton not ready, retrying in 2s...`);
      }
    }

    if (!bootstrapInfo) {
      if (activeOAuth2Service) {
        activeOAuth2Service.stop();
        activeOAuth2Service = null;
      }
      client.disconnect();
      return reply.code(502).send({
        code: 'CONNECTION_FAILED',
        message: `Failed to connect to Canton participant at ${ledgerApiEndpoint}: ${lastError}`,
      });
    }

    // Store connection state
    setActiveConnection(client, bootstrapInfo);
    await cache.setBootstrapInfo(bootstrapInfo);
    await cache.setConnectionConfig({
      ledgerApiEndpoint,
      iamUrl,
      sandboxId,
    });

    const response: ApiResponse<BootstrapInfo> = {
      data: bootstrapInfo,
      meta: {
        offset: bootstrapInfo.currentOffset,
        timestamp: bootstrapInfo.connectedAt,
      },
    };

    return reply.send(response);
  });

  /**
   * DELETE /api/v1/connect
   *
   * Disconnect from the current Canton participant.
   */
  app.delete('/api/v1/connect', {
    schema: {
      description: 'Disconnect from Canton participant and clear cached state',
      tags: ['Connection'],
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'object' },
          },
        },
      },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    // Clean up streaming subscriptions before disconnecting
    unsubscribeAll();

    // Stop OAuth2 token refresh if active
    if (activeOAuth2Service) {
      activeOAuth2Service.stop();
      activeOAuth2Service = null;
    }

    clearActiveConnection();
    await cache.clearBootstrapInfo();
    await cache.clearConnectionConfig();
    await cache.clearAll();

    return reply.send({
      data: { disconnected: true, timestamp: new Date().toISOString() },
    });
  });

  /**
   * GET /api/v1/health
   *
   * Health check including Canton connectivity status.
   */
  app.get('/api/v1/health', {
    schema: {
      description: 'Health check including Canton connectivity status',
      tags: ['Connection'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            canton: { type: 'object', additionalProperties: true },
            cache: { type: 'object', additionalProperties: true },
            uptime: { type: 'number' },
          },
        },
      },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const client = getActiveClient();
    const bootstrapInfo = getActiveBootstrapInfo();

    const cantonStatus = client?.isConnected()
      ? {
          connected: true,
          endpoint: 'connected', // Don't expose actual endpoint in health check
          apiVersion: bootstrapInfo?.apiVersion ?? 'unknown',
          currentOffset: bootstrapInfo?.currentOffset ?? 'unknown',
          connectedAt: bootstrapInfo?.connectedAt ?? 'unknown',
        }
      : { connected: false };

    // Check Canton connectivity by pinging version service
    let cantonReachable = false;
    if (client?.isConnected()) {
      try {
        await client.versionService.getLedgerApiVersion();
        cantonReachable = true;
      } catch {
        cantonReachable = false;
      }
    }

    return reply.send({
      status: cantonReachable ? 'healthy' : client?.isConnected() ? 'degraded' : 'disconnected',
      canton: {
        ...cantonStatus,
        reachable: cantonReachable,
      },
      cache: {
        available: cache.isAvailable(),
      },
      uptime: process.uptime(),
    });
  });
}
