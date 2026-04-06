import { create } from "zustand";
import { api } from "@/lib/api";
import type { EventStreamFilter, LedgerUpdate } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of events kept in memory to prevent unbounded growth. */
const MAX_EVENTS = 5_000;
/** Maximum number of events buffered while the stream is paused. */
const MAX_BUFFER = 2_000;
/** Maximum number of automatic reconnection attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 10;
/** Base delay (ms) for exponential backoff reconnection. */
const BASE_RECONNECT_DELAY = 1_000;

// ---------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------

export type StreamConnectionStatus =
  | "connected"
  | "reconnecting"
  | "disconnected";

// ---------------------------------------------------------------------------
// Default filter
// ---------------------------------------------------------------------------

const DEFAULT_FILTER: EventStreamFilter = {
  templates: undefined,
  parties: undefined,
  eventTypes: undefined,
  transactionShape: "LEDGER_EFFECTS",
};

// ---------------------------------------------------------------------------
// Module-level WebSocket state (survives navigation)
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let pausedRef = false;
let bufferRef: LedgerUpdate[] = [];

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface EventStreamState {
  // Event data
  events: LedgerUpdate[];
  connectionStatus: StreamConnectionStatus;
  isPaused: boolean;
  isLoadingRecent: boolean;
  lastOffset: string | null;

  // Filter state (persisted across navigation)
  filter: EventStreamFilter;

  // Actions -- event management
  addEvent: (event: LedgerUpdate) => void;
  clearEvents: () => void;

  // Actions -- stream lifecycle (called from app-level)
  startCollection: () => void;
  stopCollection: () => void;
  reconnect: () => void;
  loadRecent: () => void;

  // Actions -- pause/resume
  pause: () => void;
  resume: () => void;

  // Actions -- filter management
  setFilter: (filter: Partial<EventStreamFilter>) => void;
  setTemplates: (templates: EventStreamFilter["templates"]) => void;
  setParties: (parties: string[]) => void;
  setEventTypes: (types: string[]) => void;
  setTransactionShape: (
    shape: EventStreamFilter["transactionShape"]
  ) => void;
  resetFilter: () => void;
}

// ---------------------------------------------------------------------------
// Internal: connect the WebSocket
// ---------------------------------------------------------------------------

function connectWebSocket() {
  // Clean up existing
  if (ws) {
    ws.close();
    ws = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const store = useEventStreamStore.getState();
  useEventStreamStore.setState({ connectionStatus: "reconnecting" });

  const filter = store.filter;
  const newWs = api.connectEventStream(filter, (event: LedgerUpdate) => {
    if (pausedRef) {
      // Cap the buffer to prevent memory leaks while paused
      if (bufferRef.length < MAX_BUFFER) {
        bufferRef.push(event);
      }
    } else {
      useEventStreamStore.getState().addEvent(event);
    }
  });

  newWs.addEventListener("open", () => {
    useEventStreamStore.setState({ connectionStatus: "connected" });
    reconnectAttempts = 0;
  });

  newWs.addEventListener("close", () => {
    useEventStreamStore.setState({ connectionStatus: "disconnected" });
    // Auto-reconnect with exponential backoff, up to a limit
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
        30_000
      );
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
        connectWebSocket();
      }, delay);
    }
  });

  newWs.addEventListener("error", () => {
    useEventStreamStore.setState({ connectionStatus: "reconnecting" });
  });

  ws = newWs;
}

function disconnectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  reconnectAttempts = 0;
  useEventStreamStore.setState({ connectionStatus: "disconnected" });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEventStreamStore = create<EventStreamState>((set) => ({
  events: [],
  connectionStatus: "disconnected",
  isPaused: false,
  isLoadingRecent: false,
  lastOffset: null,
  filter: DEFAULT_FILTER,

  // -- Event management --

  addEvent: (event: LedgerUpdate) =>
    set((state) => {
      const newEvents = [...state.events, event];
      if (newEvents.length > MAX_EVENTS) {
        return {
          events: newEvents.slice(newEvents.length - MAX_EVENTS),
          lastOffset: event.offset,
        };
      }
      return { events: newEvents, lastOffset: event.offset };
    }),

  clearEvents: () => {
    bufferRef = [];
    set({ events: [], lastOffset: null });
  },

  // -- Stream lifecycle --

  startCollection: () => {
    // Fetch recent events via REST, then open WebSocket for live updates
    const fetchAndConnect = async () => {
      set({ isLoadingRecent: true });
      try {
        const currentFilter = useEventStreamStore.getState().filter;
        const shape = currentFilter.transactionShape ?? "LEDGER_EFFECTS";
        const response = await fetch(`/api/v1/events/recent?limit=50&shape=${shape}`);
        if (response.ok) {
          const body = await response.json();
          const recentEvents: LedgerUpdate[] = (body.data ?? []).reverse();
          if (recentEvents.length > 0) {
            set((state) => {
              // Only set if we don't already have events (avoid overwriting
              // accumulated events after a page navigation)
              if (state.events.length === 0) {
                return { events: recentEvents };
              }
              return {};
            });
          }
        }
      } catch (err) {
        console.error("Failed to load recent events:", err);
      } finally {
        set({ isLoadingRecent: false });
      }

      connectWebSocket();
    };

    fetchAndConnect();
  },

  stopCollection: () => {
    disconnectWebSocket();
  },

  reconnect: () => {
    reconnectAttempts = 0;
    connectWebSocket();
  },

  loadRecent: async () => {
    set({ isLoadingRecent: true });
    try {
      const currentFilter = useEventStreamStore.getState().filter;
      const shape = currentFilter.transactionShape ?? "LEDGER_EFFECTS";
      const response = await fetch(`/api/v1/events/recent?limit=50&shape=${shape}`);
      if (response.ok) {
        const body = await response.json();
        const recentEvents: LedgerUpdate[] = (body.data ?? []).reverse();
        if (recentEvents.length > 0) {
          set((state) => {
            const existingIds = new Set(state.events.map((e) => e.updateId));
            const newEvents = recentEvents.filter(
              (e) => !existingIds.has(e.updateId)
            );
            const combined = [...newEvents, ...state.events];
            if (combined.length > MAX_EVENTS) {
              return {
                events: combined.slice(combined.length - MAX_EVENTS),
              };
            }
            return { events: combined };
          });
        }
      }
    } catch (err) {
      console.error("Failed to load recent events:", err);
    } finally {
      set({ isLoadingRecent: false });
    }
  },

  // -- Pause / Resume --

  pause: () => {
    pausedRef = true;
    bufferRef = [];
    set({ isPaused: true });
  },

  resume: () => {
    // Flush buffered events
    if (bufferRef.length > 0) {
      const flushed = [...bufferRef];
      bufferRef = [];
      set((state) => {
        const combined = [...state.events, ...flushed];
        if (combined.length > MAX_EVENTS) {
          return {
            events: combined.slice(combined.length - MAX_EVENTS),
            isPaused: false,
          };
        }
        return { events: combined, isPaused: false };
      });
    } else {
      set({ isPaused: false });
    }
    bufferRef = [];
    pausedRef = false;
  },

  // -- Filter management --

  setFilter: (partial: Partial<EventStreamFilter>) =>
    set((state) => ({
      filter: { ...state.filter, ...partial },
    })),

  setTemplates: (templates) =>
    set((state) => ({
      filter: { ...state.filter, templates },
    })),

  setParties: (parties) =>
    set((state) => ({
      filter: {
        ...state.filter,
        parties: parties.length > 0 ? parties : undefined,
      },
    })),

  setEventTypes: (types) =>
    set((state) => ({
      filter: {
        ...state.filter,
        eventTypes: types.length > 0 ? types : undefined,
      },
    })),

  setTransactionShape: (shape) =>
    set((state) => ({
      filter: { ...state.filter, transactionShape: shape },
    })),

  resetFilter: () => set({ filter: DEFAULT_FILTER }),
}));
