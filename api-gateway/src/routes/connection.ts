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
import type { ConnectionConfig, BootstrapInfo, ApiResponse } from '../types.js';

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
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const client = getActiveClient();
    const bootstrapInfo = getActiveBootstrapInfo();

    if (client?.isConnected() && bootstrapInfo) {
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
          iamUrl: { type: 'string', description: 'OAuth 2.0 / JWKS URL (optional for sandbox)' },
          sandboxId: { type: 'string', description: 'Sandbox ID if connecting to managed sandbox' },
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
    const { ledgerApiEndpoint, iamUrl, sandboxId } = request.body;

    // Clean up streaming subscriptions before disconnecting
    unsubscribeAll();

    // Disconnect existing connection if any
    clearActiveConnection();
    await cache.clearBootstrapInfo();
    await cache.clearConnectionConfig();

    // Create and connect Canton client
    const clientOptions: CantonClientOptions = {
      tls: ledgerApiEndpoint.includes(':443') || request.body.ledgerApiEndpoint.startsWith('https'),
      token: request.jwtToken || undefined,
    };

    const client = new CantonClient(ledgerApiEndpoint, clientOptions);

    try {
      await client.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      return reply.code(502).send({
        code: 'CONNECTION_FAILED',
        message: `Failed to connect to Canton participant at ${ledgerApiEndpoint}: ${message}`,
      });
    }

    // Run bootstrap sequence
    let bootstrapInfo: BootstrapInfo;
    try {
      bootstrapInfo = await client.bootstrap({
        skipUserManagement: !iamUrl, // Skip user management for sandbox
      });
    } catch (err) {
      client.disconnect();
      const message = err instanceof Error ? err.message : 'Bootstrap failed';
      return reply.code(502).send({
        code: 'BOOTSTRAP_FAILED',
        message: `Bootstrap sequence failed: ${message}`,
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
