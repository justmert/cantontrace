/**
 * OAuth2 Token Service
 *
 * Acquires and refreshes OAuth2 tokens using the client_credentials grant.
 * Supports OIDC discovery via .well-known/openid-configuration.
 *
 * Designed for Canton participants protected by Keycloak / OIDC providers,
 * such as CN-Quickstart with AppProvider realm.
 */

import * as jose from 'jose';

export interface OAuth2TokenServiceOptions {
  /** OIDC issuer URL (e.g., http://keycloak.localhost:8082/realms/AppProvider) */
  issuerUrl: string;
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** Token audience (e.g., https://canton.network.global) */
  audience?: string;
  /** Extra scopes to request */
  scopes?: string[];
  /** Seconds before expiry to trigger a refresh (default: 30) */
  refreshMarginSeconds?: number;
  /** Callback invoked whenever a new token is acquired */
  onTokenRefreshed?: (jwt: string) => void;
}

interface OIDCConfiguration {
  issuer: string;
  token_endpoint: string;
  authorization_endpoint?: string;
  jwks_uri?: string;
  [key: string]: unknown;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Keycloak auto-discovery defaults for CN-Quickstart.
 */
const KEYCLOAK_DEFAULTS = {
  adminUser: 'admin',
  adminPassword: 'admin',
  defaultClientId: 'app-provider-backend',
  defaultAudience: 'https://canton.network.global',
} as const;

export class OAuth2TokenService {
  private readonly issuerUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly audience?: string;
  private readonly scopes: string[];
  private readonly refreshMarginSeconds: number;
  private onTokenRefreshed?: (jwt: string) => void;

  private tokenEndpoint: string | null = null;
  private currentToken: string | null = null;
  private tokenExpiresAt: number = 0; // Unix timestamp in seconds
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(options: OAuth2TokenServiceOptions) {
    // Strip trailing slash from issuer URL
    this.issuerUrl = options.issuerUrl.replace(/\/+$/, '');
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.audience = options.audience;
    this.scopes = options.scopes ?? [];
    this.refreshMarginSeconds = options.refreshMarginSeconds ?? 30;
    this.onTokenRefreshed = options.onTokenRefreshed;
  }

