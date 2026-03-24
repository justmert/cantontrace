import { useState, useEffect } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { GitCommitHorizontalIcon } from "@hugeicons/core-free-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from "@/components/ui/empty";
import { LifecycleSearch } from "./components/lifecycle-search";
import { LifecycleTimeline } from "./components/lifecycle-timeline";
import { useContractLifecycle } from "./hooks";

export default function ContractLifecyclePage() {
  // Read contract ID from URL params (route: /contracts/$contractId)
  const params = useParams({ strict: false }) as { contractId?: string };
  const navigate = useNavigate();

  const [contractId, setContractId] = useState(params.contractId ?? "");

  // Sync from URL param on mount / param change
  useEffect(() => {
    if (params.contractId && params.contractId !== contractId) {
      setContractId(params.contractId);
    }
  }, [params.contractId]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    data: lifecycle,
    isLoading,
    isError,
    error,
  } = useContractLifecycle(contractId || null);

  const handleSearch = (id: string) => {
    setContractId(id);
    // Update URL to reflect the selected contract
    navigate({ to: "/contracts/$contractId", params: { contractId: id } });
  };

  const handleNavigateTransaction = (updateId: string) => {
    if (updateId) {
      navigate({ to: "/transactions/$updateId", params: { updateId } });
    }
  };

  const handleNavigateContract = (id: string) => {
    handleSearch(id);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <HugeiconsIcon icon={GitCommitHorizontalIcon} strokeWidth={2} className="size-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">Contract Lifecycle Tracker</h1>
          <p className="text-xs text-muted-foreground">
            Trace a contract from creation through exercises to archival
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-auto p-4">

      {/* Search */}
      <LifecycleSearch
        contractId={contractId}
        onSearch={handleSearch}
        isLoading={isLoading}
      />

      {/* Content */}
      {!contractId ? (
        <Empty className="flex-1 py-16">
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={GitCommitHorizontalIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyDescription>
              Enter a contract ID above to view its lifecycle
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : isLoading ? (
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex flex-col gap-6">
            {/* Summary bar skeleton */}
            <Skeleton className="h-12 w-full rounded-lg" />
            {/* Event card skeletons */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-0">
                {/* Dot */}
                <div className="flex w-10 flex-shrink-0 flex-col items-center">
                  <Skeleton className="size-10 rounded-full" />
                  {i < 2 && <Skeleton className="w-0.5 flex-1" />}
                </div>
                {/* Card */}
                <div className="ml-4 flex-1">
                  <Skeleton className="h-24 w-full rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <span className="text-lg font-semibold text-destructive">
              !
            </span>
          </div>
          <p className="text-sm font-medium">Failed to load contract lifecycle</p>
          <p className="text-xs text-muted-foreground">
            {(error as Error)?.message ?? "The contract may not exist or may have been pruned."}
          </p>
        </div>
      ) : lifecycle ? (
        <div className="mx-auto w-full max-w-3xl">
          <LifecycleTimeline
            lifecycle={lifecycle}
            onNavigateTransaction={handleNavigateTransaction}
            onNavigateContract={handleNavigateContract}
          />
        </div>
      ) : null}
      </div>
    </div>
  );
}
