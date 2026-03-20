import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Reassignment } from "@/lib/types";

// ---------------------------------------------------------------------------
// Filter state for reassignments
// ---------------------------------------------------------------------------

export interface ReassignmentFilter {
  contractId?: string;
  status?: Reassignment["status"];
  synchronizer?: string;
  templateName?: string;
}

// ---------------------------------------------------------------------------
// Fetch reassignment events
// ---------------------------------------------------------------------------

export function useReassignments(filter: ReassignmentFilter) {
  return useQuery({
    queryKey: ["reassignments", filter],
    queryFn: () =>
      api.getReassignments({
        contractId: filter.contractId || undefined,
      }).then((r) => r.data),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    select: (data) => {
      let filtered = data;
      if (filter.status) {
        filtered = filtered.filter((r) => r.status === filter.status);
      }
      if (filter.synchronizer) {
        filtered = filtered.filter(
          (r) =>
            r.sourceSynchronizer
              .toLowerCase()
              .includes(filter.synchronizer!.toLowerCase()) ||
            r.targetSynchronizer
              .toLowerCase()
              .includes(filter.synchronizer!.toLowerCase())
        );
      }
      if (filter.templateName) {
        filtered = filtered.filter((r) =>
          r.templateId.entityName
            .toLowerCase()
            .includes(filter.templateName!.toLowerCase())
        );
      }
      return filtered;
    },
  });
}
