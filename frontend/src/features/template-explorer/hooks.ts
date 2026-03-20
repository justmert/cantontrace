import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Fetch the list of all packages on the ledger.
 */
export function usePackages() {
  return useQuery({
    queryKey: ["packages"],
    queryFn: () => api.getPackages().then((r) => r.data),
    staleTime: 5 * 60 * 1000, // packages rarely change
  });
}

/**
 * Fetch the parsed detail (modules, templates, choices) for a single package.
 */
export function usePackageDetail(packageId: string | null) {
  return useQuery({
    queryKey: ["package-detail", packageId],
    queryFn: () => api.getPackageTemplates(packageId!).then((r) => r.data),
    enabled: !!packageId,
    staleTime: 10 * 60 * 1000,
  });
}
