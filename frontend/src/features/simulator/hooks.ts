import { useMutation, useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  SimulationRequest,
  SimulationResult,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Simulation mutation hook
// ---------------------------------------------------------------------------

export function useSimulation() {
  return useMutation<SimulationResult, Error, SimulationRequest>({
    mutationFn: (request) => api.simulate(request).then((r) => r.data),
  });
}

// ---------------------------------------------------------------------------
// ACS-based contract autocomplete
// ---------------------------------------------------------------------------

export function useContractAutocomplete(query: string) {
  // The ACS API does not support text search. We fetch a page of contracts
  // and filter client-side. The query key includes a debounced "enabled" flag
  // but not the query itself, to avoid redundant fetches per keystroke.
  return useQuery({
    queryKey: ["acs-autocomplete"],
    queryFn: () =>
      api.getACS({
        pageSize: 50,
      }).then((r) => r.data),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    select: (data) => ({
      ...data,
      contracts: data.contracts.filter(
        (c) =>
          c.contractId.toLowerCase().includes(query.toLowerCase()) ||
          c.templateId.entityName.toLowerCase().includes(query.toLowerCase())
      ),
    }),
  });
}

// ---------------------------------------------------------------------------
// Known parties from bootstrap (for party selectors)
// ---------------------------------------------------------------------------

export function useKnownParties() {
  return useQuery({
    queryKey: ["bootstrap-parties"],
    queryFn: () => api.getBootstrap().then((r) => r.data.knownParties),
    staleTime: 5 * 60 * 1000,
  });
}
