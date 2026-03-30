import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  GitBranchIcon,
  AlertCircleIcon,
  Route01Icon,
  ViewIcon,
  ArrowDataTransferHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

import {
  useTransaction,
  useRecentTransactions,
  usePrivacyAnalysis,
  usePartyColors,
  useWorkflow,
} from "./hooks";
import type { WorkflowCorrelation } from "@/lib/types";

// Components from transaction-explorer
import { TransactionSearch } from "./components/transaction-search";
import { TransactionTree } from "./components/transaction-tree";
import { StateDiffPanel } from "./components/state-diff";
import { TransactionMetadata } from "./components/transaction-metadata";

// Components from privacy-visualizer
import { PrivacyTree } from "./components/privacy-tree";
import { PartySelector } from "./components/party-selector";
import { VisibilityMatrix } from "./components/visibility-matrix";
import { MultiPartyComparison } from "./components/multi-party-comparison";

// Components from workflow-debugger
import { CorrelationInput } from "./components/correlation-input";
import { WorkflowTimeline } from "./components/workflow-timeline";
import { WorkflowDetail } from "./components/workflow-detail";

// ---------------------------------------------------------------------------
// Privacy Tab Content
// ---------------------------------------------------------------------------

function PrivacyTabContent({ updateId }: { updateId: string }) {
  const [selectedParties, setSelectedParties] = useState<Set<string>>(
    new Set()
  );
  const [highlightedParty, setHighlightedParty] = useState<string | null>(null);

  const {
    data: analysis,
    isLoading,
    error,
  } = usePrivacyAnalysis(updateId);

  const parties = analysis?.parties ?? [];
  const partyColors = usePartyColors(parties);

  // Initialize selected parties when analysis loads
  useEffect(() => {
    if (analysis) {
      setSelectedParties(new Set(analysis.parties));
    }
  }, [analysis]);

  const handleToggleParty = useCallback((party: string) => {
    setSelectedParties((prev) => {
      const next = new Set(prev);
      if (next.has(party)) {
        next.delete(party);
      } else {
        next.add(party);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedParties(new Set(parties));
  }, [parties]);

  const handleSelectNone = useCallback(() => {
    setSelectedParties(new Set());
  }, []);

  const handleHighlightParty = useCallback((party: string | null) => {
    setHighlightedParty(party);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="size-6" />
          <p className="text-sm text-muted-foreground">
            Loading privacy analysis...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Failed to load privacy analysis</p>
          <p className="mt-1 text-xs">
            {error instanceof Error
              ? error.message
              : "An unexpected error occurred"}
          </p>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <Empty className="h-[300px]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No privacy data available</EmptyTitle>
          <EmptyDescription>
            Privacy analysis could not be loaded for this transaction.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid h-full grid-cols-[1fr_340px] gap-4 overflow-auto p-4">
      {/* Left: visualization area */}
      <div className="flex flex-col gap-4">
        <Tabs defaultValue="tree">
          <TabsList>
            <TabsTrigger value="tree">Privacy Tree</TabsTrigger>
            <TabsTrigger value="matrix">Visibility Matrix</TabsTrigger>
            <TabsTrigger value="comparison">Multi-Party Comparison</TabsTrigger>
          </TabsList>

          <TabsContent value="tree">
            <PrivacyTree
              events={analysis.events}
              partyColors={partyColors}
              selectedParties={selectedParties}
              highlightedParty={highlightedParty}
              disclosedBoundaries={analysis.disclosedContractBoundaries}
              isLoading={isLoading}
            />
          </TabsContent>

          <TabsContent value="matrix">
            <VisibilityMatrix
              events={analysis.events}
              parties={parties}
              partyColors={partyColors}
              visibilityMatrix={analysis.visibilityMatrix}
            />
          </TabsContent>

          <TabsContent value="comparison">
            <MultiPartyComparison
              events={analysis.events}
              parties={parties}
              partyColors={partyColors}
              visibilityMatrix={analysis.visibilityMatrix}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Right: party selector sidebar */}
      <PartySelector
        parties={parties}
        partyColors={partyColors}
        selectedParties={selectedParties}
        highlightedParty={highlightedParty}
        onToggleParty={handleToggleParty}
        onSelectAll={handleSelectAll}
        onSelectNone={handleSelectNone}
        onHighlightParty={handleHighlightParty}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workflow Tab Content
// ---------------------------------------------------------------------------

function WorkflowTabContent({
  initialCorrelation,
  onNavigate,
}: {
  initialCorrelation: WorkflowCorrelation | null;
  onNavigate: (updateId: string) => void;
}) {
  const [correlation, setCorrelation] = useState<WorkflowCorrelation | null>(
    initialCorrelation
  );
  const [selectedUpdateId, setSelectedUpdateId] = useState<string | null>(null);

  // When an initialCorrelation is provided externally, sync it
  useEffect(() => {
    if (initialCorrelation) {
      setCorrelation(initialCorrelation);
    }
  }, [initialCorrelation]);

  const { data: timeline, isLoading, error } = useWorkflow(correlation);

  const handleSearch = useCallback((c: WorkflowCorrelation) => {
    setCorrelation(c);
    setSelectedUpdateId(null);
  }, []);

  const handleSelectTransaction = useCallback(
    (uid: string) => {
      setSelectedUpdateId(uid);
      onNavigate(uid);
    },
    [onNavigate]
  );

  const selectedTransaction =
    timeline?.transactions.find((tx) => tx.updateId === selectedUpdateId) ??
    null;

  return (
    <div className="flex flex-col gap-4 overflow-auto p-4">
      {/* Correlation input */}
      <CorrelationInput onSearch={handleSearch} isLoading={isLoading} />

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Failed to load workflow</p>
          <p className="mt-1 text-xs">
            {error instanceof Error
              ? error.message
              : "An unexpected error occurred"}
          </p>
        </div>
      )}

      {/* Timeline */}
      <WorkflowTimeline
        timeline={timeline}
        isLoading={isLoading}
        selectedUpdateId={selectedUpdateId}
        onSelectTransaction={handleSelectTransaction}
      />

      {/* Detail panel */}
      {timeline && <WorkflowDetail transaction={selectedTransaction} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function TransactionsPage() {
  // Read updateId from URL params (route: /transactions/$updateId)
  const params = useParams({ strict: false }) as { updateId?: string };
  const navigate = useNavigate();

  const [updateId, setUpdateId] = useState<string | null>(
    params.updateId ?? null
  );
  const [activeTab, setActiveTab] = useState("tree");
  const [workflowPopoverOpen, setWorkflowPopoverOpen] = useState(false);
  const [workflowCorrelation, setWorkflowCorrelation] =
    useState<WorkflowCorrelation | null>(null);

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

  const handleTraceWorkflow = useCallback(() => {
    setActiveTab("workflow");
    setWorkflowPopoverOpen(false);
  }, []);

  const handleWorkflowSearch = useCallback(
    (c: WorkflowCorrelation) => {
      setWorkflowCorrelation(c);
      setActiveTab("workflow");
      setWorkflowPopoverOpen(false);
    },
    []
  );

  const handleWorkflowNavigate = useCallback(
    (uid: string) => {
      handleSelect(uid);
      setActiveTab("tree");
    },
    [handleSelect]
  );

  // Build a default workflow correlation from transaction metadata if available
  const defaultWorkflowCorrelation: WorkflowCorrelation | null =
    workflowCorrelation ??
    (transaction?.workflowId
      ? { type: "workflow_id", workflowId: transaction.workflowId }
      : transaction?.traceContext?.traceParent
        ? {
            type: "trace_context",
            traceId: transaction.traceContext.traceParent,
          }
        : null);

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <PageHeader
        icon={GitBranchIcon}
        title="Transactions"
        subtitle="Explore and analyze"
      />

      {/* Search bar + Trace Workflow button */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="flex-1">
          <TransactionSearch
            currentUpdateId={updateId}
            recentTransactions={recentTransactions ?? []}
            isLoading={isLoading}
            onSelect={handleSelect}
          />
        </div>
        <Popover
          open={workflowPopoverOpen}
          onOpenChange={setWorkflowPopoverOpen}
        >
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <HugeiconsIcon
                icon={Route01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Trace Workflow
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[520px]" align="end">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Trace Workflow</p>
              <p className="text-xs text-muted-foreground">
                Enter a correlation key to trace related transactions across a
                workflow.
              </p>
              <CorrelationInput
                onSearch={handleWorkflowSearch}
                isLoading={false}
              />
              {updateId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={handleTraceWorkflow}
                >
                  <HugeiconsIcon
                    icon={Route01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  Go to Workflow tab
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
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
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  strokeWidth={2}
                  className="text-destructive"
                />
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
                  Paste a transaction update ID or use "Trace Workflow" to
                  explore cross-transaction workflows.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}

        {/* Transaction loaded */}
        {transaction && !isLoading && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Metadata (compact, always visible) */}
            <div className="shrink-0 border-b">
              <TransactionMetadata transaction={transaction} />
            </div>

            {/* Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex flex-1 flex-col overflow-hidden"
            >
              <div className="border-b px-4">
                <TabsList variant="line">
                  <TabsTrigger value="tree">
                    <HugeiconsIcon
                      icon={GitBranchIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Tree
                  </TabsTrigger>
                  <TabsTrigger value="state-diff">
                    <HugeiconsIcon
                      icon={ArrowDataTransferHorizontalIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    State Diff
                  </TabsTrigger>
                  <TabsTrigger value="privacy">
                    <HugeiconsIcon
                      icon={ViewIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Privacy
                  </TabsTrigger>
                  <TabsTrigger value="workflow">
                    <HugeiconsIcon
                      icon={Route01Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Workflow
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Tab content fills remaining space */}
              <TabsContent
                value="tree"
                className="relative min-h-[500px] flex-1"
              >
                <div className="absolute inset-0">
                  <TransactionTree transaction={transaction} />
                </div>
              </TabsContent>

              <TabsContent
                value="state-diff"
                className="min-h-0 flex-1 overflow-auto"
              >
                <StateDiffPanel stateDiff={transaction.stateDiff} />
              </TabsContent>

              <TabsContent
                value="privacy"
                className="min-h-0 flex-1 overflow-auto"
              >
                <PrivacyTabContent updateId={transaction.updateId} />
              </TabsContent>

              <TabsContent
                value="workflow"
                className="min-h-0 flex-1 overflow-auto"
              >
                <WorkflowTabContent
                  initialCorrelation={defaultWorkflowCorrelation}
                  onNavigate={handleWorkflowNavigate}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
