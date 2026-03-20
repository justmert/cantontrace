import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ErrorCategory } from "@/lib/types";

// ---------------------------------------------------------------------------
// Error explanation response shape (matches backend /api/v1/errors/:errorCode)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Filter state for completions
// ---------------------------------------------------------------------------

export interface CompletionFilter {
  category?: ErrorCategory;
  party?: string;
  dateFrom?: string;
  dateTo?: string;
  pageSize?: number;
  pageToken?: string;
}

// ---------------------------------------------------------------------------
// Fetch failed completions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fetch single completion by ID
// ---------------------------------------------------------------------------

export function useCompletion(commandId: string | null) {
  return useQuery({
    queryKey: ["completion", commandId],
    queryFn: () => api.getCompletion(commandId!).then((r) => r.data),
    enabled: !!commandId,
  });
}

// ---------------------------------------------------------------------------
// Fetch error explanation from knowledge base
// ---------------------------------------------------------------------------

export function useErrorExplanation(errorCode: string | undefined) {
  return useQuery<ErrorExplanation>({
    queryKey: ["error-explanation", errorCode],
    queryFn: () => api.getErrorExplanation(errorCode!).then((r) => r.data as ErrorExplanation),
    enabled: !!errorCode,
    staleTime: 30 * 60 * 1000, // error explanations rarely change
  });
}
