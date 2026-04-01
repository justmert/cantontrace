import { useState, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tick02Icon,
  Cancel01Icon,
  Alert01Icon,
  InformationCircleIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  LinkSquare01Icon,
  DollarCircleIcon,
  HashtagIcon,
  Key01Icon,
  LockIcon,
  Search01Icon,
  ShieldEnergyIcon,
  Add01Icon,
  PlayIcon,
  Delete01Icon,
  ArrowDataTransferVerticalIcon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyButton } from "@/components/copy-button";
import { cn, truncateId, formatTemplateId, formatPartyDisplay, formatJsonForDisplay } from "@/lib/utils";
import type {
  SimulationResult,
  ActiveContract,
  CommandError,
  TransactionDetail,
  LedgerEvent,
  ExercisedEvent,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Contract card
// ---------------------------------------------------------------------------

function ContractCard({
  contract,
  label,
  variant,
  onNavigateContract,
}: {
  contract: ActiveContract;
  label: string;
  variant: "input" | "output";
  onNavigateContract?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isInput = variant === "input";

  return (
    <div
      className={cn(
        "rounded-md border",
        isInput
          ? "border-destructive/20 bg-destructive/5"
          : "border-primary/20 bg-primary/5"
      )}
    >
      <button
        className="flex w-full items-center gap-2 px-3 py-2"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3" strokeWidth={2} />
        ) : (
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" strokeWidth={2} />
        )}
        <Badge
          variant="outline"
          className={cn(
            "text-[9px]",
            isInput
              ? "border-destructive/30 text-destructive"
              : "border-primary/30 text-primary"
          )}
        >
          {label}
        </Badge>
        <span className="truncate font-mono text-xs">
          {truncateId(contract.contractId, 10)}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {contract.templateId.entityName}
        </span>
      </button>

      {expanded && (
        <div className="border-t px-3 py-2">
          <div className="flex flex-col gap-2 text-xs">
            {/* Template */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 text-muted-foreground">Template:</span>
              <Badge variant="outline" className="max-w-full font-mono text-[10px]">
                <span className="truncate">{formatTemplateId(contract.templateId)}</span>
              </Badge>
            </div>

            {/* Contract ID */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Contract ID:</span>
              <span className="font-mono">{truncateId(contract.contractId, 16)}</span>
              <CopyButton text={contract.contractId} />
              {onNavigateContract && (
                <button
                  className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                  onClick={() => onNavigateContract(contract.contractId)}
                >
                  <HugeiconsIcon icon={LinkSquare01Icon} className="size-2.5" strokeWidth={2} />
                  Lifecycle
                </button>
              )}
            </div>

            {/* Signatories */}
            <div className="flex flex-wrap gap-1">
              <span className="shrink-0 text-muted-foreground">Signatories:</span>
              {contract.signatories.map((s) => (
                <Badge key={s} variant="outline" className="max-w-full font-mono text-[9px]" title={s}>
                  <span className="truncate">{formatPartyDisplay(s)}</span>
                </Badge>
              ))}
            </div>

            {/* Decoded payload */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Payload
              </span>
              <div className="overflow-hidden rounded border bg-muted/30 p-2">
                <pre className="whitespace-pre-wrap break-all font-mono text-[10px]">
                  {formatJsonForDisplay(contract.payload)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple indented transaction tree (text-based, no ReactFlow)
// ---------------------------------------------------------------------------

const EVENT_ICONS: Record<string, typeof Add01Icon> = {
  created: Add01Icon,
  exercised: PlayIcon,
  archived: Delete01Icon,
};

const EVENT_COLORS: Record<string, string> = {
  created: "text-primary",
  exercised: "text-foreground",
  archived: "text-destructive",
};

function SimpleTransactionTree({
  transaction,
}: {
  transaction: TransactionDetail;
}) {
  const rows = useMemo(() => {
    const result: Array<{
      event: LedgerEvent;
      depth: number;
    }> = [];

    function walk(eventId: string, depth: number) {
      const event = transaction.eventsById[eventId];
      if (!event) return;
      result.push({ event, depth });
      if (event.eventType === "exercised") {
        const ex = event as ExercisedEvent;
        for (const childId of ex.childEventIds) {
          walk(childId, depth + 1);
        }
      }
    }

    for (const rootId of transaction.rootEventIds) {
      walk(rootId, 0);
    }
    return result;
  }, [transaction]);

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      {rows.map(({ event, depth }) => {
        const Icon = EVENT_ICONS[event.eventType] ?? ArrowRight01Icon;
        const colorClass = EVENT_COLORS[event.eventType] ?? "text-foreground";

        let label = "";
        let detail = "";

        if (event.eventType === "exercised") {
          const ex = event as ExercisedEvent;
          label = `Exercise ${ex.choice}`;
          detail = `${ex.templateId.entityName} ${truncateId(ex.contractId, 8)}`;
          if (ex.consuming) detail += " [consuming]";
        } else if (event.eventType === "created") {
          label = `Create ${event.templateId.entityName}`;
          detail = truncateId(event.contractId, 8);
        } else if (event.eventType === "archived") {
          label = `Archive ${event.templateId.entityName}`;
          detail = truncateId(event.contractId, 8);
        }

        const eventKey = "eventId" in event ? event.eventId : `${depth}-${label}`;

        return (
          <div
            key={eventKey}
            className="flex items-start gap-2 rounded-md px-2 py-1 text-xs"
            style={{ paddingLeft: `${depth * 20 + 8}px` }}
          >
            <HugeiconsIcon
              icon={Icon}
              className={cn("mt-0.5 size-3 flex-shrink-0", colorClass)}
              strokeWidth={2}
            />
            <div className="flex flex-col gap-0.5 overflow-hidden min-w-0">
              <span className={cn("font-medium", colorClass)}>{label}</span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {detail}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error categorization helpers
// ---------------------------------------------------------------------------

type ErrorKind = "auth" | "missing_contract" | "ensure_violation" | "generic";

function classifyError(error: CommandError): ErrorKind {
  const code = error.errorCodeId.toUpperCase();
  const category = error.categoryId;

  if (
    category === "AuthInterceptorInvalidAuthenticationCredentials" ||
    code.includes("PERMISSION_DENIED") ||
    code.includes("UNAUTHENTICATED") ||
    code.includes("NOT_AUTHORIZED") ||
    code.includes("AUTHORIZATION_FAILED")
  ) {
    return "auth";
  }

  if (
    category === "InvalidGivenCurrentSystemStateResourceMissing" ||
    code.includes("CONTRACT_NOT_FOUND") ||
    code.includes("CONTRACT_NOT_ACTIVE") ||
    code.includes("INCONSISTENT_CONTRACT_KEY")
  ) {
    return "missing_contract";
  }

  if (
    code.includes("TEMPLATE_PRECONDITION_VIOLATED") ||
    code.includes("ENSURE_FAILED") ||
    code.includes("DAML_INTERPRETATION_ERROR")
  ) {
    return "ensure_violation";
  }

  return "generic";
}

function ErrorIcon({ kind }: { kind: ErrorKind }) {
  switch (kind) {
    case "auth":
      return <HugeiconsIcon icon={LockIcon} className="mt-0.5 size-4 flex-shrink-0 text-destructive" strokeWidth={2} />;
    case "missing_contract":
      return <HugeiconsIcon icon={Search01Icon} className="mt-0.5 size-4 flex-shrink-0 text-destructive" strokeWidth={2} />;
    case "ensure_violation":
      return <HugeiconsIcon icon={ShieldEnergyIcon} className="mt-0.5 size-4 flex-shrink-0 text-destructive" strokeWidth={2} />;
    default:
      return <HugeiconsIcon icon={Cancel01Icon} className="mt-0.5 size-4 flex-shrink-0 text-destructive" strokeWidth={2} />;
  }
}

function errorTitle(kind: ErrorKind): string {
  switch (kind) {
    case "auth":
      return "Authorization Failure";
    case "missing_contract":
      return "Contract Not Found";
    case "ensure_violation":
      return "Ensure / Precondition Violation";
    default:
      return "Simulation Error";
  }
}

function errorGuidance(kind: ErrorKind): string | null {
  switch (kind) {
    case "auth":
      return "The acting parties do not have sufficient rights to execute this command. Verify that the actAs parties match the contract's signatory/controller requirements, and that your user has CanActAs rights for the specified parties.";
    case "missing_contract":
      return "The contract referenced by the command was not found in the active contract set. It may have been archived by another transaction, or the contract ID may be incorrect. If using offline mode, try refreshing the ACS.";
    case "ensure_violation":
      return "The template's ensure clause (precondition) evaluated to False for the given arguments. Review the template source code and adjust the choice arguments to satisfy all preconditions.";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main result component
// ---------------------------------------------------------------------------

export interface SimulationResultViewProps {
  result: SimulationResult;
  onNavigateContract?: (contractId: string) => void;
  onNavigateTransaction?: (updateId: string) => void;
}

export function SimulationResultView({
  result,
  onNavigateContract,
  onNavigateTransaction: _onNavigateTransaction,
}: SimulationResultViewProps) {
  return (
    <div className="flex flex-col gap-4">
        {/* Status header */}
        <div className="flex items-center gap-3">
          {result.success ? (
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
              <HugeiconsIcon icon={Tick02Icon} className="size-5 text-primary" strokeWidth={2} />
            </div>
          ) : (
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <HugeiconsIcon icon={Cancel01Icon} className="size-5 text-destructive" strokeWidth={2} />
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold">
              Simulation {result.success ? "Succeeded" : "Failed"}
            </h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                Mode:{" "}
                <Badge variant="outline" className="text-[9px]">
                  {result.mode}
                </Badge>
              </span>
              <span>
                At offset: <span className="font-mono">{result.atOffset}</span>
              </span>
              <span>
                Time: <span className="font-mono">{result.simulatedAt}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Error details with categorized display */}
        {result.error && (() => {
          const kind = classifyError(result.error);
          const guidance = errorGuidance(kind);
          return (
            <div className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <ErrorIcon kind={kind} />
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-destructive">
                    {errorTitle(kind)}
                  </span>
                  <Badge variant="outline" className="w-fit text-[9px] text-destructive/80">
                    {result.error.errorCodeId}
                  </Badge>
                  <p className="text-xs text-destructive/80">
                    {result.error.message}
                  </p>
                </div>
              </div>

              {guidance && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/10 bg-card p-3">
                  <HugeiconsIcon icon={InformationCircleIcon} className="mt-0.5 size-3.5 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
                  <p className="text-[11px] text-muted-foreground">
                    {guidance}
                  </p>
                </div>
              )}

              {result.error.resourceInfo && (
                <div className="flex flex-col gap-1 overflow-hidden rounded-md border border-destructive/10 bg-card p-3 text-xs">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Resource Info
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-muted-foreground">Type:</span>
                    <span className="truncate font-mono">{result.error.resourceInfo.resourceType}</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-muted-foreground">Name:</span>
                    <span className="truncate font-mono" title={result.error.resourceInfo.resourceName}>{result.error.resourceInfo.resourceName}</span>
                  </div>
                </div>
              )}

              {result.error.suggestedFixes && result.error.suggestedFixes.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-md border border-destructive/10 bg-card p-3">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Suggested Fixes
                  </span>
                  <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {result.error.suggestedFixes.map((fix, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-0.5 text-muted-foreground/60">-</span>
                        {fix}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}

        {/* Transaction tree — simple indented list */}
        {result.transactionTree && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Transaction Tree</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleTransactionTree
                transaction={result.transactionTree}
              />
            </CardContent>
          </Card>
        )}

        {/* Net change summary */}
        {result.transactionTree?.stateDiff && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <HugeiconsIcon
              icon={ArrowDataTransferVerticalIcon}
              className="size-3.5 flex-shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            <span className="text-xs font-medium">
              {result.transactionTree.stateDiff.netChange}
            </span>
          </div>
        )}

        {/* Inputs consumed (state diff) */}
        {result.success && (() => {
          const inputs =
            result.transactionTree?.stateDiff?.inputs ??
            result.inputContracts?.map((ic) => ic.contract) ??
            [];
          if (inputs.length === 0) return null;
          return (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Inputs Consumed ({inputs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {inputs.map((c) => (
                    <ContractCard
                      key={c.contractId}
                      contract={c}
                      label="Input"
                      variant="input"
                      onNavigateContract={onNavigateContract}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Outputs created (state diff) */}
        {result.success && (() => {
          const outputs = result.transactionTree?.stateDiff?.outputs ?? [];
          if (outputs.length === 0) return null;
          return (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Outputs Created ({outputs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {outputs.map((c) => (
                    <ContractCard
                      key={c.contractId}
                      contract={c}
                      label="Output"
                      variant="output"
                      onNavigateContract={onNavigateContract}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Cost estimation — only show when there's actual data */}
        {result.costEstimation && result.costEstimation.estimatedCost && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <HugeiconsIcon icon={DollarCircleIcon} className="size-4" strokeWidth={2} />
                Cost Estimation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">
                  {result.costEstimation.estimatedCost}
                </span>
                <span className="text-sm text-muted-foreground">
                  {result.costEstimation.unit}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Hash info — compact inline display */}
        {result.hashInfo && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <HugeiconsIcon icon={HashtagIcon} className="size-3.5 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
            <span className="text-[10px] font-medium text-muted-foreground">Hash:</span>
            <span className="min-w-0 truncate font-mono text-xs" title={result.hashInfo.transactionHash}>
              {result.hashInfo.transactionHash}
            </span>
            <CopyButton text={result.hashInfo.transactionHash} />
            {result.hashInfo.isAdvisory && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HugeiconsIcon icon={Alert01Icon} className="size-3.5 flex-shrink-0 cursor-help text-muted-foreground/60" strokeWidth={2} />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Advisory: this prepared transaction hash may be removed in future Canton versions. Used to verify the transaction has not been tampered with before execution.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}

        {/* Global key mapping */}
        {result.globalKeyMapping && result.globalKeyMapping.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <HugeiconsIcon icon={Key01Icon} className="size-4" strokeWidth={2} />
                Global Key Mapping
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1.5">
                {result.globalKeyMapping.map((gk, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 overflow-hidden rounded-md border bg-muted/30 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 truncate font-mono text-muted-foreground">
                      {JSON.stringify(gk.key)}
                    </span>
                    <span className="shrink-0 text-muted-foreground">-&gt;</span>
                    {gk.contractId ? (
                      <span className="min-w-0 truncate font-mono">
                        {truncateId(gk.contractId, 10)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">
                        not found
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* State drift warning — compact inline notice */}
        {result.stateDriftWarning && (
          <div className="flex items-center gap-2 rounded-md border border-muted-foreground/15 bg-muted/30 px-3 py-1.5">
            <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 flex-shrink-0 text-muted-foreground/60" strokeWidth={2} />
            <p className="text-[11px] text-muted-foreground/70">
              {result.stateDriftWarning}
            </p>
          </div>
        )}
      </div>
  );
}
