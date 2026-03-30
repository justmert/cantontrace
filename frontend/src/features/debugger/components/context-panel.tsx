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
} from "@hugeicons/core-free-icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from "@/components/ui/empty";
import { cn, truncateId } from "@/lib/utils";
import type {
  TraceStep,
  ExecutionTrace,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Contracts tab
// ---------------------------------------------------------------------------

interface ContractsTabProps {
  step: TraceStep | null;
}

function ContractsTab({ step }: ContractsTabProps) {
  const payloads = step?.context.contractPayloads ?? {};
  const contractIds = Object.keys(payloads);
  const templateId = step?.context.templateId;
  const templateLabel = templateId
    ? `${templateId.moduleName}:${templateId.entityName}`
    : null;

  if (contractIds.length === 0) {
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
        {contractIds.map((cid) => {
          const payload = payloads[cid];
          const keyFields = Object.entries(payload).slice(0, 4);
          return (
            <div
              key={cid}
              className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
            >
              {/* Template name */}
              {templateLabel && (
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {templateLabel}
                </span>
              )}
              <div className="flex items-center justify-between gap-2">
                <span
                  className="truncate font-mono text-xs text-foreground"
                  title={cid}
                >
                  {truncateId(cid, 16)}
                </span>
                <Badge variant="outline" className="flex-shrink-0 text-[9px]">
                  ACS
                </Badge>
              </div>
              {/* Payload preview */}
              {keyFields.length > 0 && (
                <div className="flex flex-col gap-0.5 rounded border border-border bg-muted/30 p-2">
                  {keyFields.map(([k, v]) => (
                    <span key={k} className="text-[10px] text-foreground">
                      <span className="text-muted-foreground">{k}:</span>{" "}
                      <span className="font-mono">
                        {typeof v === "string"
                          ? v.length > 30
                            ? v.slice(0, 30) + "..."
                            : v
                          : JSON.stringify(v)}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3">
                <a
                  href={`/contracts/${encodeURIComponent(cid)}`}
                  className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                >
                  <HugeiconsIcon icon={LinkSquare01Icon} className="size-2.5" strokeWidth={2} />
                  View Lifecycle
                </a>
                {templateId && (
                  <a
                    href={`/templates?package=${encodeURIComponent(templateId.packageName)}&template=${encodeURIComponent(templateId.moduleName + ":" + templateId.entityName)}`}
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    <HugeiconsIcon icon={LinkSquare01Icon} className="size-2.5" strokeWidth={2} />
                    View Template
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Authorization tab
// ---------------------------------------------------------------------------

interface AuthorizationTabProps {
  step: TraceStep | null;
  allSteps: TraceStep[];
  currentStepIndex: number;
}

function AuthorizationTab({ step, allSteps, currentStepIndex }: AuthorizationTabProps) {
  // If current step has auth data, use it directly.
  // Otherwise, aggregate from the nearest check_authorization step at or before currentStepIndex.
  const authData = useMemo(() => {
    const ctx = step?.context;
    if (ctx?.requiredAuthority?.length || ctx?.providedAuthority?.length) {
      return { required: ctx.requiredAuthority ?? [], provided: ctx.providedAuthority ?? [] };
    }
    // Search backwards for the nearest check_authorization step
    for (let i = currentStepIndex; i >= 0; i--) {
      const s = allSteps[i];
      if (s?.stepType === "check_authorization") {
        const sCtx = s.context;
        if (sCtx?.requiredAuthority?.length || sCtx?.providedAuthority?.length) {
          return { required: sCtx.requiredAuthority ?? [], provided: sCtx.providedAuthority ?? [] };
        }
      }
    }
    // Also aggregate all unique auth data from all check_authorization steps up to current
    const allRequired = new Set<string>();
    const allProvided = new Set<string>();
    for (let i = 0; i <= currentStepIndex; i++) {
      const s = allSteps[i];
      if (s?.stepType === "check_authorization") {
        for (const r of s.context.requiredAuthority ?? []) allRequired.add(r);
        for (const p of s.context.providedAuthority ?? []) allProvided.add(p);
      }
    }
    if (allRequired.size > 0 || allProvided.size > 0) {
      return { required: [...allRequired], provided: [...allProvided] };
    }
    return { required: [] as string[], provided: [] as string[] };
  }, [step, allSteps, currentStepIndex]);

  const required = authData.required;
  const provided = authData.provided;

  const allRequiredMet = required.every((r) => provided.includes(r));

  return (
    <ScrollArea className="max-h-[calc(100vh-360px)]">
      <div className="flex flex-col gap-4 p-3">
        {/* Provided (Acting As) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Acting As (Provided)
          </span>
          <div className="flex flex-wrap gap-1">
            {provided.length === 0 ? (
              <span className="text-xs text-muted-foreground">None</span>
            ) : (
              provided.map((p) => (
                <Badge
                  key={p}
                  variant="outline"
                  className="max-w-full font-mono text-[10px]"
                >
                  <span className="truncate">{p}</span>
                </Badge>
              ))
            )}
          </div>
        </div>

        {/* Required signatories */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Required Signatories
          </span>
          <div className="flex flex-wrap gap-1">
            {required.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                No signatories required at this step
              </span>
            ) : (
              required.map((r) => {
                const met = provided.includes(r);
                return (
                  <Badge
                    key={r}
                    variant="outline"
                    className={cn(
                      "flex max-w-full items-center gap-1 font-mono text-[10px]",
                      met
                        ? "border-primary/30 text-primary"
                        : "border-destructive/30 text-destructive"
                    )}
                  >
                    {met ? (
                      <HugeiconsIcon icon={Tick02Icon} className="size-2.5 shrink-0" strokeWidth={2} />
                    ) : (
                      <HugeiconsIcon icon={Cancel01Icon} className="size-2.5 shrink-0" strokeWidth={2} />
                    )}
                    <span className="truncate">{r}</span>
                  </Badge>
                );
              })
            )}
          </div>
        </div>

        {/* Overall status */}
        {required.length > 0 && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border p-3",
              allRequiredMet
                ? "border-primary/20 bg-primary/5"
                : "border-destructive/20 bg-destructive/5"
            )}
          >
            {allRequiredMet ? (
              <>
                <HugeiconsIcon icon={Tick02Icon} className="size-4 text-primary" strokeWidth={2} />
                <span className="text-xs font-medium text-primary">
                  All required authorities are provided
                </span>
              </>
            ) : (
              <>
                <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-destructive" strokeWidth={2} />
                <span className="text-xs font-medium text-destructive">
                  Missing required authorities
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Transaction Tree tab — simple indented text tree
// ---------------------------------------------------------------------------

const STEP_TYPE_ICONS: Record<string, typeof Add01Icon> = {
  create_contract: Add01Icon,
  exercise_choice: PlayIcon,
  archive_contract: Delete01Icon,
};

const STEP_TYPE_COLORS: Record<string, string> = {
  create_contract: "text-primary",
  exercise_choice: "text-foreground",
  archive_contract: "text-destructive",
};

interface TransactionTreeTabProps {
  steps: TraceStep[];
  currentStepIndex: number;
}

function TransactionTreeTab({
  steps,
  currentStepIndex,
}: TransactionTreeTabProps) {
  const actionSteps = useMemo(
    () =>
      steps.filter((s) =>
        ["create_contract", "exercise_choice", "archive_contract"].includes(
          s.stepType
        )
      ),
    [steps]
  );

  if (actionSteps.length === 0) {
    return (
      <Empty className="py-8">
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyDescription>
            No action steps in trace yet
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ScrollArea className="max-h-[calc(100vh-360px)]">
      <div className="flex flex-col gap-0.5 p-2">
        {actionSteps.map((step) => {
          const isCurrent = step.stepNumber === currentStepIndex + 1;
          const isFuture = step.stepNumber > currentStepIndex + 1;
          const Icon = STEP_TYPE_ICONS[step.stepType] ?? ArrowRight01Icon;
          const colorClass = STEP_TYPE_COLORS[step.stepType] ?? "text-foreground";

          let label = step.summary;
          if (label.length > 55) label = label.slice(0, 52) + "...";

          return (
            <div
              key={step.stepNumber}
              className={cn(
                "flex items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                isCurrent
                  ? "bg-primary/10 border border-primary/20"
                  : "border border-transparent",
                isFuture && "opacity-40"
              )}
            >
              <HugeiconsIcon
                icon={Icon}
                className={cn("mt-0.5 size-3 flex-shrink-0", colorClass)}
                strokeWidth={2}
              />
              <div className="flex flex-col gap-0.5 overflow-hidden">
                <span
                  className={cn(
                    "font-mono text-[11px] leading-tight",
                    isCurrent ? "font-semibold text-foreground" : "text-foreground"
                  )}
                >
                  {label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Step {step.stepNumber}
                  {step.passed ? "" : " — failed"}
                </span>
              </div>
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
        <TabsList className="mx-2 mt-2 grid w-auto grid-cols-3">
          <TabsTrigger value="contracts" className="text-[10px]">
            Contracts
          </TabsTrigger>
          <TabsTrigger value="auth" className="text-[10px]">
            Authorization
          </TabsTrigger>
          <TabsTrigger value="tree" className="text-[10px]">
            Tx Tree
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="flex-1">
          <ContractsTab step={currentStep} />
        </TabsContent>

        <TabsContent value="auth" className="flex-1">
          <AuthorizationTab
            step={currentStep}
            allSteps={trace.steps}
            currentStepIndex={currentStepIndex}
          />
        </TabsContent>

        <TabsContent value="tree" className="flex-1">
          <TransactionTreeTab
            steps={trace.steps}
            currentStepIndex={currentStepIndex}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
