import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TraceRequest } from "@/lib/types";

export function useTrace() {
  return useMutation({
    mutationFn: (request: TraceRequest) => api.trace(request).then((r) => r.data),
  });
}
