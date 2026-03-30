import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  TransactionDetail,
  PrivacyAnalysis,
  WorkflowCorrelation,
} from "@/lib/types";

// ===========================================================================
// Transaction Explorer
// ===========================================================================

/**
 * Fetch a single transaction by update ID.
 */
export function useTransaction(updateId: string | null) {
  return useQuery<TransactionDetail>({
    queryKey: ["transaction", updateId],
    queryFn: () => api.getTransaction(updateId!).then((r) => r.data),
    enabled: !!updateId,
    retry: 1,
    staleTime: 60 * 1000,
  });
}

/**
 * Recent transaction from the /recent endpoint.
 * Contains the update ID and a summary for display in the dropdown.
 */
export interface RecentTransaction {
  updateId: string;
  offset: string;
  recordTime: string;
  commandId?: string;
  eventCount: number;
  eventTypes: string[];
}

/**
 * Fetch recent transactions using descending_order + end_inclusive.
 * Returns rich summaries for display in the transaction combobox.
 */
export function useRecentTransactions(limit: number = 20) {
  return useQuery<RecentTransaction[]>({
    queryKey: ["recent-transactions", limit],
    queryFn: async () => {
      const response = await fetch(`/api/v1/transactions/recent?limit=${limit}`);
      if (!response.ok) return [];
      const json = await response.json();
      return (json.data ?? []).map(
        (u: {
          updateId: string;
          offset: string;
          recordTime: string;
          commandId?: string;
          events: Array<{ eventType: string; templateId?: string }>;
        }): RecentTransaction => ({
          updateId: u.updateId,
          offset: u.offset,
          recordTime: u.recordTime,
          commandId: u.commandId,
          eventCount: u.events?.length ?? 0,
          eventTypes: [
            ...new Set(
              (u.events ?? []).map((e) => e.eventType).filter(Boolean)
            ),
          ],
        })
      );
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

// ===========================================================================
// Privacy Visualizer
// ===========================================================================

export function usePrivacyAnalysis(updateId: string | null) {
  return useQuery({
    queryKey: ["privacy-analysis", updateId],
    retry: false,
    queryFn: async (): Promise<PrivacyAnalysis> => {
      const raw = await api.getTransactionPrivacy(updateId!).then((r) => r.data);

      // The backend returns visibilityMatrix keyed as party -> eventId[].
      // Frontend components expect eventId -> party[].  Invert if needed.
      const inverted = invertVisibilityMatrix(raw.visibilityMatrix, raw.parties);

      return { ...raw, visibilityMatrix: inverted };
    },
    enabled: !!updateId && updateId.length > 0,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Invert visibilityMatrix from party->eventIds[] to eventId->parties[]
// ---------------------------------------------------------------------------

function invertVisibilityMatrix(
  matrix: Record<string, string[]>,
  parties: string[]
): Record<string, string[]> {
  // Detect which shape we received.
  // If the keys are party names (i.e. every key appears in the parties array)
  // then we need to invert.  Otherwise it's already eventId-keyed.
  const keys = Object.keys(matrix);
  if (keys.length === 0) return matrix;

  const allKeysAreParties = keys.every((k) => parties.includes(k));

  if (!allKeysAreParties) {
    // Already eventId -> parties[]
    return matrix;
  }

  // Invert: party -> eventIds[]  =>  eventId -> parties[]
  const result: Record<string, string[]> = {};
  for (const [party, eventIds] of Object.entries(matrix)) {
    for (const eid of eventIds) {
      if (!result[eid]) result[eid] = [];
      result[eid].push(party);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Assign consistent colors to parties
// ---------------------------------------------------------------------------

const PARTY_COLORS = [
  { bg: "bg-blue-500", text: "text-blue-500", ring: "ring-blue-500", hex: "#3b82f6" },
  { bg: "bg-emerald-500", text: "text-emerald-500", ring: "ring-emerald-500", hex: "#10b981" },
  { bg: "bg-amber-500", text: "text-amber-500", ring: "ring-amber-500", hex: "#f59e0b" },
  { bg: "bg-purple-500", text: "text-purple-500", ring: "ring-purple-500", hex: "#a855f7" },
  { bg: "bg-rose-500", text: "text-rose-500", ring: "ring-rose-500", hex: "#f43f5e" },
  { bg: "bg-cyan-500", text: "text-cyan-500", ring: "ring-cyan-500", hex: "#06b6d4" },
  { bg: "bg-orange-500", text: "text-orange-500", ring: "ring-orange-500", hex: "#f97316" },
  { bg: "bg-indigo-500", text: "text-indigo-500", ring: "ring-indigo-500", hex: "#6366f1" },
  { bg: "bg-pink-500", text: "text-pink-500", ring: "ring-pink-500", hex: "#ec4899" },
  { bg: "bg-teal-500", text: "text-teal-500", ring: "ring-teal-500", hex: "#14b8a6" },
];

export interface PartyColor {
  bg: string;
  text: string;
  ring: string;
  hex: string;
}

export function usePartyColors(parties: string[]): Record<string, PartyColor> {
  return useMemo(() => {
    const colorMap: Record<string, PartyColor> = {};
    const sorted = [...parties].sort();
    sorted.forEach((party, idx) => {
      colorMap[party] = PARTY_COLORS[idx % PARTY_COLORS.length];
    });
    return colorMap;
  }, [parties]);
}

// ===========================================================================
// Workflow Debugger
// ===========================================================================

export function useWorkflow(correlation: WorkflowCorrelation | null) {
  return useQuery({
    queryKey: ["workflow", correlation],
    queryFn: () => api.getWorkflows(correlation!).then((r) => r.data),
    enabled: !!correlation,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
