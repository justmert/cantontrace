import { create } from "zustand";
import { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BootstrapInfo, ConnectionConfig } from "@/lib/types";

// Reference to the global query client — set by the app root
let _queryClient: QueryClient | null = null;
export function setQueryClient(qc: QueryClient) { _queryClient = qc; }

interface ConnectionState {
  status: "disconnected" | "connecting" | "connected" | "error";
  config: ConnectionConfig | null;
  bootstrap: BootstrapInfo | null;
  error: string | null;
  connect: (config: ConnectionConfig) => Promise<void>;
  disconnect: () => void;
  refreshBootstrap: () => Promise<void>;
  createSandbox: () => Promise<void>;
  checkExistingConnection: () => Promise<void>;
}

// Persist last config in localStorage so we can auto-reconnect after refresh
function saveConfig(config: ConnectionConfig) {
  try {
    localStorage.setItem("cantontrace-connection", JSON.stringify(config));
  } catch { /* ignore */ }
}

function loadConfig(): ConnectionConfig | null {
  try {
    const raw = localStorage.getItem("cantontrace-connection");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearConfig() {
  try {
    localStorage.removeItem("cantontrace-connection");
  } catch { /* ignore */ }
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: "disconnected",
  config: null,
  bootstrap: null,
  error: null,

  connect: async (config: ConnectionConfig) => {
    set({ status: "connecting", error: null, config });

    try {
      const response = await api.connect(config);
      saveConfig(config);
      // Clear all stale data from previous connection and force re-fetch
      _queryClient?.clear();
      set({
        status: "connected",
        bootstrap: response.data,
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      set({
        status: "error",
        error: message,
        bootstrap: null,
      });
      throw err;
    }
  },

  disconnect: () => {
    api.disconnect().catch(() => {});
    clearConfig();
    // Clear all cached data from previous connection
    _queryClient?.clear();
    // Stop the event stream WebSocket and clear buffered events
    try {
      const { useEventStreamStore } = require("@/stores/event-stream-store");
      const eventStore = useEventStreamStore.getState();
      eventStore.stopCollection();
      eventStore.clearEvents();
    } catch { /* ignore if not available */ }
    // Clear ACS filter store so stale filters don't apply to next connection
    try {
      const { useACSFilterStore } = require("@/stores/acs-filter-store");
      useACSFilterStore.getState().clearFilters();
    } catch {}
    // Reset debugger store (form state, simulation results, traces)
    try {
      const { useDebuggerStore } = require("@/stores/debugger-store");
      useDebuggerStore.getState().reset();
    } catch {}
    set({
      status: "disconnected",
      config: null,
      bootstrap: null,
      error: null,
    });
  },

  refreshBootstrap: async () => {
    try {
      const res = await fetch("/api/v1/connect?refresh=true");
      if (res.ok && res.status === 200) {
        const data = await res.json();
        if (data.data?.apiVersion) {
          set({ bootstrap: data.data });
          // Also invalidate queries that depend on bootstrap data
          _queryClient?.invalidateQueries();
        }
      }
    } catch { /* ignore */ }
  },

  createSandbox: async () => {
    set({ status: "connecting", error: null });

    try {
      const response = await api.createSandbox({});
      const sandbox = response.data;

      const config: ConnectionConfig = {
        ledgerApiEndpoint: sandbox.ledgerApiEndpoint,
        sandboxId: sandbox.id,
      };

      set({ config });

      const bootstrapResponse = await api.connect(config);
      saveConfig(config);
      set({
        status: "connected",
        bootstrap: bootstrapResponse.data,
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create sandbox";
      set({
        status: "error",
        error: message,
        bootstrap: null,
      });
      throw err;
    }
  },

  // Check if the API gateway already has an active connection
  // and restore it on page load
  checkExistingConnection: async () => {
    try {
      // Try GET /connect which returns existing bootstrap
      const existingRes = await fetch("/api/v1/connect");
      if (existingRes.ok && existingRes.status === 200) {
        const existing = await existingRes.json();
        if (existing.data?.apiVersion) {
          const savedConfig = loadConfig();

          // If it was a sandbox connection, verify the sandbox still exists
          if (savedConfig?.sandboxId) {
            try {
              const sbRes = await fetch(`/api/v1/sandboxes/${savedConfig.sandboxId}`);
              if (!sbRes.ok) {
                // Sandbox was deleted — disconnect and clear
                clearConfig();
                await fetch("/api/v1/connect", { method: "DELETE" }).catch(() => {});
                set({ status: "disconnected", config: null, bootstrap: null });
                return;
              }
            } catch {
              // Can't verify — proceed anyway
            }
          }

          set({
            status: "connected",
            config: savedConfig ?? { ledgerApiEndpoint: "" },
            bootstrap: existing.data,
            error: null,
          });
          return;
        }
      }

      // Gateway not connected — try auto-reconnect with saved config
      // Only for non-sandbox connections (sandboxes may not survive restart)
      const savedConfig = loadConfig();
      if (savedConfig && !savedConfig.sandboxId) {
        set({ status: "connecting", config: savedConfig });
        try {
          const response = await api.connect(savedConfig);
          set({
            status: "connected",
            bootstrap: response.data,
            error: null,
          });
        } catch {
          clearConfig();
          set({ status: "disconnected", config: null });
        }
      } else if (savedConfig?.sandboxId) {
        // Don't auto-reconnect to sandboxes — they may have been deleted
        clearConfig();
      }
    } catch {
      // No API gateway running — stay disconnected
    }
  },
}));
