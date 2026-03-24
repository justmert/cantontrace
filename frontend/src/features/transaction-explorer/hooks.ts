import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TransactionDetail } from "@/lib/types";

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
