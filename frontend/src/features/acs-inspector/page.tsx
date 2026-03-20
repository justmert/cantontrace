import { useState, useCallback, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { DatabaseIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection-store";
import type { ActiveContract, TemplateId } from "@/lib/types";
import { useACS, useTimeTravelOffset } from "./hooks";
import { FilterBar } from "./components/filter-bar";
import { ContractTable } from "./components/contract-table";
import { ContractDetail } from "./components/contract-detail";
import { TimeTravel } from "./components/time-travel";

/** Stable empty array to avoid re-render loops in Zustand selectors. */
const EMPTY_PARTIES: string[] = [];

/** Serialize a TemplateId to a stable string key for use as select values / map keys. */
function templateKey(t: TemplateId): string {
  return `${t.packageName}:${t.moduleName}:${t.entityName}`;
}

/** Parse a templateKey string back into a TemplateId object. */
function parseTemplateKey(key: string): TemplateId {
  const [packageName = "", moduleName = "", entityName = ""] = key.split(":");
  return { packageName, moduleName, entityName };
}

export default function ACSInspectorPage() {
  // Time-travel
  const timeTravel = useTimeTravelOffset();

  // Filter state
  const [selectedTemplate, setSelectedTemplate] = useState("__all__");
  const [selectedParty, setSelectedParty] = useState("__all__");
  const [searchContractId, setSearchContractId] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<{
    templateFilter: TemplateId[];
    partyFilter: string[];
    searchContractId: string;
  }>({
    templateFilter: [],
    partyFilter: [],
    searchContractId: "",
  });

  // Pagination
  const [pageTokenStack, setPageTokenStack] = useState<string[]>([]);
  const [currentPageToken, setCurrentPageToken] = useState<
    string | undefined
  >(undefined);

  // Selected contract
  const [selectedContract, setSelectedContract] =
    useState<ActiveContract | null>(null);

  // Data fetching
  const {
    data: acsData,
    isLoading: acsLoading,
    isFetching: acsFetching,
  } = useACS(
    {
      ...appliedFilters,
      pageSize: 50,
      pageToken: currentPageToken,
    },
    timeTravel.offset
  );

  // Known parties from the connection store (primary source, populated at connect time)
  const knownParties = useConnectionStore(
    (s) => s.bootstrap?.knownParties ?? EMPTY_PARTIES
  );

  // Parties derived from loaded contracts as a supplementary source
  const contractParties = useMemo(() => {
    if (!acsData) return [];
    const set = new Set<string>();
    for (const c of acsData.contracts) {
      for (const s of c.signatories) set.add(s);
      for (const o of c.observers) set.add(o);
    }
    return Array.from(set).sort();
  }, [acsData]);

  // Merge both sources to populate the party filter dropdown
  const parties = useMemo(() => {
    const set = new Set([...knownParties, ...contractParties]);
    return Array.from(set).sort();
  }, [knownParties, contractParties]);

  // Derive unique templates from loaded contracts for the template filter dropdown
  const templateOptions = useMemo(() => {
    if (!acsData) return [];
    const seen = new Map<string, TemplateId>();
    for (const c of acsData.contracts) {
      const key = templateKey(c.templateId);
      if (!seen.has(key)) {
        seen.set(key, c.templateId);
      }
    }
    return Array.from(seen.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, tid]) => ({ key, ...tid }));
  }, [acsData]);

  // Handlers
  const handleApply = useCallback(() => {
    // Convert selectedTemplate into a TemplateId[] for the API query.
    const templateFilter: TemplateId[] =
      selectedTemplate !== "__all__"
        ? [parseTemplateKey(selectedTemplate)]
        : [];

    setAppliedFilters({
      templateFilter,
      partyFilter:
        selectedParty !== "__all__" ? [selectedParty] : [],
      searchContractId,
    });
    setPageTokenStack([]);
    setCurrentPageToken(undefined);
  }, [selectedTemplate, selectedParty, searchContractId]);

  const handleClear = useCallback(() => {
    setSelectedTemplate("__all__");
    setSelectedParty("__all__");
    setSearchContractId("");
    setAppliedFilters({
      templateFilter: [],
      partyFilter: [],
      searchContractId: "",
    });
    setPageTokenStack([]);
    setCurrentPageToken(undefined);
  }, []);

  const handleNextPage = useCallback(() => {
    if (acsData?.nextPageToken) {
      setPageTokenStack((prev) => [
        ...prev,
        currentPageToken ?? "__first__",
      ]);
      setCurrentPageToken(acsData.nextPageToken);
    }
  }, [acsData, currentPageToken]);

  const handlePrevPage = useCallback(() => {
    setPageTokenStack((prev) => {
      const next = [...prev];
      const token = next.pop();
      // Use queueMicrotask to avoid calling a state setter inside another
      // setter's updater function, which can lead to stale closures.
      queueMicrotask(() => {
        setCurrentPageToken(
          token === "__first__" ? undefined : token
        );
      });
      return next;
    });
  }, []);

  // Client-side contract ID prefix filter
  const filteredContracts = useMemo(() => {
    if (!acsData) return [];
    if (!appliedFilters.searchContractId) return acsData.contracts;
    const prefix = appliedFilters.searchContractId.toLowerCase();
    return acsData.contracts.filter((c) =>
      c.contractId.toLowerCase().startsWith(prefix)
    );
  }, [acsData, appliedFilters.searchContractId]);

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <HugeiconsIcon icon={DatabaseIcon} strokeWidth={2} className="size-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">ACS Inspector</h1>
          <p className="text-xs text-muted-foreground">
            Browse and inspect active contracts on the ledger
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
        {/* Time travel controls */}
        <TimeTravel
          currentOffset={timeTravel.offset}
          isHistorical={timeTravel.isHistorical}
          isPruned={acsData?.isPruned ?? false}
          prunedBefore={acsData?.prunedBefore}
          onSetOffset={timeTravel.setOffset}
          onSetCurrent={timeTravel.setCurrent}
        />

        {/* Filter bar */}
        <FilterBar
          templateOptions={templateOptions}
          parties={parties}
          selectedTemplate={selectedTemplate}
          selectedParty={selectedParty}
          searchContractId={searchContractId}
          resultCount={
            acsData ? filteredContracts.length : undefined
          }
          isLoading={acsLoading || acsFetching}
          onTemplateChange={setSelectedTemplate}
          onPartyChange={setSelectedParty}
          onSearchChange={setSearchContractId}
          onApply={handleApply}
          onClear={handleClear}
        />

        {/* Main content area: table + optional detail panel */}
        <div className="flex flex-1 gap-0 overflow-hidden rounded-lg border">
          <div
            className={cn(
              "flex-1 overflow-auto",
              selectedContract && "max-w-[60%]"
            )}
          >
            <ContractTable
              contracts={filteredContracts}
              isLoading={acsLoading}
              selectedContractId={
                selectedContract?.contractId ?? null
              }
              hasNextPage={!!acsData?.nextPageToken}
              hasPrevPage={pageTokenStack.length > 0}
              onSelectContract={setSelectedContract}
              onNextPage={handleNextPage}
              onPrevPage={handlePrevPage}
            />
          </div>

          {selectedContract && (
            <div className="w-[40%] min-w-[320px]">
              <ContractDetail
                contract={selectedContract}
                onClose={() => setSelectedContract(null)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
