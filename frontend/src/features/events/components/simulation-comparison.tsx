import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Tick02Icon,
  Cancel01Icon,
  Alert01Icon,
  Clock01Icon,
  FileAttachmentIcon,
  MinusSignIcon,
  Add01Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { truncateId, formatTemplateId } from "@/lib/utils";
import type {
  SimulationResult,
  ActiveContract,
  CommandError,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Contract diff row
// ---------------------------------------------------------------------------

interface ContractDiffProps {
  contract: ActiveContract;
  status: "present" | "missing" | "added";
}

function ContractDiffRow({ contract, status }: ContractDiffProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2 text-xs",
        status === "present" && "border-border bg-card",
        status === "missing" &&
          "border-destructive/30 bg-destructive/5",
        status === "added" &&
          "border-primary/30 bg-primary/5"
      )}
    >
      {status === "missing" && (
        <HugeiconsIcon icon={MinusSignIcon} className="size-3.5 flex-shrink-0 text-destructive" strokeWidth={2} />
      )}
      {status === "added" && (
        <HugeiconsIcon icon={Add01Icon} className="size-3.5 flex-shrink-0 text-primary" strokeWidth={2} />
      )}
      {status === "present" && (
        <HugeiconsIcon icon={Tick02Icon} className="size-3.5 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
        <span className="truncate font-mono">
          {truncateId(contract.contractId, 10)}
        </span>
        <span className="truncate text-muted-foreground">
          {formatTemplateId(contract.templateId)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side panel
// ---------------------------------------------------------------------------

interface SidePanelProps {
  title: string;
  offset: string;
  success: boolean;
  contracts: ActiveContract[];
  error?: CommandError;
  variant: "simulation" | "execution";
}

function SidePanel({
  title,
  offset,
  success,
  contracts,
  error,
  variant: _variant,
}: SidePanelProps) {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge
          variant={success ? "default" : "destructive"}
          className="text-xs"
        >
          {success ? "Success" : "Failed"}
        </Badge>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <HugeiconsIcon icon={Clock01Icon} className="size-3.5" strokeWidth={2} />
        <span>
          At offset{" "}
          <span className="font-mono">{offset}</span>
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" strokeWidth={2} />
            {error.errorCodeId}
          </div>
          <p className="mt-1 text-destructive/80">
            {error.message}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Contracts in Scope
        </span>
        <ScrollArea className="max-h-[300px]">
          <div className="flex flex-col gap-1.5">
            {contracts.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No contracts available
              </p>
            ) : (
              contracts.map((c) => (
                <ContractDiffRow
                  key={c.contractId}
                  contract={c}
                  status="present"
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main comparison component
// ---------------------------------------------------------------------------

export interface SimulationComparisonProps {
  simulationResult: SimulationResult;
  executionError: CommandError;
  executionOffset: string;
}

export function SimulationComparison({
  simulationResult,
  executionError,
  executionOffset,
}: SimulationComparisonProps) {
  // Determine contracts that were available during simulation but may have been
  // archived by execution time
  const simulationContracts =
    simulationResult.inputContracts?.map((ic) => ic.contract) ?? [];

  const missingAtExecution = simulationContracts.filter((sc) => {
    // Heuristic: if the execution error is about a missing resource whose name
    // matches one of the simulation's input contracts, flag it.
    if (
      executionError.resourceInfo?.resourceName &&
      sc.contractId === executionError.resourceInfo.resourceName
    ) {
      return true;
    }
    return false;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HugeiconsIcon icon={FileAttachmentIcon} className="size-5 text-muted-foreground" strokeWidth={2} />
        <h2 className="text-base font-semibold">Simulation vs. Execution</h2>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-lg border border-muted-foreground/20 bg-muted/50 p-4">
        <HugeiconsIcon icon={Alert01Icon} className="mt-0.5 size-5 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            State Drift Detected
          </span>
          <p className="text-xs text-muted-foreground">
            The simulation succeeded at offset{" "}
            <span className="font-mono">{simulationResult.atOffset}</span> but
            execution failed at offset{" "}
            <span className="font-mono">{executionOffset}</span>. The ledger
            state changed between these offsets.
          </p>
        </div>
      </div>

      {/* Offset progression timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Offset Progression
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <div className="flex size-8 items-center justify-center rounded-full border-2 border-primary bg-primary/10">
                <HugeiconsIcon icon={Tick02Icon} className="size-4 text-primary" strokeWidth={2} />
              </div>
              <span className="text-xs text-muted-foreground">
                Simulation
              </span>
              <span className="font-mono text-xs">
                {simulationResult.atOffset}
              </span>
            </div>
            <div className="flex flex-1 items-center">
              <div className="h-0.5 flex-1 bg-gradient-to-r from-primary/50 to-destructive/50" />
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-muted-foreground" strokeWidth={2} />
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="flex size-8 items-center justify-center rounded-full border-2 border-destructive bg-destructive/10">
                <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-destructive" strokeWidth={2} />
              </div>
              <span className="text-xs text-muted-foreground">
                Execution
              </span>
              <span className="font-mono text-xs">{executionOffset}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Side-by-side diff */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr]">
        <SidePanel
          title={`Simulation (offset ${simulationResult.atOffset})`}
          offset={simulationResult.atOffset}
          success={simulationResult.success}
          contracts={simulationContracts}
          variant="simulation"
        />
        <div className="hidden items-center justify-center md:flex">
          <Separator orientation="vertical" className="h-full" />
        </div>
        <SidePanel
          title={`Execution (offset ${executionOffset})`}
          offset={executionOffset}
          success={false}
          contracts={[]}
          error={executionError}
          variant="execution"
        />
      </div>

      {/* Highlighted differences */}
      {missingAtExecution.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Contracts Archived Between Offsets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5">
              {missingAtExecution.map((c) => (
                <ContractDiffRow
                  key={c.contractId}
                  contract={c}
                  status="missing"
                />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              These contracts existed during simulation but were archived by the
              time execution occurred.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
