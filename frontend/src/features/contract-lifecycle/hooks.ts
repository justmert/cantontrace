import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Fetch full contract lifecycle
// ---------------------------------------------------------------------------

export function useContractLifecycle(contractId: string | null) {
  return useQuery({
    queryKey: ["contract-lifecycle", contractId],
    queryFn: () => api.getContractLifecycle(contractId!).then((r) => r.data),
    enabled: !!contractId && contractId.length > 0,
    staleTime: 60_000,
    retry: false,
  });
}
