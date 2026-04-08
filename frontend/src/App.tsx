import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { router } from "@/router";
import { useConnectionStore, setQueryClient } from "@/stores/connection-store";
import { useEventStreamStore } from "@/stores/event-stream-store";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Wire up query client for cache clearing on disconnect
setQueryClient(queryClient);

function AutoReconnect() {
  const checkExistingConnection = useConnectionStore(
    (s) => s.checkExistingConnection
  );

  useEffect(() => {
    checkExistingConnection();
  }, [checkExistingConnection]);

  return null;
}

/**
 * Manages the event stream WebSocket at the app level so events
 * accumulate in the Zustand store regardless of which page is active.
 * Starts collection when the ledger connection becomes "connected",
 * stops when it disconnects.
 */
function EventStreamManager() {
  const connectionStatus = useConnectionStore((s) => s.status);
  const startCollection = useEventStreamStore((s) => s.startCollection);
  const stopCollection = useEventStreamStore((s) => s.stopCollection);
  const prevStatusRef = useRef(connectionStatus);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = connectionStatus;

    if (connectionStatus === "connected" && prev !== "connected") {
      startCollection();
    } else if (connectionStatus !== "connected" && prev === "connected") {
      stopCollection();
    }
  }, [connectionStatus, startCollection, stopCollection]);

  // Cleanup on unmount (app teardown)
  useEffect(() => {
    return () => {
      stopCollection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      storageKey="cantontrace-theme"
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AutoReconnect />
          <EventStreamManager />
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
