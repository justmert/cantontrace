/**
 * Canton Context Middleware
 *
 * Session-based connection management for multi-tenant deployments.
 * Each browser session gets its own Canton client connection, keyed
 * by a session ID stored in a cookie or request header.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CantonClient } from '../canton/client.js';
import type { BootstrapInfo } from '../types.js';
import type { CacheService } from '../services/cache.js';
import type { OAuth2TokenService } from '../services/oauth2.js';
import crypto from 'crypto';

export interface CantonContext {
  client: CantonClient;
  bootstrapInfo: BootstrapInfo;
}

export interface SessionConnection {
  client: CantonClient;
  bootstrapInfo: BootstrapInfo;
  oauth2Service: OAuth2TokenService | null;
  lastActive: number;
}

// Session-keyed connection store
const sessions = new Map<string, SessionConnection>();
const MAX_SESSIONS = 50;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup interval handle (for graceful shutdown)
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic session cleanup.
 */
function startSessionCleanup(): void {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions) {
      if (now - session.lastActive > SESSION_TIMEOUT_MS) {
        disconnectSession(sessionId);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow the process to exit even if the timer is pending
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Stop the periodic session cleanup (for graceful shutdown).
 */
export function stopSessionCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Disconnect and clean up a single session.
 */
function disconnectSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (session.oauth2Service) {
    session.oauth2Service.stop();
  }
  session.client.disconnect();
  sessions.delete(sessionId);
}

/**
 * Register the Canton context decorator on the Fastify instance.
 */
/**
 * Register session ID resolution as an early onRequest hook.
 * Must be called before registerAuthMiddleware and registerCantonContext
 * so that request.sessionId is available to both.
 */
export function registerSessionIdHook(app: FastifyInstance): void {
  // Decorate request with session ID
  app.decorateRequest('sessionId', '');

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Resolve session ID: header > cookie > generate new
    let sessionId = request.headers['x-session-id'] as string | undefined;

    if (!sessionId) {
      // Try to read from signed cookie (requires @fastify/cookie)
      const rawCookie = (request as FastifyRequest & { cookies?: Record<string, string> }).cookies?.['cantontrace-session'];
      if (rawCookie) {
        // unsignCookie returns { valid, renew, value }
        const unsigned = reply.unsignCookie(rawCookie);
        sessionId = unsigned.valid ? (unsigned.value ?? undefined) : undefined;
        // If signature invalid, treat as no cookie
        if (!sessionId) {
          // Try raw value (backward compat with unsigned cookies)
          sessionId = rawCookie;
        }
      }
    }

    if (!sessionId) {
      // Generate a new session ID
      sessionId = crypto.randomUUID();
    }

    // Always set/refresh the cookie (signed, secure behind proxy)
    reply.setCookie('cantontrace-session', sessionId, {
      path: '/',
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      secure: false, // Cloudflare handles HTTPS; backend is HTTP
      maxAge: SESSION_TIMEOUT_MS / 1000,
    });

    request.sessionId = sessionId;
  });
}

export function registerCantonContext(app: FastifyInstance, cache: CacheService): void {
  // Decorate request with Canton context
  app.decorateRequest('cantonContext', null);

  // Start background cleanup of idle sessions
  startSessionCleanup();

  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    const sessionId = request.sessionId;

    // Skip connection lookup for connection management and public endpoints
    if (isConnectionRoute(request.url)) {
      return;
    }

    const session = sessions.get(sessionId);

    if (!session || !session.client.isConnected()) {
      // Try to restore from cache using the session's client if it exists
      if (session?.client.isConnected()) {
        const cached = await cache.getBootstrapInfo();
        if (cached) {
          session.bootstrapInfo = cached;
          session.lastActive = Date.now();
          request.cantonContext = {
            client: session.client,
            bootstrapInfo: session.bootstrapInfo,
          };
          return;
        }
      }

      // No active connection for this session — routes that need Canton will handle this
      return;
    }

    // Update last active timestamp
    session.lastActive = Date.now();

    // Update token from request if present
    if (request.jwtToken) {
      session.client.setToken(request.jwtToken);
    }

    request.cantonContext = {
      client: session.client,
      bootstrapInfo: session.bootstrapInfo,
    };
  });
}

/**
 * Set the active Canton client connection for a session.
 */
export function setActiveConnection(
  sessionId: string,
  client: CantonClient,
  bootstrapInfo: BootstrapInfo,
  oauth2Service?: OAuth2TokenService | null,
): void {
  // Enforce max sessions — evict the oldest idle session if at capacity
  if (!sessions.has(sessionId) && sessions.size >= MAX_SESSIONS) {
    let oldestId: string | null = null;
    let oldestTime = Infinity;
    for (const [id, session] of sessions) {
      if (session.lastActive < oldestTime) {
        oldestTime = session.lastActive;
        oldestId = id;
      }
    }
    if (oldestId) {
      disconnectSession(oldestId);
    }
  }

  sessions.set(sessionId, {
    client,
    bootstrapInfo,
    oauth2Service: oauth2Service ?? null,
    lastActive: Date.now(),
  });
}

/**
 * Clear the active Canton client connection for a session.
 */
export function clearActiveConnection(sessionId: string): void {
  disconnectSession(sessionId);
}

/**
 * Get the active Canton client for a session (for use outside request context).
 */
export function getActiveClient(sessionId: string): CantonClient | null {
  return sessions.get(sessionId)?.client ?? null;
}

/**
 * Get the active bootstrap info for a session.
 */
export function getActiveBootstrapInfo(sessionId: string): BootstrapInfo | null {
  return sessions.get(sessionId)?.bootstrapInfo ?? null;
}

/**
 * Get the session connection object (for OAuth2 access etc.).
 */
export function getSessionConnection(sessionId: string): SessionConnection | null {
  return sessions.get(sessionId) ?? null;
}

/**
 * Get count of active sessions (for monitoring).
 */
export function getActiveSessionCount(): number {
  return sessions.size;
}

/**
 * Disconnect all sessions (for graceful shutdown).
 */
export function disconnectAllSessions(): void {
  for (const sessionId of Array.from(sessions.keys())) {
    disconnectSession(sessionId);
  }
  stopSessionCleanup();
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
    sessionId: string;
  }
}
