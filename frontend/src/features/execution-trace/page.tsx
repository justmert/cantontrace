import { useState, useEffect, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Bug01Icon, AlertCircleIcon, DragDropVerticalIcon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { TraceRequest, ExecutionTrace } from "@/lib/types";
import { CommandForm } from "./components/command-form";
import { CodePanel } from "./components/code-panel";
import { StepsPanel } from "./components/steps-panel";
import { ContextPanel } from "./components/context-panel";
import { useTrace, useTraceNavigation } from "./hooks";

// ---------------------------------------------------------------------------
// Resizable panel layout
// ---------------------------------------------------------------------------

interface ResizableTriplePanelProps {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
}

function ResizableTriplePanel({
  left,
  center,
  right,
}: ResizableTriplePanelProps) {
  const [leftWidth, setLeftWidth] = useState(38);
  const [rightWidth, setRightWidth] = useState(28);
  const [dragging, setDragging] = useState<"left" | "right" | null>(null);

  const handleMouseDown = useCallback(
    (side: "left" | "right") => (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(side);
    },
    []
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById("trace-panels");
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = (x / rect.width) * 100;

      if (dragging === "left") {
        const newLeft = Math.max(20, Math.min(60, pct));
        setLeftWidth(newLeft);
      } else {
        const newRight = Math.max(15, Math.min(50, 100 - pct));
        setRightWidth(newRight);
      }
    };

    const handleMouseUp = () => setDragging(null);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  const centerWidth = 100 - leftWidth - rightWidth;

  return (
    <div
      id="trace-panels"
      className="relative flex h-full overflow-hidden rounded-lg border"
      style={{ cursor: dragging ? "col-resize" : undefined }}
    >
      {/* Left panel */}
      <div
        className="flex h-full flex-col overflow-hidden border-r"
        style={{ width: `${leftWidth}%` }}
      >
        {left}
      </div>

      {/* Left resize handle */}
      <div
        className="group relative z-10 flex w-1.5 cursor-col-resize items-center justify-center hover:bg-accent"
        onMouseDown={handleMouseDown("left")}
      >
        <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4 text-muted-foreground/30 group-hover:text-primary" strokeWidth={2} />
      </div>

      {/* Center panel */}
      <div
        className="flex h-full flex-col overflow-hidden border-r"
        style={{ width: `${centerWidth}%` }}
      >
        {center}
      </div>

      {/* Right resize handle */}
      <div
        className="group relative z-10 flex w-1.5 cursor-col-resize items-center justify-center hover:bg-accent"
        onMouseDown={handleMouseDown("right")}
      >
        <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4 text-muted-foreground/30 group-hover:text-primary" strokeWidth={2} />
      </div>

      {/* Right panel */}
      <div
        className="flex h-full flex-col overflow-hidden"
        style={{ width: `${rightWidth}%` }}
      >
        {right}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ExecutionTracePage() {
  const traceMutation = useTrace();
  const [trace, setTrace] = useState<ExecutionTrace | null>(null);
  const navigation = useTraceNavigation(trace?.steps.length ?? 0);

  const { reset: navigationReset } = navigation;
  const handleTrace = useCallback(
    (request: TraceRequest) => {
      traceMutation.mutate(request, {
        onSuccess: (data) => {
          setTrace(data);
          navigationReset();
        },
        onError: () => {
          // Keep previous trace visible but don't crash
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [traceMutation.mutate, navigationReset]
  );

  // Current step data
  const currentStep = trace?.steps[navigation.currentStep] ?? null;
  const previousStep =
    navigation.currentStep > 0
      ? trace?.steps[navigation.currentStep - 1]
      : null;

  // Cross-feature navigation handlers
  const handleNavigateContract = useCallback((contractId: string) => {
    window.location.href = `/contracts/${encodeURIComponent(contractId)}`;
  }, []);

  const handleNavigateTemplate = useCallback((templateId: string) => {
    window.location.href = `/templates/${encodeURIComponent(templateId)}`;
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <HugeiconsIcon icon={Bug01Icon} strokeWidth={2} className="size-5 text-primary" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Execution Trace</h1>
          <p className="text-xs text-muted-foreground">
            Step through Daml command execution with full source mapping
          </p>
        </div>
        {trace && (
          <div className="flex items-center gap-2">
            {trace.error ? (
              <Badge variant="destructive">Failed</Badge>
            ) : (
              <Badge variant="secondary">
                Success
              </Badge>
            )}
            <span className="font-mono text-xs text-muted-foreground">
              {trace.steps.length} steps
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">

      {/* Command form (collapsible) */}
      <CommandForm
        onTrace={handleTrace}
        isTracing={traceMutation.isPending}
      />

      {/* Trace error */}
      {traceMutation.isError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-5 flex-shrink-0 text-destructive" strokeWidth={2} />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-destructive">
              Trace Failed
            </span>
            <p className="text-xs text-destructive/80">
              {traceMutation.error?.message ?? "An unknown error occurred"}
            </p>
          </div>
        </div>
      )}

      {/* Execution error from trace result */}
      {trace?.error && (
        <div className="flex items-start gap-3 rounded-lg border border-muted-foreground/20 bg-muted/50 p-3">
          <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
          <p className="text-xs text-muted-foreground">
            Execution failed: {trace.error}
          </p>
        </div>
      )}

      {/* Three-panel debugger */}
      <div className="relative flex-1" style={{ minHeight: 0 }}>
        {/* Loading overlay */}
        {traceMutation.isPending && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <Spinner className="size-8" />
              <p className="text-sm font-medium text-muted-foreground">
                Tracing command execution...
              </p>
            </div>
          </div>
        )}

        <ResizableTriplePanel
          left={
            <CodePanel
              sourceFiles={trace?.sourceFiles ?? {}}
              sourceAvailable={trace?.sourceAvailable ?? false}
              currentStep={currentStep}
              variables={currentStep?.variables ?? {}}
              previousVariables={previousStep?.variables}
            />
          }
          center={
            <StepsPanel
              steps={trace?.steps ?? []}
              navigation={navigation}
            />
          }
          right={
            <ContextPanel
              trace={trace}
              currentStep={currentStep}
              currentStepIndex={navigation.currentStep}
              onNavigateContract={handleNavigateContract}
              onNavigateTemplate={handleNavigateTemplate}
            />
          }
        />
      </div>
      </div>
    </div>
  );
}
