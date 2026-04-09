/**
 * JWT Authentication Middleware
 *
 * Validates JWT tokens and handles token refresh.
 * Uses the `jose` library for JWT operations.
 *
 * In sandbox mode (no IAM URL configured), authentication is bypassed.
 *
 * Platform Authentication (GitHub OAuth):
 * When GITHUB_CLIENT_ID is set, an additional layer of platform auth
 * is enforced before Canton JWT checks. This requires users to sign in
 * with GitHub before accessing non-public routes.
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import * as jose from 'jose';
import { isPlatformAuthEnabled, getPlatformUser } from '../routes/auth.js';

export interface AuthConfig {
  /** IAM / JWKS URL for token validation. Null = sandbox mode (no auth). */
  jwksUrl: string | null;
  /** Expected JWT audience (participant ID). */
  audience?: string;
  /** Expected JWT issuer. */
  issuer?: string;
  /** Token refresh threshold in seconds (refresh when less than this remaining). */
  refreshThresholdSeconds?: number;
}

interface JwtPayload {
  sub: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

// JWKS validation is handled by jose.createRemoteJWKSet which caches internally.

/**
 * Register the auth middleware on a Fastify instance.
 */
export function registerAuthMiddleware(
  app: FastifyInstance,
  config: AuthConfig,
): void {
  // Decorate request with auth context
  app.decorateRequest('userId', '');
  app.decorateRequest('jwtToken', '');
  app.decorateRequest('jwtPayload', null);
  app.decorateRequest('platformUser', null);

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health check, swagger, and auth endpoints
    if (isPublicRoute(request.url)) {
      return;
    }

    // Platform auth check (GitHub OAuth) — runs before Canton JWT checks
    if (isPlatformAuthEnabled()) {
      const sessionId = request.sessionId;
      const platformUser = getPlatformUser(sessionId);

      if (!platformUser) {
        reply.code(401).send({
          code: 'PLATFORM_UNAUTHENTICATED',
          message: 'Platform authentication required. Please sign in with GitHub.',
        });
        return;
      }

      // Attach platform user info to request for downstream use
      request.platformUser = platformUser;
    }

    // Sandbox mode: no auth required
    if (!config.jwksUrl) {
      request.userId = 'sandbox-user';
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      reply.code(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Missing or invalid Authorization header. Expected: Bearer <JWT>',
      });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = await validateToken(token, config);
      request.userId = payload.sub ?? '';
      request.jwtToken = token;
      request.jwtPayload = payload;

      // Check if token is close to expiry and set refresh hint
      if (payload.exp) {
        const remainingSeconds = payload.exp - Math.floor(Date.now() / 1000);
        const threshold = config.refreshThresholdSeconds ?? 120;
        if (remainingSeconds > 0 && remainingSeconds < threshold) {
          reply.header('X-Token-Refresh-Hint', 'true');
          reply.header('X-Token-Remaining-Seconds', String(remainingSeconds));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token validation failed';
      reply.code(401).send({
        code: 'UNAUTHENTICATED',
        message: `JWT validation failed: ${message}`,
      });
    }
  });
}

/**
 * Validate a JWT token against the configured JWKS endpoint.
 */
async function validateToken(token: string, config: AuthConfig): Promise<JwtPayload> {
  if (!config.jwksUrl) {
    // Sandbox mode — decode without verification
    const decoded = jose.decodeJwt(token);
    return decoded as JwtPayload;
  }

  const jwks = jose.createRemoteJWKSet(new URL(config.jwksUrl));

  const verifyOptions: jose.JWTVerifyOptions = {};
  if (config.audience) {
    verifyOptions.audience = config.audience;
  }
  if (config.issuer) {
    verifyOptions.issuer = config.issuer;
  }

  const { payload } = await jose.jwtVerify(token, jwks, verifyOptions);
  return payload as JwtPayload;
}

/**
 * Routes that don't require authentication.
 */
function isPublicRoute(url: string): boolean {
  const publicPrefixes = [
    '/api/v1/health',
    '/api/v1/auth/',
    '/documentation',
    '/swagger',
  ];
  return publicPrefixes.some((prefix) => url.startsWith(prefix));
}

// Fastify request augmentation
declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    jwtToken: string;
    jwtPayload: JwtPayload | null;
    platformUser: import('../routes/auth.js').PlatformUser | null;
  }
}
