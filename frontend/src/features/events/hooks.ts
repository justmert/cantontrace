import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useEventStreamStore } from "@/stores/event-stream-store";
import type { StreamConnectionStatus } from "@/stores/event-stream-store";
import type {
  EventStreamFilter,
  LedgerUpdate,
  ErrorCategory,
  Reassignment,
} from "@/lib/types";

// ===========================================================================
// Event Stream
// ===========================================================================

export type ConnectionStatus = StreamConnectionStatus;

export interface UseEventStreamReturn {
  events: LedgerUpdate[];
  status: StreamConnectionStatus;
  isPaused: boolean;
  eventCount: number;
  isLoadingRecent: boolean;
  pause: () => void;
  resume: () => void;
  clear: () => void;
  reconnect: () => void;
  loadRecent: () => void;
}

/**
 * Hook for the Event Stream page to read accumulated events and control
 * the stream. The `filter` parameter is accepted for backwards
 * compatibility but filtering is applied client-side in page.tsx -- the
 * WebSocket connection is managed at the app level by EventStreamManager.
 */
export function useEventStream(
  _filter: EventStreamFilter
): UseEventStreamReturn {
  const events = useEventStreamStore((s) => s.events);
  const connectionStatus = useEventStreamStore((s) => s.connectionStatus);
  const isPaused = useEventStreamStore((s) => s.isPaused);
  const isLoadingRecent = useEventStreamStore((s) => s.isLoadingRecent);
  const pause = useEventStreamStore((s) => s.pause);
  const resume = useEventStreamStore((s) => s.resume);
  const clearEvents = useEventStreamStore((s) => s.clearEvents);
  const reconnect = useEventStreamStore((s) => s.reconnect);
  const loadRecent = useEventStreamStore((s) => s.loadRecent);

  return {
    events,
    status: connectionStatus,
    isPaused,
    eventCount: events.length,
    isLoadingRecent,
    pause,
    resume,
    clear: clearEvents,
    reconnect,
    loadRecent,
  };
}

// ---------------------------------------------------------------------------
// Event filter hook -- reads from the Zustand store
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

export function useEventFilter(): UseEventFilterReturn {
  const filter = useEventStreamStore((s) => s.filter);
  const setTemplates = useEventStreamStore((s) => s.setTemplates);
  const setParties = useEventStreamStore((s) => s.setParties);
  const setEventTypes = useEventStreamStore((s) => s.setEventTypes);
  const setTransactionShape = useEventStreamStore(
    (s) => s.setTransactionShape
  );
  const resetFilter = useEventStreamStore((s) => s.resetFilter);

  return {
    filter,
    setTemplates,
    setParties,
    setEventTypes,
    setTransactionShape,
    reset: resetFilter,
  };
}

// ===========================================================================
// Error Debugger
// ===========================================================================

export interface ErrorExplanation {
  errorCodeId: string;
  category: ErrorCategory;
  grpcStatusCode: string;
  explanation: string;
  commonCauses: string[];
  suggestedFixes: string[];
  documentationUrl?: string;
  severity?: string;
  isRetryable?: boolean;
  debuggerHandling?: string;
}

export interface CompletionFilter {
  category?: ErrorCategory;
  party?: string;
  dateFrom?: string;
  dateTo?: string;
  pageSize?: number;
  pageToken?: string;
}

export function useCompletions(filter: CompletionFilter) {
  return useQuery({
    queryKey: ["completions", "failed", filter],
    queryFn: () =>
      api.getCompletions({
        status: "failed",
        category: filter.category,
        party: filter.party,
        dateFrom: filter.dateFrom,
        dateTo: filter.dateTo,
        pageSize: filter.pageSize ?? 50,
        pageToken: filter.pageToken,
      }).then((r) => r.data),
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useCompletion(commandId: string | null) {
  return useQuery({
    queryKey: ["completion", commandId],
    queryFn: () => api.getCompletion(commandId!).then((r) => r.data),
    enabled: !!commandId,
  });
}

export function useErrorExplanation(errorCode: string | undefined) {
  return useQuery<ErrorExplanation>({
    queryKey: ["error-explanation", errorCode],
    queryFn: () => api.getErrorExplanation(errorCode!).then((r) => r.data as ErrorExplanation),
    enabled: !!errorCode,
    staleTime: 30 * 60 * 1000, // error explanations rarely change
  });
}

// ===========================================================================
// Reassignment Tracker
// ===========================================================================

export interface ReassignmentFilter {
  contractId?: string;
  status?: Reassignment["status"];
  synchronizer?: string;
  templateName?: string;
}

export function useReassignments(filter: ReassignmentFilter) {
  return useQuery({
    queryKey: ["reassignments", filter],
    queryFn: () =>
      api.getReassignments({
        contractId: filter.contractId || undefined,
      }).then((r) => r.data),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    select: (data) => {
      let filtered = data;
      if (filter.status) {
        filtered = filtered.filter((r) => r.status === filter.status);
      }
      if (filter.synchronizer) {
        filtered = filtered.filter(
          (r) =>
            r.sourceSynchronizer
              .toLowerCase()
              .includes(filter.synchronizer!.toLowerCase()) ||
            r.targetSynchronizer
              .toLowerCase()
              .includes(filter.synchronizer!.toLowerCase())
        );
      }
      if (filter.templateName) {
        filtered = filtered.filter((r) =>
          r.templateId.entityName
            .toLowerCase()
            .includes(filter.templateName!.toLowerCase())
        );
      }
      return filtered;
    },
  });
}
