import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { WorkflowCorrelation } from "@/lib/types";

// ---------------------------------------------------------------------------
// Fetch workflow timeline by correlation
// ---------------------------------------------------------------------------

export function useWorkflow(correlation: WorkflowCorrelation | null) {
  return useQuery({
    queryKey: ["workflow", correlation],
    queryFn: () => api.getWorkflows(correlation!).then((r) => r.data),
    enabled: !!correlation,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
