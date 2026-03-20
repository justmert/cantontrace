import { useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { useEventStreamStore } from "@/stores/event-stream-store";
import { useConnectionStore } from "@/stores/connection-store";
import type { LedgerUpdate } from "@/lib/types";

export function useEventStream() {
  const wsRef = useRef<WebSocket | null>(null);
  const connectionStatus = useConnectionStore((s) => s.status);
  const { isStreaming, addEvent, startStream, stopStream } =
    useEventStreamStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (connectionStatus !== "connected") return;

    wsRef.current = api.createEventStreamConnection(
      (data) => {
        addEvent(data as LedgerUpdate);
      },
      () => {
        stopStream();
      },
      () => {
        stopStream();
      }
    );

    startStream();
  }, [connectionStatus, addEvent, startStream, stopStream]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopStream();
  }, [stopStream]);

  // Only react to connection status changes, not isStreaming.
  // Including isStreaming in deps would cause an infinite loop:
  // connect() -> startStream() -> isStreaming=true -> re-trigger effect.
  useEffect(() => {
    if (connectionStatus === "connected") {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [connectionStatus, connect, disconnect]);

  return {
    isStreaming,
    connect,
    disconnect,
  };
}
