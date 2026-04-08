import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SourceCodeIcon,
  Download01Icon,
  Package01Icon,
  Shield01Icon,
  CheckmarkCircle01Icon,
  Add01Icon,
  PlayIcon,
  Delete01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Forward01Icon,
  PreviousIcon,
  Forward02Icon,
  Backward01Icon,
  RotateLeftIcon,
  CancelCircleIcon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// Native overflow used instead of ScrollArea for proper width containment
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from "@/components/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
// Using <a> tags for contract links to avoid TanStack Router type issues
import { cn, formatPartyDisplay, formatNumeric, formatPayloadValue, formatTemplateId, truncateId } from "@/lib/utils";
import { JsonView } from "@/components/json-view";
import type { TraceStep, TraceStepType } from "@/lib/types";
import type { TraceNavigation } from "@/features/debugger/hooks";

// ---------------------------------------------------------------------------
// Step type icons
// ---------------------------------------------------------------------------

const STEP_ICONS: Record<TraceStepType, typeof SourceCodeIcon> = {
  evaluate_expression: SourceCodeIcon,
  fetch_contract: Download01Icon,
  fetch_package: Package01Icon,
  check_authorization: Shield01Icon,
  evaluate_guard: CheckmarkCircle01Icon,
  create_contract: Add01Icon,
  exercise_choice: PlayIcon,
  archive_contract: Delete01Icon,
};

const STEP_TYPE_LABELS: Record<TraceStepType, string> = {
  evaluate_expression: "Evaluate",
  fetch_contract: "Fetch Contract",
  fetch_package: "Fetch Package",
  check_authorization: "Check Auth",
  evaluate_guard: "Guard",
  create_contract: "Create",
  exercise_choice: "Exercise",
  archive_contract: "Archive",
};

// ---------------------------------------------------------------------------
// Variable value formatters
// ---------------------------------------------------------------------------

/** Detect Canton party IDs (contain "::" with a hex fingerprint). */
function isPartyId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]+::[0-9a-f]{8,}/.test(value);
}

/** Detect numeric strings with excessive decimal places. */
function isNumericString(value: unknown): value is string {
  return typeof value === "string" && /^-?\d+\.\d{4,}$/.test(value);
}

/**
 * Render a single variable value with smart formatting: party IDs get
 * `formatPartyDisplay()`, numerics get `formatNumeric()`, and contract IDs
 * matching `step.variables.contractId` render as clickable links.
 */
function FormattedValue({
  value,
  asContractLink,
}: {
  value: unknown;
  asContractLink?: boolean;
}) {
  if (asContractLink && typeof value === "string") {
    const display =
      value.length > 20 ? value.slice(0, 8) + "..." + value.slice(-8) : value;
    return (
      <a
        href={`/contracts/${encodeURIComponent(value)}`}
        className="font-mono text-primary underline underline-offset-2 hover:text-primary/80"
        title={value}
      >
        {display}
      </a>
    );
  }
  if (isPartyId(value)) {
    return (
      <span title={value}>
        {formatPartyDisplay(value)}
      </span>
    );
  }
  if (isNumericString(value)) {
    return <span title={value}>{formatNumeric(value)}</span>;
  }
  if (typeof value === "object" && value !== null) {
    return <JsonView data={value} defaultExpandDepth={2} />;
  }
  return <span className="truncate">{String(value)}</span>;
}

/**
 * Render a variables record as a compact key-value list with smart formatting
 * instead of raw JSON.
 */
/** Detect if a key name is likely a contract ID field. */
function isContractIdKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower === "contractid" || lower === "contract_id" || lower === "resultingcontractid";
}

