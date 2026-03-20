import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function usePackages(enabled = true) {
  return useQuery({
    queryKey: ["packages"],
    queryFn: () => api.getPackages().then((r) => r.data),
    enabled,
    staleTime: 60_000,
  });
}

export function usePackageDetail(packageId: string | undefined) {
  return useQuery({
    queryKey: ["package", packageId],
    queryFn: () => api.getPackageTemplates(packageId!).then((r) => r.data),
    enabled: !!packageId,
    staleTime: 120_000,
  });
}
