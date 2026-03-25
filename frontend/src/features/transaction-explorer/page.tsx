import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  GitBranchIcon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

import { useTransaction, useRecentTransactions } from "./hooks";
import { TransactionSearch } from "./components/transaction-search";
import { TransactionTree } from "./components/transaction-tree";
import { StateDiffPanel } from "./components/state-diff";
import { TransactionMetadata } from "./components/transaction-metadata";

export default function TransactionExplorerPage() {
  // Read updateId from URL params (route: /transactions/$updateId)
  const params = useParams({ strict: false }) as { updateId?: string };
  const navigate = useNavigate();

  const [updateId, setUpdateId] = useState<string | null>(
    params.updateId ?? null
  );

  // Sync URL param changes into state
  useEffect(() => {
    if (params.updateId && params.updateId !== updateId) {
      setUpdateId(params.updateId);
    }
  }, [params.updateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    data: transaction,
    isLoading,
    isError,
    error,
  } = useTransaction(updateId);

  const { data: recentTransactions } = useRecentTransactions();

  const handleSelect = useCallback(
    (uid: string) => {
      setUpdateId(uid);
      navigate({ to: "/transactions/$updateId", params: { updateId: uid } });
    },
    [navigate]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} className="size-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">Transaction Explorer</h1>
          <p className="text-xs text-muted-foreground">
            Visualize transaction trees and state changes
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="border-b px-6 py-3">
        <TransactionSearch
          currentUpdateId={updateId}
          recentTransactions={recentTransactions ?? []}
          isLoading={isLoading}
          onSelect={handleSelect}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Spinner className="size-8" />
              <p className="text-sm text-muted-foreground">
                Loading transaction...
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} className="text-destructive" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Failed to load transaction</EmptyTitle>
                <EmptyDescription>
                  {(error as Error)?.message ??
                    "The update ID may be invalid or the transaction may have been pruned."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}

        {/* Empty / welcome state */}
        {!updateId && !isLoading && !isError && (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Enter an Update ID to explore</EmptyTitle>
                <EmptyDescription>
                  Paste a transaction update ID or navigate here from the Event
                  Stream or Contract Lifecycle.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}

        {/* Transaction loaded */}
        {transaction && !isLoading && (
          <>
            {/* Tree (left — 50%) */}
            <div className="min-w-0 flex-1 overflow-hidden border-r">
              <TransactionTree transaction={transaction} />
            </div>

            {/* Right panel: State Diff + Metadata (50%) */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {/* State diff (top, scrollable) */}
              <div className="min-h-0 flex-1 overflow-y-auto border-b">
                <StateDiffPanel stateDiff={transaction.stateDiff} />
              </div>

              {/* Metadata (bottom, fixed height) */}
              <div className="h-[260px] shrink-0 overflow-y-auto">
                <TransactionMetadata transaction={transaction} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
