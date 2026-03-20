/**
 * Canton Context Middleware
 *
 * Fastify decorator that attaches the CantonClient to the request context.
 * Each request gets access to the shared Canton client connection.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CantonClient } from '../canton/client.js';
import type { BootstrapInfo } from '../types.js';
import type { CacheService } from '../services/cache.js';

export interface CantonContext {
  client: CantonClient;
  bootstrapInfo: BootstrapInfo;
}

// Module-level connection state
let activeClient: CantonClient | null = null;
let activeBootstrapInfo: BootstrapInfo | null = null;

/**
 * Register the Canton context decorator on the Fastify instance.
 */
export function registerCantonContext(app: FastifyInstance, cache: CacheService): void {
  // Decorate request with Canton context accessor
  app.decorateRequest('cantonContext', null);

  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip for connection management and public endpoints
    if (isConnectionRoute(request.url)) {
      return;
    }

    if (!activeClient?.isConnected() || !activeBootstrapInfo) {
      // Try to restore from cache
      const cached = await cache.getBootstrapInfo();
      if (cached && activeClient?.isConnected()) {
        activeBootstrapInfo = cached;
        request.cantonContext = {
          client: activeClient,
          bootstrapInfo: activeBootstrapInfo,
        };
        return;
      }

      // No active connection — routes that need Canton will handle this
      return;
    }

    // Update token from request if present
    if (request.jwtToken) {
      activeClient.setToken(request.jwtToken);
    }

    request.cantonContext = {
      client: activeClient,
      bootstrapInfo: activeBootstrapInfo,
    };
  });
}

/**
 * Set the active Canton client connection.
 */
export function setActiveConnection(client: CantonClient, bootstrapInfo: BootstrapInfo): void {
  activeClient = client;
  activeBootstrapInfo = bootstrapInfo;
}

/**
 * Clear the active Canton client connection.
 */
export function clearActiveConnection(): void {
  if (activeClient) {
    activeClient.disconnect();
  }
  activeClient = null;
  activeBootstrapInfo = null;
}

/**
 * Get the active Canton client (for use outside request context).
 */
export function getActiveClient(): CantonClient | null {
  return activeClient;
}

/**
 * Get the active bootstrap info.
 */
export function getActiveBootstrapInfo(): BootstrapInfo | null {
  return activeBootstrapInfo;
}

/**
 * Require Canton context on a request — throws if not connected.
 */
export function requireCantonContext(request: FastifyRequest): CantonContext {
  if (!request.cantonContext) {
    throw Object.assign(
      new Error('Not connected to a Canton participant. Call POST /api/v1/connect first.'),
      { statusCode: 503 },
    );
  }
  return request.cantonContext;
}

function isConnectionRoute(url: string): boolean {
  return url.startsWith('/api/v1/connect') || url.startsWith('/api/v1/health');
}

// Fastify request augmentation
declare module 'fastify' {
  interface FastifyRequest {
    cantonContext: CantonContext | null;
  }
}
