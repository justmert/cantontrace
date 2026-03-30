import { useState, useCallback, useMemo, useEffect } from "react";
import { useDebuggerStore } from "@/stores/debugger-store";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Bug01Icon,
  AlertCircleIcon,
  LockIcon,
  DragDropVerticalIcon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type {
  SimulationRequest,
  SimulationResult,
  TraceRequest,
  ExecutionTrace,
} from "@/lib/types";
import { ApiRequestError, api } from "@/lib/api";
import { useSimulation, useTrace, useTraceNavigation } from "@/features/debugger/hooks";
import { useQuery } from "@tanstack/react-query";
import { CommandBuilder } from "./components/command-builder";
import { SimulationResultView } from "./components/simulation-result";
import { WhatIfPanel } from "./components/what-if-panel";
import { CodePanel } from "./components/code-panel";
import { StepsPanel } from "./components/steps-panel";
import { ContextPanel } from "./components/context-panel";

// ---------------------------------------------------------------------------
// Resizable triple-panel layout (from execution-trace)
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
      const container = document.getElementById("debugger-trace-panels");
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
      id="debugger-trace-panels"
      className="relative flex h-full overflow-hidden rounded-lg border border-border bg-background"
      style={{ cursor: dragging ? "col-resize" : undefined }}
    >
      {/* Left panel */}
      <div
        className="flex h-full flex-col overflow-hidden border-r border-border"
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
        className="flex h-full flex-col overflow-hidden border-r border-border"
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
// Main debugger page
// ---------------------------------------------------------------------------