  /**
   * Discover the OIDC token endpoint via .well-known/openid-configuration.
   * Falls back to the standard Keycloak token endpoint path if discovery fails.
   */
  async discoverEndpoints(): Promise<void> {
    const wellKnownUrl = `${this.issuerUrl}/.well-known/openid-configuration`;

    try {
      const response = await fetch(wellKnownUrl, {
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const config = (await response.json()) as OIDCConfiguration;
        this.tokenEndpoint = config.token_endpoint;
        return;
      }
    } catch {
      // Discovery failed — fall through to default
    }

    // Fallback: assume standard Keycloak token endpoint path
    this.tokenEndpoint = `${this.issuerUrl}/protocol/openid-connect/token`;
  }

  /**
   * Get a valid access token, refreshing if necessary.
   * Discovers endpoints on first call if not already done.
   */
  async getToken(): Promise<string> {
    if (this.stopped) {
      throw new Error('OAuth2TokenService has been stopped');
    }

    // Discover endpoints if needed
    if (!this.tokenEndpoint) {
      await this.discoverEndpoints();
    }

    // Return cached token if still valid
    const now = Math.floor(Date.now() / 1000);
    if (this.currentToken && now < this.tokenExpiresAt - this.refreshMarginSeconds) {
      return this.currentToken;
    }

    // Acquire a new token
    return this.acquireToken();
  }

  /**
   * Stop the auto-refresh timer and mark the service as stopped.
   */
  stop(): void {
    this.stopped = true;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Whether the service currently holds a valid (non-expired) token.
   */
  hasValidToken(): boolean {
    if (!this.currentToken) return false;
    const now = Math.floor(Date.now() / 1000);
    return now < this.tokenExpiresAt;
  }

  /**
   * Set or update the callback invoked whenever a new token is acquired.
   * Useful for wiring up the callback after the Canton client is created.
   */
  setTokenRefreshCallback(callback: (jwt: string) => void): void {
    this.onTokenRefreshed = callback;
  }

  /**
   * Acquire a token using the client_credentials grant.
   */
  private async acquireToken(): Promise<string> {
    if (!this.tokenEndpoint) {
      throw new Error('Token endpoint not discovered. Call discoverEndpoints() first.');
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    if (this.audience) {
      params.set('audience', this.audience);
    }

    if (this.scopes.length > 0) {
      params.set('scope', this.scopes.join(' '));
    }

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown error');
      throw new Error(
        `OAuth2 token request failed (${response.status}): ${errorBody}`,
      );
    }

    const tokenData = (await response.json()) as TokenResponse;
    this.currentToken = tokenData.access_token;

    // Determine expiry from the JWT itself (more reliable than expires_in)
    try {
      const decoded = jose.decodeJwt(tokenData.access_token);
      if (decoded.exp) {
        this.tokenExpiresAt = decoded.exp;
      } else if (tokenData.expires_in) {
        this.tokenExpiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;
      } else {
        // Default to 5 minutes if no expiry info
        this.tokenExpiresAt = Math.floor(Date.now() / 1000) + 300;
      }
    } catch {
      if (tokenData.expires_in) {
        this.tokenExpiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;
      } else {
        this.tokenExpiresAt = Math.floor(Date.now() / 1000) + 300;
      }
    }

    // Notify callback
    if (this.onTokenRefreshed) {
      this.onTokenRefreshed(this.currentToken);
    }

    // Schedule auto-refresh
    this.scheduleRefresh();

    return this.currentToken;
  }

  /**
   * Schedule a background token refresh before the current token expires.
   */
  private scheduleRefresh(): void {
    if (this.stopped) return;

    // Clear any existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    const now = Math.floor(Date.now() / 1000);
    const refreshAt = this.tokenExpiresAt - this.refreshMarginSeconds;
    const delaySeconds = Math.max(refreshAt - now, 1);

    this.refreshTimer = setTimeout(async () => {
      if (this.stopped) return;

      try {
        await this.acquireToken();
      } catch (err) {
        // Log warning but don't crash — old token may still be valid
        console.warn(
          '[OAuth2TokenService] Background token refresh failed:',
          err instanceof Error ? err.message : err,
        );

        // Retry in 10 seconds if the old token hasn't fully expired
        const retryNow = Math.floor(Date.now() / 1000);
        if (retryNow < this.tokenExpiresAt) {
          this.refreshTimer = setTimeout(() => {
            if (!this.stopped) {
              this.acquireToken().catch((retryErr) => {
                console.error(
                  '[OAuth2TokenService] Token refresh retry failed:',
                  retryErr instanceof Error ? retryErr.message : retryErr,
                );
              });
            }
          }, 10000);
        }
      }
    }, delaySeconds * 1000);

    // Don't hold the process open just for the timer
    if (this.refreshTimer && typeof this.refreshTimer === 'object' && 'unref' in this.refreshTimer) {
      this.refreshTimer.unref();
    }
  }
}

// ============================================================
// Keycloak Auto-Discovery
// ============================================================

/**
 * Auto-discover OAuth2 client credentials from a Keycloak instance.
 *
 * For CN-Quickstart, the flow is:
 * 1. Authenticate as admin on the Keycloak master realm
 * 2. Derive the target realm from the issuer URL
 * 3. List clients in the target realm
 * 4. Find a service-account-enabled client (prefer app-provider-backend)
 * 5. Fetch its client secret
 *
 * @param issuerUrl The OIDC issuer URL (e.g., http://keycloak.localhost:8082/realms/AppProvider)
 * @returns Discovered client credentials, or null if auto-discovery fails
 */
export async function discoverKeycloakCredentials(
  issuerUrl: string,
): Promise<{ clientId: string; clientSecret: string } | null> {
  try {
    // Parse the issuer URL to extract Keycloak base URL and realm name
    const parsed = parseKeycloakIssuerUrl(issuerUrl);
    if (!parsed) return null;

    const { baseUrl, realm } = parsed;

    // Step 1: Get admin token from master realm
    const adminToken = await getKeycloakAdminToken(baseUrl);
    if (!adminToken) return null;

    // Step 2: List clients in the target realm
    const clients = await listRealmClients(baseUrl, realm, adminToken);
    if (!clients || clients.length === 0) return null;

    // Step 3: Find a service-account-enabled client
    // Prefer the default CN-Quickstart client ID
    const preferredClient = clients.find(
      (c: KeycloakClient) =>
        c.clientId === KEYCLOAK_DEFAULTS.defaultClientId && c.serviceAccountsEnabled,
    );
    const serviceAccountClient =
      preferredClient ?? clients.find((c: KeycloakClient) => c.serviceAccountsEnabled);

    if (!serviceAccountClient) return null;

    // Step 4: Fetch the client secret
    const secret = await getClientSecret(
      baseUrl,
      realm,
      serviceAccountClient.id,
      adminToken,
    );
    if (!secret) return null;

    return {
      clientId: serviceAccountClient.clientId,
      clientSecret: secret,
    };
  } catch (err) {
    console.warn(
      '[OAuth2] Keycloak auto-discovery failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ============================================================
// Keycloak Admin API Helpers
// ============================================================

interface KeycloakClient {
  id: string; // Internal UUID
  clientId: string; // The client_id used in OAuth2
  serviceAccountsEnabled: boolean;
  enabled: boolean;
  [key: string]: unknown;
}

/**
 * Parse a Keycloak issuer URL to extract the base URL and realm.
 *
 * Example: "http://keycloak.localhost:8082/realms/AppProvider"
 * -> { baseUrl: "http://keycloak.localhost:8082", realm: "AppProvider" }
 */
function parseKeycloakIssuerUrl(
  issuerUrl: string,
): { baseUrl: string; realm: string } | null {
  const match = issuerUrl.match(/^(https?:\/\/[^/]+)\/realms\/([^/]+)\/?$/);
  if (!match || !match[1] || !match[2]) return null;
  return { baseUrl: match[1], realm: match[2] };
}

/**
 * Get an admin access token from Keycloak's master realm.
 */
async function getKeycloakAdminToken(baseUrl: string): Promise<string | null> {
  const tokenUrl = `${baseUrl}/realms/master/protocol/openid-connect/token`;

  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: KEYCLOAK_DEFAULTS.adminUser,
    password: KEYCLOAK_DEFAULTS.adminPassword,
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as TokenResponse;
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * List all clients in a Keycloak realm.
 */
async function listRealmClients(
  baseUrl: string,
  realm: string,
  adminToken: string,
): Promise<KeycloakClient[] | null> {
  const url = `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/clients?first=0&max=100`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${adminToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const clients = (await response.json()) as KeycloakClient[];
    // Only return enabled, confidential clients with service accounts
    return clients.filter((c) => c.enabled);
  } catch {
    return null;
  }
}

/**
 * Get a client's secret from Keycloak.
 */
async function getClientSecret(
  baseUrl: string,
  realm: string,
  clientUUID: string,
  adminToken: string,
): Promise<string | null> {
  const url = `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/clients/${encodeURIComponent(clientUUID)}/client-secret`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${adminToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { type?: string; value: string };
    return data.value ?? null;
  } catch {
    return null;
  }
}