function FormattedVariables({
  variables,
  contractIdKey,
}: {
  variables: Record<string, unknown>;
  /** Key whose value should render as a clickable contract link. */
  contractIdKey?: string;
}) {
  const entries = Object.entries(variables);
  if (entries.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-1 overflow-hidden">
      {entries.map(([key, value]) => (
        <div key={key} className="flex min-w-0 items-baseline gap-2 overflow-hidden font-mono text-xs">
          <span className="shrink-0 text-muted-foreground">{key}:</span>
          <FormattedValue
            value={value}
            asContractLink={key === contractIdKey || isContractIdKey(key)}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step detail (expandable)
// ---------------------------------------------------------------------------

/** Render a payload/arguments object as formatted key-value pairs with party/numeric formatting. */
function PayloadFields({ data, label }: { data: Record<string, unknown>; label: string }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-col gap-0.5 overflow-hidden rounded-md border border-border/50 bg-muted/20 p-2">
        {entries.map(([k, v]) => {
          const isParty = typeof v === "string" && v.includes("::");
          const isNumeric = typeof v === "string" && /^-?\d+\.\d+$/.test(v);
          return (
            <div key={k} className="flex items-baseline gap-2 font-mono text-xs">
              <span className="text-muted-foreground">{k}:</span>
              {isParty ? (
                <span className="text-primary/80" title={String(v)}>
                  {formatPartyDisplay(String(v))}
                </span>
              ) : isNumeric ? (
                <span title={String(v)}>{formatNumeric(String(v))}</span>
              ) : typeof v === "object" && v !== null ? (
                <JsonView data={v} defaultExpandDepth={2} />
              ) : (
                <span className="break-all">{formatPayloadValue(v)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepExpandedContent({ step }: { step: TraceStep }) {
  const ctx = step.context;
  const templateLabel = ctx.templateId
    ? formatTemplateId(ctx.templateId)
    : null;

  return (
    <div className="mt-2 flex min-w-0 flex-col gap-2 overflow-hidden text-xs">
      {/* ── fetch_contract ── */}
      {step.stepType === "fetch_contract" && (() => {
        const contractId = String(step.variables.contractId ?? "");
        const source = String(step.variables.source ?? "ACS");
        const payloads = ctx.contractPayloads ?? {};
        const contractPayload = contractId ? payloads[contractId] : undefined;

        return (
          <>
            {/* Contract ID + source badge */}
            {contractId && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/20 p-2">
                <span className="text-xs text-muted-foreground">Contract:</span>
                <a
                  href={`/contracts/${encodeURIComponent(contractId)}`}
                  className="font-mono text-xs text-primary underline underline-offset-2 hover:text-primary/80"
                  title={contractId}
                >
                  {truncateId(contractId, 24)}
                </a>
                <Badge
                  variant={source === "ACS" ? "default" : "secondary"}
                  className="text-[11px]"
                >
                  {source}
                </Badge>
              </div>
            )}
            {/* Contract payload */}
            {contractPayload && Object.keys(contractPayload).length > 0 && (
              <PayloadFields data={contractPayload} label="Contract Payload" />
            )}
          </>
        );
      })()}

      {/* ── exercise_choice ── */}
      {step.stepType === "exercise_choice" && (() => {
        const contractId = String(ctx.resultingContractId ?? step.variables.contractId ?? "");
        const isConsuming = ctx.actionType === "exercise_consuming" || ctx.actionType?.includes("consuming");
        const actingParties = step.variables.actingParties;

        return (
          <>
            {/* Template + Choice + Consuming badge */}
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/20 p-2">
              {templateLabel && (
                <span className="text-xs text-muted-foreground">
                  Template:{" "}
                  <code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-xs text-foreground">
                    {templateLabel}
                  </code>
                </span>
              )}
              {ctx.choice && (
                <span className="text-xs text-muted-foreground">
                  Choice:{" "}
                  <code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-xs text-foreground">
                    {ctx.choice}
                  </code>
                </span>
              )}
              <Badge
                variant={isConsuming ? "destructive" : "secondary"}
                className="text-[11px]"
              >
                {isConsuming ? "Consuming" : "Non-consuming"}
              </Badge>
            </div>

            {/* Contract ID link */}
            {contractId && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Contract:</span>
                <a
                  href={`/contracts/${encodeURIComponent(contractId)}`}
                  className="font-mono text-xs text-primary underline underline-offset-2 hover:text-primary/80"
                  title={contractId}
                >
                  {truncateId(contractId, 24)}
                </a>
              </div>
            )}

            {/* Choice arguments */}
            {ctx.arguments && Object.keys(ctx.arguments).length > 0 && (
              <PayloadFields data={ctx.arguments} label="Choice Arguments" />
            )}

            {/* Acting parties */}
            {actingParties && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Acting Parties:</span>
                {(Array.isArray(actingParties) ? actingParties : [actingParties]).map(p => (
                  <Badge key={String(p)} variant="outline" className="max-w-full font-mono text-[11px]" title={String(p)}>
                    <span className="truncate">{formatPartyDisplay(String(p))}</span>
                  </Badge>
                ))}
              </div>
            )}
          </>
        );
      })()}

      {/* ── archive_contract ── */}
      {step.stepType === "archive_contract" && (() => {
        const contractId = String(ctx.resultingContractId ?? step.variables.contractId ?? "");

        return (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/20 p-2">
              {templateLabel && (
                <span className="text-xs text-muted-foreground">
                  Template:{" "}
                  <code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-xs text-foreground">
                    {templateLabel}
                  </code>
                </span>
              )}
              {contractId && (
                <span className="text-xs text-muted-foreground">
                  Contract:{" "}
                  <a
                    href={`/contracts/${encodeURIComponent(contractId)}`}
                    className="font-mono text-xs text-primary underline underline-offset-2 hover:text-primary/80"
                    title={contractId}
                  >
                    {truncateId(contractId, 24)}
                  </a>
                </span>
              )}
            </div>
            {ctx.choice && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Archived by:</span>
                <code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-foreground">{ctx.choice}</code>
              </div>
            )}
          </>
        );
      })()}

      {/* ── create_contract ── */}
      {step.stepType === "create_contract" && (() => {
        const contractId = String(ctx.resultingContractId ?? step.variables.contractId ?? "");
        const signatoriesVar = step.variables.signatories;
        const stakeholdersVar = step.variables.stakeholders;

        return (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/20 p-2">
              {templateLabel && (
                <span className="text-xs text-muted-foreground">
                  Template:{" "}
                  <code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-xs text-foreground">
                    {templateLabel}
                  </code>
                </span>
              )}
              {contractId && (
                <span className="text-xs text-muted-foreground">
                  New Contract:{" "}
                  <span className="font-mono text-foreground" title={contractId}>
                    {truncateId(contractId, 24)}
                  </span>
                </span>
              )}
            </div>

            {/* Full payload from ctx.arguments */}
            {ctx.arguments && Object.keys(ctx.arguments).length > 0 && (
              <PayloadFields data={ctx.arguments} label="Contract Payload" />
            )}

            {/* Signatories */}
            {signatoriesVar && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Signatories:</span>
                {(Array.isArray(signatoriesVar) ? signatoriesVar : [signatoriesVar]).map(s => (
                  <Badge key={String(s)} variant="outline" className="max-w-full font-mono text-[11px]" title={String(s)}>
                    <span className="truncate">{formatPartyDisplay(String(s))}</span>
                  </Badge>
                ))}
              </div>
            )}

            {/* Stakeholders */}
            {stakeholdersVar && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Stakeholders:</span>
                {(Array.isArray(stakeholdersVar) ? stakeholdersVar : [stakeholdersVar]).map(s => (
                  <Badge key={String(s)} variant="outline" className="max-w-full font-mono text-[11px]" title={String(s)}>
                    <span className="truncate">{formatPartyDisplay(String(s))}</span>
                  </Badge>
                ))}
              </div>
            )}
          </>
        );
      })()}

      {/* ── Generic step info (non-specific step types) ── */}
      {!["fetch_contract", "exercise_choice", "archive_contract", "create_contract"].includes(step.stepType) && (
        <>
          {/* Action / Template / Choice summary */}
          {(ctx.actionType || templateLabel || ctx.choice || ctx.resultingContractId) && (
            <div className="flex flex-col gap-1 rounded-md border border-border/50 bg-muted/20 p-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {ctx.actionType && (
                  <span className="text-xs text-muted-foreground">
                    Action:{" "}
                    <span className="font-medium text-foreground">{ctx.actionType}</span>
                  </span>
                )}
                {templateLabel && (
                  <span className="text-xs text-muted-foreground">
                    Template:{" "}
                    <code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-xs text-foreground">
                      {templateLabel}
                    </code>
                  </span>
                )}
                {ctx.choice && (
                  <span className="text-xs text-muted-foreground">
                    Choice:{" "}
                    <code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-xs text-foreground">
                      {ctx.choice}
                    </code>
                  </span>
                )}
                {ctx.resultingContractId && (
                  <span className="text-xs text-muted-foreground">
                    Contract:{" "}
                    <code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-xs text-foreground" title={ctx.resultingContractId}>
                      {truncateId(ctx.resultingContractId, 24)}
                    </code>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Arguments for generic steps */}
          {ctx.arguments && Object.keys(ctx.arguments).length > 0 && (
            <PayloadFields data={ctx.arguments} label="Arguments" />
          )}
        </>
      )}

      {/* Source location detail */}
      {step.sourceLocation && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Source
          </span>
          <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-xs text-foreground">
            {step.sourceLocation.file}:{step.sourceLocation.startLine}:{step.sourceLocation.startCol}
            {(step.sourceLocation.endLine !== step.sourceLocation.startLine ||
              step.sourceLocation.endCol !== step.sourceLocation.startCol) &&
              ` - ${step.sourceLocation.endLine}:${step.sourceLocation.endCol}`}
          </code>
        </div>
      )}

      {/* Authority sets (shared across step types) */}
      {(ctx.requiredAuthority || ctx.providedAuthority) && (
        <div className="flex gap-4">
          {ctx.requiredAuthority && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Required Authority
              </span>
              <div className="flex flex-wrap gap-1">
                {ctx.requiredAuthority.map((a) => (
                  <Badge
                    key={a}
                    variant="outline"
                    className="max-w-full font-mono text-[11px]"
                    title={a}
                  >
                    <span className="truncate">{formatPartyDisplay(a)}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {ctx.providedAuthority && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Provided Authority
              </span>
              <div className="flex flex-wrap gap-1">
                {ctx.providedAuthority.map((a) => (
                  <Badge
                    key={a}
                    variant="outline"
                    className="max-w-full font-mono text-[11px]"
                    title={a}
                  >
                    <span className="truncate">{formatPartyDisplay(a)}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Variables — formatted with smart party/numeric/link display */}
      {Object.keys(step.variables).length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Variables
          </span>
          <div className="overflow-hidden rounded-md border border-border/50 p-2">
            <FormattedVariables
              variables={step.variables}
              contractIdKey={step.stepType === "fetch_contract" ? "contractId" : undefined}
            />
          </div>
        </div>
      )}

      {/* Contract payloads (for step types that don't render them above) */}
      {!["fetch_contract"].includes(step.stepType) &&
        ctx.contractPayloads &&
        Object.keys(ctx.contractPayloads).length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Contract Payloads
            </span>
            {Object.entries(ctx.contractPayloads).map(([cid, pl]) => (
              <div key={cid} className="flex flex-col gap-1">
                <a
                  href={`/contracts/${encodeURIComponent(cid)}`}
                  className="font-mono text-xs text-primary underline underline-offset-2 hover:text-primary/80"
                  title={cid}
                >
                  {truncateId(cid, 20)}
                </a>
                <PayloadFields data={pl} label="" />
              </div>
            ))}
          </div>
        )}

      {/* Guard info */}
      {ctx.guardExpression && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Guard
          </span>
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-xs">
              {ctx.guardExpression}
            </code>
            {ctx.guardResult !== undefined && (
              <Badge
                variant={ctx.guardResult ? "default" : "destructive"}
                className="text-[11px]"
              >
                {ctx.guardResult ? "passed" : "failed"}
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Error — full red background for failed steps */}
      {step.error && (
        <div className="rounded-md border-2 border-destructive bg-destructive/30 p-4">
          <div className="flex items-start gap-2">
            <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-5 flex-shrink-0 text-destructive" strokeWidth={2} />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-destructive">
                Error
              </span>
              <p className="text-sm font-semibold text-destructive">{step.error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single step row
// ---------------------------------------------------------------------------

interface StepRowProps {
  step: TraceStep;
  isCurrent: boolean;
  isLast: boolean;
  onClick: () => void;
}

/** Detect evaluate_expression steps that are implementation details (init/completion). */
function isImplementationDetail(step: TraceStep): boolean {
  if (step.stepType !== "evaluate_expression") return false;
  const s = step.summary.toLowerCase();
  return s.includes("initialize") || s.includes("daml-lf engine") || s.includes("command evaluation complete") || s.includes("evaluation complete");
}

function StepRow({ step, isCurrent, isLast, onClick }: StepRowProps) {
  const [expanded, setExpanded] = React.useState(isCurrent);
  const Icon = STEP_ICONS[step.stepType];
  const muted = isImplementationDetail(step);

  // Auto-expand when this step becomes current, auto-collapse when it loses focus
  React.useEffect(() => {
    setExpanded(isCurrent);
  }, [isCurrent]);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden px-3 py-2 transition-colors cursor-pointer rounded-md mx-1",
        isCurrent
          ? "ring-1 ring-primary/50 border border-primary/30"
          : step.passed
          ? "hover:bg-muted/30"
          : "ring-1 ring-destructive/30 border border-destructive/20 bg-destructive/5",
        false && muted && !isCurrent && "opacity-60", // disabled — all steps rendered equally
      )}
      onClick={onClick}
    >
      <div className="flex min-w-0 items-center gap-2">
        {/* Step number */}
        <span className={cn("w-6 text-right font-mono text-muted-foreground", muted ? "text-[11px]" : "text-xs")}>
          {step.stepNumber}
        </span>

        {/* Type icon */}
        <HugeiconsIcon
          icon={Icon}
          className={cn(
            "flex-shrink-0",
            muted ? "size-3" : "size-3.5",
            step.passed
              ? "text-muted-foreground"
              : "text-destructive"
          )}
          strokeWidth={2}
        />

        {/* Summary */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <span className={cn("font-medium", muted ? "text-xs text-muted-foreground" : "text-xs")}>
              {STEP_TYPE_LABELS[step.stepType]}
            </span>
            {step.sourceLocation && (
              <span className="truncate font-mono text-xs text-muted-foreground">
                {step.sourceLocation.file.split("/").pop()}:
                {step.sourceLocation.startLine}
              </span>
            )}
          </div>
          <p className={cn("truncate text-muted-foreground", muted ? "text-xs" : "text-xs")}>
            {step.summary}
          </p>
        </div>

        {/* Pass/Fail indicator */}
        {step.passed ? (
          <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-3.5 flex-shrink-0 text-primary" strokeWidth={2} />
        ) : (
          <HugeiconsIcon icon={CancelCircleIcon} className="size-3.5 flex-shrink-0 text-destructive" strokeWidth={2} />
        )}

        {/* Expand toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="flex size-5 items-center justify-center rounded hover:bg-muted"
        >
          {expanded ? (
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3" strokeWidth={2} />
          ) : (
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" strokeWidth={2} />
          )}
        </button>
      </div>

      {/* Failed step error banner — prominent red */}
      {!step.passed && !expanded && step.error && (
        <div className="ml-8 mt-1.5 flex items-center gap-1.5 rounded bg-destructive/30 border-2 border-destructive/50 px-3 py-2">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-4 flex-shrink-0 text-destructive" strokeWidth={2} />
          <span className="text-xs font-semibold text-destructive">{step.error}</span>
        </div>
      )}

      {/* Expanded details */}
      {expanded && <StepExpandedContent step={step} />}

      {/* NO MORE STEPS indicator after failed last step */}
      {!step.passed && isLast && (
        <div className="mt-2 flex items-center justify-center rounded-md border-2 border-destructive/30 bg-destructive/10 py-2">
          <span className="text-xs font-bold uppercase tracking-widest text-destructive/70">
            No More Steps
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export interface StepsPanelProps {
  steps: TraceStep[];
  navigation: TraceNavigation;
}

export function StepsPanel({ steps, navigation }: StepsPanelProps) {
  // IMPORTANT: The root div has overflow-hidden to prevent horizontal overflow
  // Keyboard shortcut handler
  const { stepForward, stepBack, runToFailure, runToEnd } = navigation;
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept shortcuts when focus is in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (steps.length === 0) return;

      if (e.key === "F10" && !e.shiftKey) {
        e.preventDefault();
        stepForward();
      } else if (e.key === "F10" && e.shiftKey) {
        e.preventDefault();
        stepBack();
      } else if (e.key === "F5" && !e.shiftKey) {
        e.preventDefault();
        runToFailure(steps);
      } else if (e.key === "F5" && e.shiftKey) {
        e.preventDefault();
        runToEnd();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [steps, stepForward, stepBack, runToFailure, runToEnd]);

  if (steps.length === 0) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            Execution Steps
          </span>
        </div>
        <Empty className="flex-1">
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={PlayIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyDescription>
              No trace loaded yet
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1.5">
        <TooltipProvider>
          {/* Reset */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={navigation.reset}
                disabled={navigation.isAtStart}
              >
                <HugeiconsIcon icon={RotateLeftIcon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset (Step 1)</TooltipContent>
          </Tooltip>

          {/* Step Back */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={navigation.stepBack}
                disabled={navigation.isAtStart}
              >
                <HugeiconsIcon icon={PreviousIcon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Step Back (Shift+F10)</TooltipContent>
          </Tooltip>

          {/* Step Forward */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={navigation.stepForward}
                disabled={navigation.isAtEnd}
              >
                <HugeiconsIcon icon={Forward01Icon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Step Forward (F10)</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {/* Run to Failure */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => navigation.runToFailure(steps)}
              >
                <HugeiconsIcon icon={Backward01Icon} className="text-destructive" strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Run to Failure (F5)</TooltipContent>
          </Tooltip>

          {/* Run to End */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={navigation.runToEnd}
                disabled={navigation.isAtEnd}
              >
                <HugeiconsIcon icon={Forward02Icon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Run to End (Shift+F5)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Step counter */}
        <div className="ml-auto">
          <span className="font-mono text-xs text-muted-foreground">
            Step {navigation.currentStep + 1} of {navigation.totalSteps}
          </span>
        </div>
      </div>

      {/* Steps list */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex w-full flex-col">
          {steps.map((step, idx) => (
            <StepRow
              key={step.stepNumber}
              step={step}
              isCurrent={step.stepNumber === navigation.currentStep + 1}
              isLast={idx === steps.length - 1}
              onClick={() => navigation.setStep(step.stepNumber - 1)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
