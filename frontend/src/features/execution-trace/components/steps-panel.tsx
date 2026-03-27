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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from "@/components/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { TraceStep, TraceStepType } from "@/lib/types";
import type { TraceNavigation } from "../hooks";

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
// Step detail (expandable)
// ---------------------------------------------------------------------------

function StepExpandedContent({ step }: { step: TraceStep }) {
  const ctx = step.context;
  return (
    <div className="mt-2 flex flex-col gap-2 text-xs">
      {/* Variables */}
      {Object.keys(step.variables).length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Variables
          </span>
          <div className="overflow-hidden rounded border bg-muted/30 p-2">
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px]">
              {JSON.stringify(step.variables, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Contract payloads */}
      {ctx.contractPayloads &&
        Object.keys(ctx.contractPayloads).length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Contract Payloads
            </span>
            <div className="overflow-hidden rounded border bg-muted/30 p-2">
              <pre className="whitespace-pre-wrap break-all font-mono text-[11px]">
                {JSON.stringify(ctx.contractPayloads, null, 2)}
              </pre>
            </div>
          </div>
        )}

      {/* Authority sets */}
      {(ctx.requiredAuthority || ctx.providedAuthority) && (
        <div className="flex gap-4">
          {ctx.requiredAuthority && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Required Authority
              </span>
              <div className="flex flex-wrap gap-1">
                {ctx.requiredAuthority.map((a) => (
                  <Badge
                    key={a}
                    variant="outline"
                    className="max-w-full font-mono text-[9px]"
                  >
                    <span className="truncate">{a}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {ctx.providedAuthority && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Provided Authority
              </span>
              <div className="flex flex-wrap gap-1">
                {ctx.providedAuthority.map((a) => (
                  <Badge
                    key={a}
                    variant="outline"
                    className="max-w-full font-mono text-[9px]"
                  >
                    <span className="truncate">{a}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Guard info */}
      {ctx.guardExpression && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Guard
          </span>
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px]">
              {ctx.guardExpression}
            </code>
            {ctx.guardResult !== undefined && (
              <Badge
                variant={ctx.guardResult ? "default" : "destructive"}
                className="text-[9px]"
              >
                {ctx.guardResult ? "passed" : "failed"}
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {step.error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
          <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-3.5 flex-shrink-0 text-destructive" strokeWidth={2} />
          <p className="text-xs text-destructive">{step.error}</p>
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
  onClick: () => void;
}

function StepRow({ step, isCurrent, onClick }: StepRowProps) {
  const [expanded, setExpanded] = React.useState(isCurrent);
  const Icon = STEP_ICONS[step.stepType];

  // Auto-expand when this step becomes current, auto-collapse when it loses focus
  React.useEffect(() => {
    setExpanded(isCurrent);
  }, [isCurrent]);

  return (
    <div
      className={cn(
        "flex flex-col border-l-2 px-3 py-2 transition-colors",
        isCurrent
          ? "border-primary bg-primary/5"
          : step.passed
          ? "border-primary/30 hover:bg-muted/50"
          : "border-destructive bg-destructive/5",
        "cursor-pointer"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        {/* Step number */}
        <span className="w-6 text-right font-mono text-[10px] text-muted-foreground">
          {step.stepNumber}
        </span>

        {/* Type icon */}
        <HugeiconsIcon
          icon={Icon}
          className={cn(
            "size-3.5 flex-shrink-0",
            step.passed
              ? "text-muted-foreground"
              : "text-destructive"
          )}
          strokeWidth={2}
        />

        {/* Summary */}
        <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">
              {STEP_TYPE_LABELS[step.stepType]}
            </span>
            {step.sourceLocation && (
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {step.sourceLocation.file.split("/").pop()}:
                {step.sourceLocation.startLine}
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
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

      {/* Failed step error banner */}
      {!step.passed && !expanded && step.error && (
        <div className="ml-8 mt-1.5 truncate rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          {step.error}
        </div>
      )}

      {/* Expanded details */}
      {expanded && <StepExpandedContent step={step} />}
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
    <div className="flex h-full flex-col bg-background">
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
          <span className="font-mono text-[10px] text-muted-foreground">
            Step {navigation.currentStep + 1} of {navigation.totalSteps}
          </span>
        </div>
      </div>

      {/* Steps list */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {steps.map((step) => (
            <StepRow
              key={step.stepNumber}
              step={step}
              isCurrent={step.stepNumber === navigation.currentStep + 1}
              onClick={() => navigation.setStep(step.stepNumber - 1)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
