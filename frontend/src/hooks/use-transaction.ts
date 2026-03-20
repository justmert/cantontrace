import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useTransaction(updateId: string | undefined) {
  return useQuery({
    queryKey: ["transaction", updateId],
    queryFn: () => api.getTransaction(updateId!).then((r) => r.data),
    enabled: !!updateId,
  });
}

export function useTransactionPrivacy(updateId: string | undefined) {
  return useQuery({
    queryKey: ["transaction-privacy", updateId],
    queryFn: () => api.getTransactionPrivacy(updateId!).then((r) => r.data),
    enabled: !!updateId,
  });
}
