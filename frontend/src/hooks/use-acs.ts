import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ACSQueryParams } from "@/lib/types";

export function useACS(params: ACSQueryParams, enabled = true) {
  return useQuery({
    queryKey: ["acs", params],
    queryFn: () => api.getACS(params).then((r) => r.data),
    enabled,
    staleTime: 10_000,
  });
}

export function useContract(contractId: string | undefined) {
  return useQuery({
    queryKey: ["contract", contractId],
    queryFn: () => api.getContract(contractId!).then((r) => r.data),
    enabled: !!contractId,
  });
}
