import { useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FileAttachmentIcon,
  GitBranchIcon,
  LinkSquare01Icon,
  Tick02Icon,
  Cancel01Icon,
  InformationCircleIcon,
  Add01Icon,
  PlayIcon,
  Delete01Icon,
  ArrowRight01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from "@/components/ui/empty";
import { cn, truncateId, formatPayloadValue, formatPartyDisplay, formatTemplateId } from "@/lib/utils";
import type {
  TraceStep,
  ExecutionTrace,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Contracts tab — show contracts from current step AND the result transaction
// ---------------------------------------------------------------------------

interface ContractsTabProps {
  step: TraceStep | null;
  trace: ExecutionTrace | null;
}

function ContractsTab({ step, trace }: ContractsTabProps) {
  // Gather contracts from multiple sources:
  // 1. Current step's contractPayloads
  // 2. Fetch contract steps' variables
  // 3. Result transaction events
  const contracts = useMemo(() => {
    const result: Array<{
      contractId: string;
      templateId?: string;
      payload: Record<string, unknown>;
      source: string;
      eventType?: string;
    }> = [];
    const seen = new Set<string>();

    // From current step context
    const payloads = step?.context.contractPayloads ?? {};
    for (const [cid, payload] of Object.entries(payloads)) {
      if (!seen.has(cid)) {
        seen.add(cid);
        result.push({ contractId: cid, payload, source: "step" });
      }
    }

    // From fetch_contract steps (the real engine puts payload in variables)
    if (trace) {
      for (const s of trace.steps) {
        if (s.stepType === "fetch_contract") {
          const cid = s.variables?.contractId as string;
          if (cid && !seen.has(cid)) {
            seen.add(cid);
            // contractPayloads in the step context
            const stepPayloads = s.context.contractPayloads ?? {};
            const payload = stepPayloads[cid] ?? {};
            result.push({
              contractId: cid,
              payload,
              source: (s.variables?.source as string) ?? "ACS",
            });
          }
        }
      }
    }

    // From result transaction events
    if (trace?.resultTransaction) {
      const tx = trace.resultTransaction;
      for (const [, evt] of Object.entries(tx.eventsById ?? {})) {
        const e = evt as { eventType?: string; contractId?: string; templateId?: unknown; payload?: Record<string, unknown>; choiceArgument?: Record<string, unknown> };
        if (e.contractId && !seen.has(e.contractId)) {
          seen.add(e.contractId);
          result.push({
            contractId: e.contractId,
            templateId: e.templateId ? formatTemplateId(e.templateId as string | { moduleName: string; entityName: string; packageName?: string }) : undefined,
            payload: e.payload ?? e.choiceArgument ?? {},
            source: "result",
            eventType: e.eventType,
          });
        }
      }
    }

    return result;
  }, [step, trace]);

  if (contracts.length === 0) {
    return (
      <Empty className="py-8">
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={FileAttachmentIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyDescription>
            No contracts in scope at this step
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ScrollArea className="max-h-[calc(100vh-360px)]">
      <div className="flex flex-col gap-2 p-2">
        {contracts.map((c) => {
          const keyFields = Object.entries(c.payload).slice(0, 5);
          return (
            <div
              key={c.contractId}
              className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
            >
              {c.templateId && (
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {c.templateId}
                </span>
              )}
              <div className="flex items-center justify-between gap-2">
                <span
                  className="truncate font-mono text-xs text-foreground"
                  title={c.contractId}
                >
                  {truncateId(c.contractId, 16)}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "flex-shrink-0 text-[9px]",
                    c.eventType === "created" && "border-primary/30 text-primary",
                    c.eventType === "exercised" && "border-event-exercise/30 text-event-exercise",
                  )}
                >
                  {c.eventType ?? c.source}
                </Badge>
              </div>
              {keyFields.length > 0 && (
                <div className="flex flex-col gap-0.5 rounded border border-border bg-muted/30 p-2">
                  {keyFields.map(([k, v]) => {
                    const formatted = typeof v === "object" && v !== null
                      ? JSON.stringify(v)
                      : formatPayloadValue(v);
                    const display = formatted.length > 30
                      ? formatted.slice(0, 30) + "..."
                      : formatted;
                    return (
                      <span key={k} className="text-[10px] text-foreground" title={`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`}>
                        <span className="text-muted-foreground">{k}:</span>{" "}
                        <span className="font-mono">{display}</span>
                      </span>
                    );
                  })}
                </div>
              )}
              <a
                href={`/contracts/${encodeURIComponent(c.contractId)}`}
                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                <HugeiconsIcon icon={LinkSquare01Icon} className="size-2.5" strokeWidth={2} />
                View Lifecycle
              </a>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Authorization tab — extract from steps + result transaction signatories
// ---------------------------------------------------------------------------

interface AuthorizationTabProps {
  step: TraceStep | null;
  trace: ExecutionTrace | null;
  currentStepIndex: number;
}

function AuthorizationTab({ step, trace, currentStepIndex }: AuthorizationTabProps) {
  const authData = useMemo(() => {
    const allRequired = new Set<string>();
    const allProvided = new Set<string>();

    if (!trace) return { required: [] as string[], provided: [] as string[] };

    // From check_authorization steps
    for (let i = 0; i <= currentStepIndex && i < trace.steps.length; i++) {
      const s = trace.steps[i];
      if (s?.stepType === "check_authorization") {
        for (const r of s.context.requiredAuthority ?? []) allRequired.add(r);
        for (const p of s.context.providedAuthority ?? []) allProvided.add(p);
      }
    }

    // From current step context
    const ctx = step?.context;
    if (ctx?.requiredAuthority?.length) {
      for (const r of ctx.requiredAuthority) allRequired.add(r);
    }
    if (ctx?.providedAuthority?.length) {
      for (const p of ctx.providedAuthority) allProvided.add(p);
    }

    // From result transaction — extract signatories/observers from events
    if (trace.resultTransaction) {
      for (const evt of Object.values(trace.resultTransaction.eventsById ?? {})) {
        const e = evt as { signatories?: string[]; observers?: string[]; actingParties?: string[] };
        if (e.signatories) for (const s of e.signatories) allRequired.add(s);
        if (e.actingParties) for (const p of e.actingParties) allProvided.add(p);
      }
    }

    // From step variables — actAs parties
    for (const s of trace.steps) {
      const actAs = s.variables?.actAs;
      if (typeof actAs === "string") {
        for (const p of actAs.split(",").map(x => x.trim()).filter(Boolean)) {
          allProvided.add(p);
        }
      }
    }

    return { required: [...allRequired], provided: [...allProvided] };
  }, [step, trace, currentStepIndex]);

  const { required, provided } = authData;
  const allRequiredMet = required.length > 0 && required.every((r) => provided.includes(r));
  const hasData = required.length > 0 || provided.length > 0;

  return (
    <ScrollArea className="max-h-[calc(100vh-360px)]">
      <div className="flex flex-col gap-4 p-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Acting As (Provided)
          </span>
          <div className="flex flex-wrap gap-1">
            {provided.length === 0 ? (
              <span className="text-xs text-muted-foreground">None</span>
            ) : (
              provided.map((p) => (
                <Badge key={p} variant="outline" className="max-w-full font-mono text-[10px]" title={p}>
                  <span className="truncate">{formatPartyDisplay(p)}</span>
                </Badge>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Required Signatories
          </span>
          <div className="flex flex-wrap gap-1">
            {required.length === 0 ? (
              <span className="text-xs text-muted-foreground">No signatories detected</span>
            ) : (
              required.map((r) => {
                const met = provided.includes(r);
                return (
                  <Badge
                    key={r}
                    variant="outline"
                    className={cn(
                      "flex max-w-full items-center gap-1 font-mono text-[10px]",
                      met ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive"
                    )}
                    title={r}
                  >
                    {met ? (
                      <HugeiconsIcon icon={Tick02Icon} className="size-2.5 shrink-0" strokeWidth={2} />
                    ) : (
                      <HugeiconsIcon icon={Cancel01Icon} className="size-2.5 shrink-0" strokeWidth={2} />
                    )}
                    <span className="truncate">{formatPartyDisplay(r)}</span>
                  </Badge>
                );
              })
            )}
          </div>
        </div>

        {hasData && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border p-3",
              allRequiredMet
                ? "border-primary/20 bg-primary/5"
                : required.length === 0
                  ? "border-border bg-muted/10"
                  : "border-destructive/20 bg-destructive/5"
            )}
          >
            {allRequiredMet ? (
              <>
                <HugeiconsIcon icon={Tick02Icon} className="size-4 text-primary" strokeWidth={2} />
                <span className="text-xs font-medium text-primary">All required authorities are provided</span>
              </>
            ) : required.length === 0 ? (
              <span className="text-xs text-muted-foreground">Authorization data extracted from transaction result</span>
            ) : (
              <>
                <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-destructive" strokeWidth={2} />
                <span className="text-xs font-medium text-destructive">Missing required authorities</span>
              </>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Transaction Tree tab — show from resultTransaction OR action steps
// ---------------------------------------------------------------------------

const EVENT_TYPE_ICONS: Record<string, typeof Add01Icon> = {
  created: Add01Icon,
  exercised: PlayIcon,
  archived: Delete01Icon,
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  created: "text-event-create",
  exercised: "text-event-exercise",
  archived: "text-event-archive",
};

const STEP_TYPE_ICONS: Record<string, typeof Add01Icon> = {
  create_contract: Add01Icon,
  exercise_choice: PlayIcon,
  archive_contract: Delete01Icon,
};

interface TransactionTreeTabProps {
  trace: ExecutionTrace | null;
  currentStepIndex: number;
}

function TransactionTreeTab({ trace, currentStepIndex: _currentStepIndex }: TransactionTreeTabProps) {
  const tx = trace?.resultTransaction;

  // If we have a real result transaction, render from its events
  if (tx && Object.keys(tx.eventsById ?? {}).length > 0) {
    const rootIds = tx.rootEventIds ?? [];
    const events = tx.eventsById ?? {};

    const renderEvent = (eventId: string, depth: number = 0) => {
      const evt = events[eventId] as {
        eventType?: string;
        contractId?: string;
        templateId?: unknown;
        choice?: string;
        consuming?: boolean;
        childEventIds?: string[];
        payload?: Record<string, unknown>;
        choiceArgument?: Record<string, unknown>;
        signatories?: string[];
        observers?: string[];
        actingParties?: string[];
      };
      if (!evt) return null;

      const Icon = EVENT_TYPE_ICONS[evt.eventType ?? ""] ?? ArrowRight01Icon;
      const colorClass = EVENT_TYPE_COLORS[evt.eventType ?? ""] ?? "text-foreground";
      const templateLabel = evt.templateId ? formatTemplateId(evt.templateId as string | { moduleName: string; entityName: string; packageName?: string }) : "";

      const label = evt.eventType === "exercised"
        ? `Exercise ${evt.choice ?? "?"} on ${templateLabel}${evt.consuming ? " (consuming)" : ""}`
        : evt.eventType === "created"
          ? `Create ${templateLabel}`
          : evt.eventType === "archived"
            ? `Archive ${templateLabel}`
            : `${evt.eventType ?? "?"} ${templateLabel}`;

      // Pick the most relevant party list for this event type
      const parties = evt.eventType === "exercised"
        ? evt.actingParties
        : evt.signatories;

      return (
        <div key={eventId}>
          <div
            className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/30"
            style={{ paddingLeft: `${8 + depth * 16}px` }}
          >
            <HugeiconsIcon
              icon={Icon}
              className={cn("mt-0.5 size-3 flex-shrink-0", colorClass)}
              strokeWidth={2}
            />
            <div className="flex flex-col gap-0.5 overflow-hidden">
              <span className={cn("font-mono text-[11px] leading-tight", colorClass)}>{label}</span>
              {evt.contractId && (
                <span className="font-mono text-[10px] text-muted-foreground" title={evt.contractId}>
                  {truncateId(evt.contractId, 20)}
                </span>
              )}
              {parties && parties.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {parties.map(p => (
                    <span key={p} className="text-[9px] text-muted-foreground/70" title={p}>{formatPartyDisplay(p)}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Render children */}
          {(evt.childEventIds ?? []).map((childId) => renderEvent(childId, depth + 1))}
        </div>
      );
    };

    return (
      <ScrollArea className="max-h-[calc(100vh-360px)]">
        <div className="flex flex-col gap-0.5 p-2">
          <div className="mb-2 flex items-center gap-2 px-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Transaction {tx.updateId ? truncateId(tx.updateId, 12) : ""}
            </span>
          </div>
          {rootIds.map((id) => renderEvent(id))}
        </div>
      </ScrollArea>
    );
  }

  // Fallback: show action steps from the trace
  const actionSteps = (trace?.steps ?? []).filter((s) =>
    ["create_contract", "exercise_choice", "archive_contract"].includes(s.stepType)
  );

  if (actionSteps.length === 0) {
    return (
      <Empty className="py-8">
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyDescription>
            No transaction tree available
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ScrollArea className="max-h-[calc(100vh-360px)]">
      <div className="flex flex-col gap-0.5 p-2">
        {actionSteps.map((s) => {
          const Icon = STEP_TYPE_ICONS[s.stepType] ?? ArrowRight01Icon;
          return (
            <div
              key={s.stepNumber}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs"
            >
              <HugeiconsIcon icon={Icon} className="mt-0.5 size-3 flex-shrink-0" strokeWidth={2} />
              <span className="font-mono text-[11px]">{s.summary}</span>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Main context panel
// ---------------------------------------------------------------------------

export interface ContextPanelProps {
  trace: ExecutionTrace | null;
  currentStep: TraceStep | null;
  currentStepIndex: number;
}

export function ContextPanel({
  trace,
  currentStep,
  currentStepIndex,
}: ContextPanelProps) {
  if (!trace) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            Context
          </span>
        </div>
        <Empty className="flex-1">
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyDescription>
              Run a trace to see context
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <Tabs defaultValue="contracts" className="flex flex-1 flex-col">
        <TabsList className="mx-2 mt-2 grid w-auto grid-cols-4">
          <TabsTrigger value="contracts" className="text-[10px]">
            Contracts
          </TabsTrigger>
          <TabsTrigger value="auth" className="text-[10px]">
            Authorization
          </TabsTrigger>
          <TabsTrigger value="tree" className="text-[10px]">
            Tx Tree
          </TabsTrigger>
          <TabsTrigger value="profiler" className="text-[10px]">
            Profiler
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="flex-1">
          <ContractsTab step={currentStep} trace={trace} />
        </TabsContent>

        <TabsContent value="auth" className="flex-1">
          <AuthorizationTab
            step={currentStep}
            trace={trace}
            currentStepIndex={currentStepIndex}
          />
        </TabsContent>

        <TabsContent value="tree" className="flex-1">
          <TransactionTreeTab
            trace={trace}
            currentStepIndex={currentStepIndex}
          />
        </TabsContent>

        <TabsContent value="profiler" className="flex-1">
          {trace.profilerData ? (
            <ScrollArea className="max-h-[calc(100vh-360px)]">
              <pre className="p-3 text-xs text-foreground">
                {JSON.stringify(trace.profilerData, null, 2)}
              </pre>
            </ScrollArea>
          ) : (
            <Empty className="py-8">
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyDescription>
                  No profiling data available for this trace.
                  Profiler data is captured when the engine provides timing metrics.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
