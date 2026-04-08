import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  GitCompareIcon,
  ArrowRight01Icon,
  Tick02Icon,
  Cancel01Icon,
  Add01Icon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, truncateId } from "@/lib/utils";
import type {
  SimulationResult,
  SimulationRequest,
} from "@/lib/types";
import { CommandBuilder } from "./command-builder";
import { useSimulation } from "@/features/debugger/hooks";

// ---------------------------------------------------------------------------
// Diff row
// ---------------------------------------------------------------------------

function DiffRow({
  label,
  original,
  modified,
}: {
  label: string;
  original: string;
  modified: string;
}) {
  const changed = original !== modified;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2 text-xs",
        changed
          ? "border-accent-foreground/20 bg-accent/30"
          : "border-border bg-card"
      )}
    >
      <span className="w-24 flex-shrink-0 text-muted-foreground">{label}</span>
      <span className="flex-1 font-mono">{original}</span>
      {changed && (
        <>
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3 flex-shrink-0 text-accent-foreground" strokeWidth={2} />
          <span className="flex-1 font-mono font-semibold text-accent-foreground">
            {modified}
          </span>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side-by-side result comparison
// ---------------------------------------------------------------------------

function ResultComparison({
  original,
  modified,
}: {
  original: SimulationResult;
  modified: SimulationResult;
}) {
  const origOutputs = original.transactionTree?.stateDiff.outputs ?? [];
  const modOutputs = modified.transactionTree?.stateDiff.outputs ?? [];

  // Find differences in outputs
  const origOutputIds = new Set(origOutputs.map((c) => c.contractId));
  const modOutputIds = new Set(modOutputs.map((c) => c.contractId));

  return (
    <div className="flex flex-col gap-4">
      {/* Status comparison */}
      <div className="grid grid-cols-2 gap-4">
        <div
          className={cn(
            "flex flex-col items-center gap-2 rounded-2xl border p-4",
            original.success
              ? "border-primary/20 bg-primary/5"
              : "border-destructive/20 bg-destructive/5"
          )}
        >
          <Badge variant="outline" className="text-xs">
            Original
          </Badge>
          {original.success ? (
            <HugeiconsIcon icon={Tick02Icon} className="size-6 text-primary" strokeWidth={2} />
          ) : (
            <HugeiconsIcon icon={Cancel01Icon} className="size-6 text-destructive" strokeWidth={2} />
          )}
          <span className="text-xs font-medium">
            {original.success ? "Success" : "Failed"}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            offset {original.atOffset}
          </span>
        </div>

        <div
          className={cn(
            "flex flex-col items-center gap-2 rounded-2xl border p-4",
            modified.success
              ? "border-primary/20 bg-primary/5"
              : "border-destructive/20 bg-destructive/5"
          )}
        >
          <Badge variant="outline" className="text-xs">
            Modified
          </Badge>
          {modified.success ? (
            <HugeiconsIcon icon={Tick02Icon} className="size-6 text-primary" strokeWidth={2} />
          ) : (
            <HugeiconsIcon icon={Cancel01Icon} className="size-6 text-destructive" strokeWidth={2} />
          )}
          <span className="text-xs font-medium">
            {modified.success ? "Success" : "Failed"}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            offset {modified.atOffset}
          </span>
        </div>
      </div>

      {/* Output differences */}
      {(origOutputs.length > 0 || modOutputs.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Output Differences</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5">
              {/* Outputs only in original */}
              {origOutputs
                .filter((c) => !modOutputIds.has(c.contractId))
                .map((c) => (
                  <div
                    key={c.contractId}
                    className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs"
                  >
                    <HugeiconsIcon icon={MinusSignIcon} className="size-3 text-destructive" strokeWidth={2} />
                    <span className="text-xs text-muted-foreground">
                      Only in original:
                    </span>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {c.templateId.entityName}
                    </Badge>
                    <span className="font-mono">
                      {truncateId(c.contractId, 8)}
                    </span>
                  </div>
                ))}

              {/* Outputs only in modified */}
              {modOutputs
                .filter((c) => !origOutputIds.has(c.contractId))
                .map((c) => (
                  <div
                    key={c.contractId}
                    className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs"
                  >
                    <HugeiconsIcon icon={Add01Icon} className="size-3 text-primary" strokeWidth={2} />
                    <span className="text-xs text-muted-foreground">
                      Only in modified:
                    </span>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {c.templateId.entityName}
                    </Badge>
                    <span className="font-mono">
                      {truncateId(c.contractId, 8)}
                    </span>
                  </div>
                ))}

              {origOutputs.length === 0 && modOutputs.length === 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  No outputs to compare
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost comparison */}
      {(original.costEstimation || modified.costEstimation) && (
        <DiffRow
          label="Cost"
          original={
            original.costEstimation
              ? `${original.costEstimation.estimatedCost} ${original.costEstimation.unit}`
              : "N/A"
          }
          modified={
            modified.costEstimation
              ? `${modified.costEstimation.estimatedCost} ${modified.costEstimation.unit}`
              : "N/A"
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main what-if panel
// ---------------------------------------------------------------------------

export interface WhatIfPanelProps {
  originalResult: SimulationResult;
  initialRequest?: Partial<{
    packageId: string;
    template: string;
    choice: string;
    contractId: string;
    args: Record<string, unknown>;
    actAs: string;
    readAs: string;
    mode: "online" | "offline";
    offset: string;
  }>;
}

export function WhatIfPanel({
  originalResult,
  initialRequest,
}: WhatIfPanelProps) {
  const [showBuilder, setShowBuilder] = useState(false);
  const simulation = useSimulation();
  const [comparisonResult, setComparisonResult] =
    useState<SimulationResult | null>(null);

  const handleSimulate = (request: SimulationRequest) => {
    simulation.mutate(request, {
      onSuccess: (data) => {
        setComparisonResult(data);
      },
    });
  };

  if (!showBuilder) {
    return (
      <div className="flex justify-center py-4">
        <Button
          variant="outline"
          onClick={() => setShowBuilder(true)}
          className="gap-2"
        >
          <HugeiconsIcon icon={GitCompareIcon} data-icon="inline-start" strokeWidth={2} />
          What If? Compare with modified parameters
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={GitCompareIcon} className="size-5 text-muted-foreground" strokeWidth={2} />
        <h3 className="text-sm font-semibold">What-If Comparison</h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setShowBuilder(false);
            setComparisonResult(null);
          }}
          className="ml-auto text-xs"
        >
          Close
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Modify any parameter below and simulate again to compare results
        side-by-side.
      </p>

      {/* Modified command builder */}
      <CommandBuilder
        onSimulate={handleSimulate}
        isSimulating={simulation.isPending}
        initialValues={initialRequest}
      />

      {/* Comparison error */}
      {simulation.isError && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <HugeiconsIcon icon={Cancel01Icon} className="mt-0.5 size-4 flex-shrink-0 text-destructive" strokeWidth={2} />
          <p className="text-sm text-destructive">
            {simulation.error?.message ?? "Comparison simulation failed"}
          </p>
        </div>
      )}

      {/* Comparison results */}
      {comparisonResult && (
        <ResultComparison
          original={originalResult}
          modified={comparisonResult}
        />
      )}
    </div>
  );
}
