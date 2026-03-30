import { useCallback, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useConnectionStore } from "@/stores/connection-store";
import type {
  ACSQueryParams,
  TemplateId,
} from "@/lib/types";

/** Stable empty array to avoid re-render loops in Zustand selectors. */
const EMPTY_PARTIES: string[] = [];

// ---------------------------------------------------------------------------
// Time-travel offset management
// ---------------------------------------------------------------------------

export interface TimeTravelState {
  offset: string | undefined;
  isHistorical: boolean;
  setOffset: (offset: string | undefined) => void;
  setCurrent: () => void;
}

export function useTimeTravelOffset(): TimeTravelState {
  const [offset, setOffsetRaw] = useState<string | undefined>(undefined);

  const setOffset = useCallback((next: string | undefined) => {
    setOffsetRaw(next === "" ? undefined : next);
  }, []);

  const setCurrent = useCallback(() => {
    setOffsetRaw(undefined);
  }, []);

  return {
    offset,
    isHistorical: offset !== undefined,
    setOffset,
    setCurrent,
  };
}

// ---------------------------------------------------------------------------
// ACS query hook
// ---------------------------------------------------------------------------

export interface ACSFilterState {
  templateFilter: TemplateId[];
  partyFilter: string[];
  searchContractId: string;
  pageSize: number;
  pageToken: string | undefined;
}

export function useACS(
  filters: ACSFilterState,
  offset: string | undefined
) {
  // Pull knownParties from the connection store so the backend always
  // receives at least one party (avoids the 400 MISSING_PARTIES error).
  const knownParties = useConnectionStore(
    (s) => s.bootstrap?.knownParties ?? EMPTY_PARTIES
  );

  // Determine effective party list:
  // 1. Explicit filter selection from the user takes priority.
  // 2. Fall back to knownParties from bootstrap (populated by
  //    PartyManagementService.ListKnownParties on the backend).
  const effectiveParties =
    filters.partyFilter.length > 0 ? filters.partyFilter : knownParties;

  const params: ACSQueryParams = {
    offset,
    templateFilter:
      filters.templateFilter.length > 0 ? filters.templateFilter : undefined,
    partyFilter:
      effectiveParties.length > 0 ? effectiveParties : undefined,
    pageSize: filters.pageSize,
    pageToken: filters.pageToken,
  };

  return useQuery({
    queryKey: ["acs", params],
    queryFn: () => api.getACS(params).then((r) => r.data),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

// ---------------------------------------------------------------------------
// Package list for filter dropdowns
// ---------------------------------------------------------------------------

export function usePackageSummaries() {
  return useQuery({
    queryKey: ["packages-summary"],
    queryFn: () => api.getPackages().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Fetch full contract lifecycle
// ---------------------------------------------------------------------------

export function useContractLifecycle(contractId: string | null) {
  return useQuery({
    queryKey: ["contract-lifecycle", contractId],
    queryFn: () => api.getContractLifecycle(contractId!).then((r) => r.data),
    enabled: !!contractId && contractId.length > 0,
    staleTime: 60_000,
    retry: false,
  });
}
