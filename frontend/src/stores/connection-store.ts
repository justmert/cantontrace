import { create } from "zustand";
import { api } from "@/lib/api";
import type { BootstrapInfo, ConnectionConfig } from "@/lib/types";

interface ConnectionState {
  status: "disconnected" | "connecting" | "connected" | "error";
  config: ConnectionConfig | null;
  bootstrap: BootstrapInfo | null;
  error: string | null;
  connect: (config: ConnectionConfig) => Promise<void>;
  disconnect: () => void;
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
    set({
      status: "disconnected",
      config: null,
      bootstrap: null,
      error: null,
    });
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
  // and restore it on page load — does NOT re-connect, just reads existing state
  checkExistingConnection: async () => {
    try {
      // First: try GET /connect which returns existing bootstrap without re-connecting
      const existingRes = await fetch("/api/v1/connect");
      if (existingRes.ok && existingRes.status === 200) {
        const existing = await existingRes.json();
        if (existing.data?.apiVersion) {
          const savedConfig = loadConfig();
          set({
            status: "connected",
            config: savedConfig ?? { ledgerApiEndpoint: "unknown" },
            bootstrap: existing.data,
            error: null,
          });
          return;
        }
      }

      // Gateway not connected — try auto-reconnect with saved config
      const savedConfig = loadConfig();
      if (savedConfig) {
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
      }
    } catch {
      // No API gateway running — stay disconnected
    }
  },
}));
