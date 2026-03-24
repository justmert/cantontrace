import { useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { CorrelationInput } from "./components/correlation-input";
import { WorkflowTimeline } from "./components/workflow-timeline";
import { WorkflowDetail } from "./components/workflow-detail";
import { useWorkflow } from "./hooks";
import type { WorkflowCorrelation } from "@/lib/types";

// ---------------------------------------------------------------------------
// Workflow Debugger Page
// ---------------------------------------------------------------------------

export default function WorkflowDebuggerPage() {
  const [correlation, setCorrelation] = useState<WorkflowCorrelation | null>(
    null
  );
  const [selectedUpdateId, setSelectedUpdateId] = useState<string | null>(null);

  const { data: timeline, isLoading, error } = useWorkflow(correlation);

  const handleSearch = useCallback((c: WorkflowCorrelation) => {
    setCorrelation(c);
    setSelectedUpdateId(null);
  }, []);

  const handleSelectTransaction = useCallback((updateId: string) => {
    setSelectedUpdateId(updateId);
  }, []);

  const selectedTransaction =
    timeline?.transactions.find((tx) => tx.updateId === selectedUpdateId) ??
    null;

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} className="size-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">Workflow Debugger</h1>
          <p className="text-xs text-muted-foreground">
            Cross-transaction workflow visualization and tracing
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">

      {/* Correlation input */}
      <CorrelationInput onSearch={handleSearch} isLoading={isLoading} />

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Failed to load workflow</p>
          <p className="mt-1 text-xs">
            {error instanceof Error ? error.message : "An unexpected error occurred"}
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
      {timeline && (
        <WorkflowDetail transaction={selectedTransaction} />
      )}
      </div>
    </div>
  );
}
