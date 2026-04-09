/**
 * GitHub OAuth Authentication Routes
 *
 * Platform-level authentication using GitHub OAuth.
 * When GITHUB_CLIENT_ID is set, users must sign in with GitHub
 * before accessing the application.
 *
 * Routes:
 *   GET  /api/v1/auth/github          — Redirect to GitHub OAuth
 *   GET  /api/v1/auth/github/callback  — Handle OAuth callback
 *   GET  /api/v1/auth/me              — Return current user info
 *   POST /api/v1/auth/logout          — Clear session
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ============================================================
// Types & In-Memory Storage
// ============================================================

export interface PlatformUser {
  id: string;
  githubId: number;
  login: string;
  displayName: string;
  avatarUrl: string;
  email: string | null;
  createdAt: string;
  lastLoginAt: string;
}

/** Session ID -> PlatformUser */
const users = new Map<string, PlatformUser>();

// ============================================================
// Configuration
// ============================================================

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? '';
const AUTH_CALLBACK_URL =
  process.env.AUTH_CALLBACK_URL ?? 'http://localhost:5174/api/v1/auth/github/callback';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5174';

// ============================================================
// Helpers
// ============================================================

export function isPlatformAuthEnabled(): boolean {
  return !!GITHUB_CLIENT_ID;
}

/**
 * Look up the authenticated platform user for a session ID.
 */
export function getPlatformUser(sessionId: string): PlatformUser | null {
  return users.get(sessionId) ?? null;
}

// ============================================================
// Route Registration
// ============================================================

export function registerAuthRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/auth/github
   *
   * Redirect the user to GitHub's OAuth authorization page.
   */
  app.get('/api/v1/auth/github', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!GITHUB_CLIENT_ID) {
      return reply.code(404).send({
        code: 'AUTH_DISABLED',
        message: 'Platform authentication is not configured. Set GITHUB_CLIENT_ID to enable.',
      });
    }

    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: AUTH_CALLBACK_URL,
      scope: 'read:user user:email',
    });

    return reply.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  /**
   * GET /api/v1/auth/github/callback
   *
   * GitHub redirects here after the user authorizes.
   * Exchange the code for an access token, fetch the user profile,
   * create/update the user in the in-memory store, set the session cookie,
   * and redirect to the frontend.
   */
  app.get('/api/v1/auth/github/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.query as { code?: string };

    if (!code) {
      return reply.code(400).send({
        code: 'MISSING_CODE',
        message: 'Missing authorization code from GitHub.',
      });
    }

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return reply.code(500).send({
        code: 'AUTH_NOT_CONFIGURED',
        message: 'GitHub OAuth is not fully configured (missing client ID or secret).',
      });
    }

    // Step 1: Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: AUTH_CALLBACK_URL,
      }),
    });

    if (!tokenResponse.ok) {
      app.log.error({ status: tokenResponse.status }, 'GitHub token exchange failed');
      return reply.code(502).send({
        code: 'TOKEN_EXCHANGE_FAILED',
        message: 'Failed to exchange authorization code with GitHub.',
      });
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      app.log.error({ error: tokenData.error, description: tokenData.error_description }, 'GitHub OAuth error');
      return reply.code(502).send({
        code: 'TOKEN_EXCHANGE_FAILED',
        message: tokenData.error_description ?? 'Failed to obtain access token from GitHub.',
      });
    }

    const accessToken = tokenData.access_token;

    // Step 2: Fetch user profile from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'CantonTrace',
      },
    });

    if (!userResponse.ok) {
      app.log.error({ status: userResponse.status }, 'GitHub user profile fetch failed');
      return reply.code(502).send({
        code: 'PROFILE_FETCH_FAILED',
        message: 'Failed to fetch user profile from GitHub.',
      });
    }

    const githubUser = (await userResponse.json()) as {
      id: number;
      login: string;
      name: string | null;
      avatar_url: string;
      email: string | null;
    };

    // Step 3: If email is not public, try the emails endpoint
    let email = githubUser.email;
    if (!email) {
      try {
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'CantonTrace',
          },
        });

        if (emailsResponse.ok) {
          const emails = (await emailsResponse.json()) as Array<{
            email: string;
            primary: boolean;
            verified: boolean;
          }>;
          const primary = emails.find((e) => e.primary && e.verified);
          email = primary?.email ?? emails[0]?.email ?? null;
        }
      } catch {
        // Non-fatal — email remains null
      }
    }

    // Step 4: Create or update user in the session store
    const sessionId = request.sessionId;
    const now = new Date().toISOString();

    const user: PlatformUser = {
      id: `github-${githubUser.id}`,
      githubId: githubUser.id,
      login: githubUser.login,
      displayName: githubUser.name ?? githubUser.login,
      avatarUrl: githubUser.avatar_url,
      email,
      createdAt: now,
      lastLoginAt: now,
    };

    users.set(sessionId, user);

    app.log.info({ login: user.login, githubId: user.githubId }, 'User authenticated via GitHub');

    // Step 5: Set signed session cookie and redirect to frontend
    reply.setCookie('cantontrace-session', sessionId, {
      path: '/',
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      maxAge: 30 * 60, // 30 minutes
    });

    return reply.redirect(FRONTEND_URL);
  });

  /**
   * GET /api/v1/auth/me
   *
   * Return the currently authenticated user, or 401 if not authenticated.
   * When platform auth is disabled, returns a special response indicating that.
   */
  app.get('/api/v1/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isPlatformAuthEnabled()) {
      return reply.send({
        authenticated: false,
        authEnabled: false,
        message: 'Platform authentication is not enabled.',
      });
    }

    const sessionId = request.sessionId;
    const user = users.get(sessionId);

    if (!user) {
      return reply.code(401).send({
        authenticated: false,
        authEnabled: true,
        code: 'UNAUTHENTICATED',
        message: 'Not authenticated. Please sign in with GitHub.',
      });
    }

    return reply.send({
      authenticated: true,
      authEnabled: true,
      user,
    });
  });

  /**
   * POST /api/v1/auth/logout
   *
   * Clear the user's platform session.
   */
  app.post('/api/v1/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.sessionId;
    users.delete(sessionId);

    reply.clearCookie('cantontrace-session', { path: '/' });

    return reply.send({ success: true });
  });
}
