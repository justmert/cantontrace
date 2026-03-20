import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SimulationRequest } from "@/lib/types";

export function useSimulation() {
  return useMutation({
    mutationFn: (request: SimulationRequest) => api.simulate(request).then((r) => r.data),
  });
}
