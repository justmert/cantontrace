import { create } from "zustand";

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

interface AuthMeResponse {
  authenticated: boolean;
  authEnabled: boolean;
  user?: PlatformUser;
  message?: string;
}

interface AuthState {
  /** The authenticated user, or null if not signed in. */
  user: PlatformUser | null;
  /** Whether the initial auth check is in progress. */
  isLoading: boolean;
  /** Whether platform auth is enabled on the backend (GITHUB_CLIENT_ID is set). */
  authEnabled: boolean | null;
  /** Check current authentication status via GET /api/v1/auth/me. */
  checkAuth: () => Promise<void>;
  /** Sign out via POST /api/v1/auth/logout. */
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  authEnabled: null,

  checkAuth: async () => {
    set({ isLoading: true });

    try {
      const response = await fetch("/api/v1/auth/me", {
        credentials: "include",
      });

      if (response.ok) {
        const data: AuthMeResponse = await response.json();

        if (data.authenticated && data.user) {
          set({
            user: data.user,
            authEnabled: data.authEnabled,
            isLoading: false,
          });
          return;
        }

        // Not authenticated but auth may or may not be enabled
        set({
          user: null,
          authEnabled: data.authEnabled,
          isLoading: false,
        });
        return;
      }

      if (response.status === 401) {
        // Auth is enabled but user is not signed in
        const data: AuthMeResponse = await response.json();
        set({
          user: null,
          authEnabled: data.authEnabled ?? true,
          isLoading: false,
        });
        return;
      }

      // Unexpected error — assume auth is not enabled so we don't block the app
      set({ user: null, authEnabled: false, isLoading: false });
    } catch {
      // Network error or API gateway not running — assume auth disabled
      set({ user: null, authEnabled: false, isLoading: false });
    }
  },

  logout: async () => {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort — clear local state regardless
    }

    set({ user: null });

    // Redirect to login page
    window.location.href = "/login";
  },
}));
