import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useCompletions(params?: {
  status?: string;
  pageSize?: number;
  pageToken?: string;
}) {
  return useQuery({
    queryKey: ["completions", params],
    queryFn: () => api.getCompletions(params).then((r) => r.data),
    staleTime: 5_000,
  });
}

export function useCompletion(commandId: string | undefined) {
  return useQuery({
    queryKey: ["completion", commandId],
    queryFn: () => api.getCompletion(commandId!).then((r) => r.data),
    enabled: !!commandId,
  });
}
