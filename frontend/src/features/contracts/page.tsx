import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { DatabaseIcon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useConnectionStore } from "@/stores/connection-store";
import { useACSFilterStore } from "@/stores/acs-filter-store";
import type { ActiveContract, TemplateId } from "@/lib/types";
import { useACS, useTimeTravelOffset } from "./hooks";
import { FilterBar } from "./components/filter-bar";
import { ContractTable } from "./components/contract-table";
import { ContractDetail } from "./components/contract-detail";
import { TimeTravel } from "./components/time-travel";

type StatusFilter = "active" | "all" | "archived";

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

export default function ContractsPage() {
  // Read contract ID from URL params (route: /contracts/$contractId)
  const params = useParams({ strict: false }) as {
    contractId?: string;
  };
  const navigate = useNavigate();

  // Track whether the page was opened via a direct contractId URL so we can
  // default to the lifecycle tab and auto-select the contract.
  const [urlContractId] = useState(params.contractId);

  // Time-travel
  const timeTravel = useTimeTravelOffset();

  // Filter state -- persisted in Zustand so filters survive navigation
  const selectedTemplate = useACSFilterStore((s) => s.selectedTemplate);
  const selectedParty = useACSFilterStore((s) => s.selectedParty);
  const searchContractId = useACSFilterStore((s) => s.searchContractId);
  const storeSetTemplate = useACSFilterStore((s) => s.setSelectedTemplate);
  const storeSetParty = useACSFilterStore((s) => s.setSelectedParty);
  const storeSetSearch = useACSFilterStore((s) => s.setSearchContractId);
  const storeClearFilters = useACSFilterStore((s) => s.clearFilters);

  // Read optional ?party= query param to pre-set the party filter
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const partyParam = searchParams.get("party");
    if (partyParam) {
      storeSetParty(partyParam);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pagination
  const [pageTokenStack, setPageTokenStack] = useState<string[]>([]);
  const [currentPageToken, setCurrentPageToken] = useState<
    string | undefined
  >(undefined);

  // Selected contract
  const [selectedContract, setSelectedContract] =
    useState<ActiveContract | null>(null);

  // Which tab to show on the detail panel
  const [detailTab, setDetailTab] = useState<"details" | "lifecycle">("details");

  // Status filter: active-only (ACS default), all, or archived-only
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  // Derive filter values from the UI state (computed each render, no split)
  const templateFilter: TemplateId[] = useMemo(
    () =>
      selectedTemplate !== "__all__"
        ? [parseTemplateKey(selectedTemplate)]
        : [],
    [selectedTemplate]
  );

  const partyFilter: string[] = useMemo(
    () => (selectedParty !== "__all__" ? [selectedParty] : []),
    [selectedParty]
  );

  // Data fetching -- filter values are in the query key, so TanStack Query
  // auto-refetches whenever they change.
  const {
    data: acsData,
    isLoading: acsLoading,
    isFetching: acsFetching,
  } = useACS(
    {
      templateFilter,
      partyFilter,
      searchContractId,
      pageSize: 50,
      pageToken: currentPageToken,
    },
    timeTravel.offset
  );

  // When navigating to /contracts/$contractId, auto-select the contract
  // from the loaded ACS data once it's available.
  useEffect(() => {
    if (urlContractId && acsData && !selectedContract) {
      const found = acsData.contracts.find(
        (c) => c.contractId === urlContractId
      );
      if (found) {
        setSelectedContract(found);
      } else {
        // Contract may not be in the current ACS page — create a placeholder
        // so the detail panel opens with the lifecycle tab showing.
        setSelectedContract({
          contractId: urlContractId,
          templateId: { packageName: "", moduleName: "", entityName: "" },
          signatories: [],
          observers: [],
          payload: {},
          createdAt: "",
        });
      }
    }
  }, [urlContractId, acsData, selectedContract]);

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

  // Reset pagination when filters change
  const handleTemplateChange = useCallback(
    (value: string) => {
      storeSetTemplate(value);
      setPageTokenStack([]);
      setCurrentPageToken(undefined);
    },
    [storeSetTemplate]
  );

  const handlePartyChange = useCallback(
    (value: string) => {
      storeSetParty(value);
      setPageTokenStack([]);
      setCurrentPageToken(undefined);
    },
    [storeSetParty]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      storeSetSearch(value);
      // Do NOT reset pagination for contract ID search since it's client-side
    },
    [storeSetSearch]
  );

  const handleClear = useCallback(() => {
    storeClearFilters();
    setPageTokenStack([]);
    setCurrentPageToken(undefined);
  }, [storeClearFilters]);

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

  // When a contract is selected from the table, update URL and show details
  const handleSelectContract = useCallback(
    (contract: ActiveContract) => {
      setSelectedContract(contract);
      setDetailTab("details");
      navigate({
        to: "/contracts/$contractId",
        params: { contractId: contract.contractId },
        replace: true,
      });
    },
    [navigate]
  );

  // When the detail panel is closed, go back to /contracts
  const handleCloseDetail = useCallback(() => {
    setSelectedContract(null);
    navigate({ to: "/contracts", replace: true });
  }, [navigate]);

  // Client-side contract ID prefix filter
  const filteredContracts = useMemo(() => {
    if (!acsData) return [];
    if (!searchContractId) return acsData.contracts;
    const prefix = searchContractId.toLowerCase();
    return acsData.contracts.filter((c) =>
      c.contractId.toLowerCase().startsWith(prefix)
    );
  }, [acsData, searchContractId]);

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <PageHeader
        icon={DatabaseIcon}
        title="Contracts"
        subtitle="Browse and inspect active contracts on the ledger"
      />

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

        {/* Filter bar -- instant filtering, no Apply button */}
        <div className="flex items-center gap-3">
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
            onTemplateChange={handleTemplateChange}
            onPartyChange={handlePartyChange}
            onSearchChange={handleSearchChange}
            onClear={handleClear}
          />
          {/* Status filter toggle */}
          <div className="flex shrink-0 items-center rounded-md border">
            {(["active", "all", "archived"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 rounded-none px-2.5 text-xs capitalize first:rounded-l-md last:rounded-r-md",
                  statusFilter === s &&
                    "bg-muted text-foreground"
                )}
                onClick={() => setStatusFilter(s)}
              >
                {s === "active" ? "Active Only" : s === "all" ? "All" : "Archived"}
              </Button>
            ))}
          </div>
        </div>

        {/* Archived-only info message */}
        {statusFilter === "archived" && (
          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="text-xs text-primary/80">
              <p className="font-medium">Archived contracts are not in the Active Contract Set.</p>
              <p className="mt-1 text-muted-foreground">
                To find archived contracts, search by Contract ID above and view the
                contract{"'"}s Lifecycle tab, or browse the{" "}
                <a href="/transactions" className="font-medium text-primary underline underline-offset-2">
                  Transactions
                </a>{" "}
                page.
              </p>
            </div>
          </div>
        )}

        {/* Main content area: table + optional detail panel */}
        <div className="flex flex-1 gap-0 overflow-hidden rounded-lg border">
          <div
            className={cn(
              "flex-1 overflow-auto",
              selectedContract && "max-w-[60%]"
            )}
          >
            {statusFilter !== "archived" ? (
              <ContractTable
                contracts={filteredContracts}
                isLoading={acsLoading}
                selectedContractId={
                  selectedContract?.contractId ?? null
                }
                hasNextPage={!!acsData?.nextPageToken}
                hasPrevPage={pageTokenStack.length > 0}
                onSelectContract={handleSelectContract}
                onNextPage={handleNextPage}
                onPrevPage={handlePrevPage}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-12">
                <p className="text-sm text-muted-foreground">
                  Use the Contract ID search and Lifecycle tab to inspect archived contracts.
                </p>
              </div>
            )}
          </div>

          {selectedContract && (
            <div className="w-[40%] min-w-[320px]">
              <ContractDetail
                contract={selectedContract}
                onClose={handleCloseDetail}
                defaultTab={detailTab}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