export default function DebuggerPage() {
  // Persisted state (survives page navigation)
  const simResult = useDebuggerStore((s) => s.simResult);
  const setSimResult = useDebuggerStore((s) => s.setSimResult);
  const trace = useDebuggerStore((s) => s.trace);
  const setTrace = useDebuggerStore((s) => s.setTrace);
  const activeTab = useDebuggerStore((s) => s.activeTab);
  const setActiveTab = useDebuggerStore((s) => s.setActiveTab);
  const lastRequest = useDebuggerStore((s) => s.lastRequest);
  const setLastRequest = useDebuggerStore((s) => s.setLastRequest);
  const resetDebugger = useDebuggerStore((s) => s.reset);

  // Mutation state (not persisted — transient)
  const simulation = useSimulation();
  const traceMutation = useTrace();
  const navigation = useTraceNavigation(trace?.steps.length ?? 0);

  // Command builder collapsed state
  const [cmdCollapsed, setCmdCollapsed] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  // Read URL query params to pre-fill the command builder
  const urlInitialValues = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const contractId = params.get("contractId") ?? undefined;
    const template = params.get("template") ?? undefined;
    if (!contractId && !template) return undefined;
    return { contractId, template };
  }, []);

  // Handle simulate
  const handleSimulate = useCallback(
    (request: SimulationRequest) => {
      const cmd = request.commands[0];
      setLastRequest({
        packageId: cmd?.templateId.packageName ?? "",
        template: cmd?.templateId.entityName,
        choice: cmd?.choice ?? "",
        contractId: cmd?.contractId ?? "",
        args: cmd?.arguments ?? {},
        actAs: request.actAs.join(", "),
        readAs: request.readAs.join(", "),
        mode: request.mode,
        offset: request.historicalOffset ?? "",
      });

      setActiveTab("simulation");

      simulation.mutate(request, {
        onSuccess: (data) => {
          setSimResult(data);
        },
      });
    },
    [simulation, hasRun]
  );

  // Handle trace
  const { reset: navigationReset } = navigation;
  const handleTrace = useCallback(
    (request: TraceRequest) => {
      setActiveTab("trace");

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

  // Current step data for trace
  const currentStep = trace?.steps[navigation.currentStep] ?? null;
  const previousStep =
    navigation.currentStep > 0
      ? trace?.steps[navigation.currentStep - 1]
      : null;

  // Derive the package name from the trace steps
  const tracedPackageName = useMemo(() => {
    if (!trace) return undefined;
    for (const step of trace.steps) {
      if (step.context.templateId) {
        return step.context.templateId.packageName;
      }
    }
    return undefined;
  }, [trace]);

  // Resolve human-readable packageName to the actual hex packageId.
  // The TemplateId.packageName may be a name like "cantontrace-test" rather
  // than the hex hash that the /packages/:id/templates API expects.
  const { data: packagesSummary } = useQuery({
    queryKey: ["packages-summary"],
    queryFn: () => api.getPackages().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const tracedPackageId = useMemo(() => {
    if (!tracedPackageName) return undefined;
    // If it already looks like a hex hash (64+ chars, hex only), use as-is
    if (/^[0-9a-fA-F]{64}$/.test(tracedPackageName)) return tracedPackageName;
    // Otherwise resolve from name to ID
    const match = packagesSummary?.find(
      (p) => p.packageName === tracedPackageName
    );
    return match?.packageId ?? tracedPackageName;
  }, [tracedPackageName, packagesSummary]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* Page header */}
      <PageHeader
        icon={Bug01Icon}
        title="Debugger"
        subtitle="Build and debug Daml commands"
      >
        <div className="flex items-center gap-2">
          {trace && activeTab === "trace" && (
            <>
              {trace.error ? (
                <Badge variant="destructive">Failed</Badge>
              ) : (
                <Badge variant="secondary">Success</Badge>
              )}
              <span className="font-mono text-xs text-muted-foreground">
                {trace.steps.length} steps
              </span>
            </>
          )}
          {(simResult || trace) && (
            <button
              onClick={resetDebugger}
              className="ml-2 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
        {/* Command builder */}
        <CommandBuilder
          onSimulate={handleSimulate}
          onTrace={handleTrace}
          isSimulating={simulation.isPending}
          isTracing={traceMutation.isPending}
          collapsed={cmdCollapsed}
          onCollapsedChange={setCmdCollapsed}
          initialValues={urlInitialValues}
        />

        {/* Error display for simulation */}
        {simulation.isError && activeTab === "simulation" &&
          (() => {
            const err = simulation.error;
            const isAuthError =
              err instanceof ApiRequestError &&
              (err.status === 401 || err.status === 403);
            const isNetworkError =
              err instanceof ApiRequestError && err.status >= 500;

            return (
              <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4">
                <HugeiconsIcon
                  icon={isAuthError ? LockIcon : AlertCircleIcon}
                  className="mt-0.5 size-5 flex-shrink-0 text-destructive"
                  strokeWidth={2}
                />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-destructive">
                    {isAuthError
                      ? "Authentication / Authorization Error"
                      : isNetworkError
                        ? "Server Error"
                        : "Simulation Request Failed"}
                  </span>
                  <p className="text-sm text-destructive/80">
                    {err?.message ?? "An unknown error occurred"}
                  </p>
                  {isAuthError && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Check your connection and ensure your user has the required
                      CanActAs or CanReadAs rights for the specified parties.
                    </p>
                  )}
                  {isNetworkError && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      The API gateway or engine service may be unavailable.
                      Check your connection settings.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

        {/* Error display for trace */}
        {traceMutation.isError && activeTab === "trace" && (
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
        {trace?.error && activeTab === "trace" && (
          <div className="flex items-start gap-3 rounded-lg border border-muted-foreground/20 bg-muted/50 p-3">
            <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
            <p className="text-xs text-muted-foreground">
              Execution failed: {trace.error}
            </p>
          </div>
        )}

        {/* Tabbed result area — fills all remaining viewport height */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList variant="line">
            <TabsTrigger value="simulation">Simulation</TabsTrigger>
            <TabsTrigger value="trace">Trace</TabsTrigger>
          </TabsList>

          {/* Simulation tab */}
          <TabsContent value="simulation" className="min-h-0 flex-1 overflow-auto">
            {simulation.isPending && (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border bg-muted/20 py-16 text-center">
                <Spinner className="size-8" />
                <p className="text-sm text-muted-foreground">
                  Running simulation...
                </p>
              </div>
            )}

            {simResult && !simulation.isPending && (
              <div className="flex flex-col gap-4">
                <SimulationResultView result={simResult} />
                <Separator />
                <WhatIfPanel
                  originalResult={simResult}
                  initialRequest={lastRequest}
                />
              </div>
            )}

            {!simResult && !simulation.isPending && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="text-4xl text-muted-foreground/20">{">"}</div>
                <p className="text-sm text-muted-foreground">
                  Configure a command above and click Simulate to see results
                </p>
              </div>
            )}
          </TabsContent>

          {/* Trace tab */}
          <TabsContent value="trace" className="relative min-h-0 flex-1 overflow-hidden">
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
                  packageId={tracedPackageId}
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
                />
              }
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
