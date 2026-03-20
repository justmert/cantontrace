import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { EventStreamFilter, LedgerUpdate } from "@/lib/types";

// ---------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

// ---------------------------------------------------------------------------
// Event stream WebSocket manager
// ---------------------------------------------------------------------------

/** Maximum number of events kept in memory to prevent unbounded growth. */
const MAX_EVENTS = 5_000;
/** Maximum number of events buffered while the stream is paused. */
const MAX_BUFFER = 2_000;
/** Maximum number of automatic reconnection attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 10;
/** Base delay (ms) for exponential backoff reconnection. */
const BASE_RECONNECT_DELAY = 1_000;

export interface UseEventStreamReturn {
  events: LedgerUpdate[];
  status: ConnectionStatus;
  isPaused: boolean;
  eventCount: number;
  isLoadingRecent: boolean;
  pause: () => void;
  resume: () => void;
  clear: () => void;
  reconnect: () => void;
  loadRecent: () => void;
}

export function useEventStream(filter: EventStreamFilter): UseEventStreamReturn {
  const [events, setEvents] = useState<LedgerUpdate[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [isPaused, setIsPaused] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pausedRef = useRef(false);
  const bufferRef = useRef<LedgerUpdate[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // Keep ref in sync
  pausedRef.current = isPaused;

  /**
   * Fetch recent events via REST. Returns the events and the current offset
   * so the WebSocket can resume from that point forward.
   */
  const fetchRecentEvents = useCallback(async (): Promise<{
    events: LedgerUpdate[];
    offset: string;
  }> => {
    const params: Record<string, string> = { limit: "50" };
    if (filter.parties?.length) {
      params.parties = filter.parties.join(",");
    }
    const qs = new URLSearchParams(params).toString();
    const response = await fetch(`/api/v1/events/recent?${qs}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch recent events: ${response.status}`);
    }
    const body = await response.json();
    // Events come back in descending order; reverse to show oldest-first
    const recentEvents: LedgerUpdate[] = (body.data ?? []).reverse();
    const offset: string = body.meta?.offset ?? "";
    return { events: recentEvents, offset };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Fetch all events on initial load — filtering is client-side

  const connect = useCallback(() => {
    // Clean up existing
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    setStatus("reconnecting");

    const ws = api.connectEventStream(filter, (event: LedgerUpdate) => {
      if (pausedRef.current) {
        // Cap the buffer to prevent memory leaks while paused
        if (bufferRef.current.length < MAX_BUFFER) {
          bufferRef.current.push(event);
        }
      } else {
        setEvents((prev) => {
          const next = [...prev, event];
          // Trim oldest events when exceeding the cap
          if (next.length > MAX_EVENTS) {
            return next.slice(next.length - MAX_EVENTS);
          }
          return next;
        });
      }
    });

    ws.addEventListener("open", () => {
      setStatus("connected");
      reconnectAttemptsRef.current = 0;
    });

    ws.addEventListener("close", () => {
      setStatus("disconnected");
      // Auto-reconnect with exponential backoff, up to a limit
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current),
          30_000
        );
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    });

    ws.addEventListener("error", () => {
      setStatus("reconnecting");
    });

    wsRef.current = ws;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Connect once on mount only — filters are applied client-side

  // On mount: fetch recent events via REST, then open WebSocket for live updates.
  // Does NOT re-run on filter changes — filtering is done client-side in page.tsx.
  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      setIsLoadingRecent(true);
      try {
        const { events: recentEvents } = await fetchRecentEvents();
        if (cancelled) return;
        if (recentEvents.length > 0) {
          setEvents(recentEvents);
        }
      } catch (err) {
        // Non-fatal -- we still connect to the WebSocket
        console.error("Failed to load recent events:", err);
      } finally {
        if (!cancelled) {
          setIsLoadingRecent(false);
        }
      }

      if (!cancelled) {
        connect();
      }
    }

    initialLoad();

    return () => {
      cancelled = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [connect, fetchRecentEvents]);

  const pause = useCallback(() => {
    setIsPaused(true);
    bufferRef.current = [];
  }, []);

  const resume = useCallback(() => {
    // Flush buffered events, respecting the cap
    if (bufferRef.current.length > 0) {
      setEvents((prev) => {
        const combined = [...prev, ...bufferRef.current];
        bufferRef.current = [];
        if (combined.length > MAX_EVENTS) {
          return combined.slice(combined.length - MAX_EVENTS);
        }
        return combined;
      });
    }
    bufferRef.current = [];
    setIsPaused(false);
  }, []);

  const clear = useCallback(() => {
    setEvents([]);
    bufferRef.current = [];
  }, []);

  const reconnect = useCallback(() => {
    // Manual reconnect resets the attempt counter
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  const loadRecent = useCallback(async () => {
    setIsLoadingRecent(true);
    try {
      const { events: recentEvents } = await fetchRecentEvents();
      if (recentEvents.length > 0) {
        // Prepend recent events, deduplicating by updateId
        setEvents((prev) => {
          const existingIds = new Set(prev.map((e) => e.updateId));
          const newEvents = recentEvents.filter(
            (e) => !existingIds.has(e.updateId)
          );
          const combined = [...newEvents, ...prev];
          if (combined.length > MAX_EVENTS) {
            return combined.slice(combined.length - MAX_EVENTS);
          }
          return combined;
        });
      }
    } catch (err) {
      console.error("Failed to load recent events:", err);
    } finally {
      setIsLoadingRecent(false);
    }
  }, [fetchRecentEvents]);

  return {
    events,
    status,
    isPaused,
    eventCount: events.length,
    isLoadingRecent,
    pause,
    resume,
    clear,
    reconnect,
    loadRecent,
  };
}

// ---------------------------------------------------------------------------
// Event filter state
// ---------------------------------------------------------------------------

export interface UseEventFilterReturn {
  filter: EventStreamFilter;
  setTemplates: (templates: EventStreamFilter["templates"]) => void;
  setParties: (parties: string[]) => void;
  setEventTypes: (types: string[]) => void;
  setTransactionShape: (
    shape: EventStreamFilter["transactionShape"]
  ) => void;
  reset: () => void;
}

const DEFAULT_FILTER: EventStreamFilter = {
  templates: undefined,
  parties: undefined,
  eventTypes: undefined,
  transactionShape: "ACS_DELTA",
};

export function useEventFilter(): UseEventFilterReturn {
  const [filter, setFilter] = useState<EventStreamFilter>(DEFAULT_FILTER);

  const setTemplates = useCallback(
    (templates: EventStreamFilter["templates"]) => {
      setFilter((prev) => ({ ...prev, templates }));
    },
    []
  );

  const setParties = useCallback((parties: string[]) => {
    setFilter((prev) => ({
      ...prev,
      parties: parties.length > 0 ? parties : undefined,
    }));
  }, []);

  const setEventTypes = useCallback((types: string[]) => {
    setFilter((prev) => ({
      ...prev,
      eventTypes: types.length > 0 ? types : undefined,
    }));
  }, []);

  const setTransactionShape = useCallback(
    (shape: EventStreamFilter["transactionShape"]) => {
      setFilter((prev) => ({ ...prev, transactionShape: shape }));
    },
    []
  );

  const reset = useCallback(() => {
    setFilter(DEFAULT_FILTER);
  }, []);

  return {
    filter,
    setTemplates,
    setParties,
    setEventTypes,
    setTransactionShape,
    reset,
  };
}
