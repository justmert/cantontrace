import { useState, useCallback, useMemo, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Bug01Icon,
  AlertCircleIcon,
  LockIcon,
  DragDropVerticalIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type {
  SimulationRequest,
  SimulationResult,
  ExecuteRequest,
  ExecuteResult,
  TraceRequest,
  ExecutionTrace,
} from "@/lib/types";
import { ApiRequestError, api } from "@/lib/api";
import { useSimulation, useExecute, useTrace, useTraceNavigation } from "@/features/debugger/hooks";
import { useConnectionStore } from "@/stores/connection-store";
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
        className="h-full overflow-hidden border-r border-border"
        style={{ flex: `0 0 ${leftWidth}%`, maxWidth: `${leftWidth}%` }}
      >
        {left}
      </div>

      {/* Left resize handle */}
      <div
        className="group relative z-10 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center hover:bg-accent"
        onMouseDown={handleMouseDown("left")}
      >
        <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4 text-muted-foreground/30 group-hover:text-primary" strokeWidth={2} />
      </div>

      {/* Center panel */}
      <div
        className="h-full overflow-hidden border-r border-border"
        style={{ flex: `0 0 ${centerWidth}%`, maxWidth: `${centerWidth}%` }}
      >
        {center}
      </div>

      {/* Right resize handle */}
      <div
        className="group relative z-10 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center hover:bg-accent"
        onMouseDown={handleMouseDown("right")}
      >
        <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4 text-muted-foreground/30 group-hover:text-primary" strokeWidth={2} />
      </div>

      {/* Right panel */}
      <div
        className="h-full overflow-hidden"
        style={{ flex: `0 0 ${rightWidth}%`, maxWidth: `${rightWidth}%` }}
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
  // Connection store for refreshing bootstrap after execute
  const connectionStore = useConnectionStore();

  // Local state (reset on page navigation — avoids stale Zustand persistence)
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [lastExecuteResult, setLastExecuteResult] = useState<ExecuteResult | null>(null);
  const [trace, setTrace] = useState<ExecutionTrace | null>(null);
  const [activeTab, setActiveTab] = useState("simulation");
  const [lastRequest, setLastRequest] = useState<Record<string, unknown>>({});
  const [executeBanner, setExecuteBanner] = useState<string | null>(null);
  const resetDebugger = useCallback(() => {
    setSimResult(null);
    setLastExecuteResult(null);
    setTrace(null);
    setActiveTab("simulation");
    setLastRequest({});
    setExecuteBanner(null);
  }, []);

  // Mutation state (not persisted — transient)
  const simulation = useSimulation();
  const executeMutation = useExecute();
  const traceMutation = useTrace();
  const navigation = useTraceNavigation(trace?.steps.length ?? 0);

  // Command builder collapsed state
  const [cmdCollapsed, setCmdCollapsed] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  // Read URL query params to pre-fill the command builder
  const urlInitialValues = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const values: Record<string, string | undefined> = {};
    let hasAny = false;

    for (const key of ["contractId", "template", "choice", "package", "packageId", "mode", "actAs", "readAs", "offset"]) {
      const v = params.get(key);
      if (v) {
        // "package" maps to "packageId" in initialValues
        values[key === "package" ? "packageId" : key] = v;
        hasAny = true;
      }
    }

    if (!hasAny) return undefined;
    return values;
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

  // Handle execute
  const handleExecute = useCallback(
    (request: ExecuteRequest) => {
      setActiveTab("simulation");
      setExecuteBanner(null);

      executeMutation.mutate(request, {
        onSuccess: (data) => {
          setLastExecuteResult(data);
          // Convert ExecuteResult to SimulationResult shape for display
          if (data.transactionTree) {
            setSimResult({
              mode: "online",
              success: data.success,
              transactionTree: data.transactionTree,
              inputContracts: data.inputContracts,
              error: data.error,
              simulatedAt: data.executedAt,
              atOffset: data.completionOffset,
              stateDriftWarning: data.success
                ? "This transaction was committed to the ledger."
                : "Execution failed -- see error details.",
            });
          }
          if (data.success) {
            const txId = data.updateId
              ? data.updateId.length > 16
                ? data.updateId.slice(0, 16) + "..."
                : data.updateId
              : "unknown";
            setExecuteBanner(
              `Command submitted successfully. Transaction: ${txId}`
            );
            // Refresh bootstrap data (new contracts, new offset)
            connectionStore.refreshBootstrap();
          }
        },
      });
    },
    [executeMutation, connectionStore]
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
    staleTime: 60_000,
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
          {lastExecuteResult?.success && (
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">Committed</Badge>
          )}
          {(simResult || trace) && (
            <button
              onClick={resetDebugger}
              className="ml-2 text-xs text-muted-foreground hover:text-destructive transition-colors"
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
          onExecute={handleExecute}
          isSimulating={simulation.isPending}
          isTracing={traceMutation.isPending}
          isExecuting={executeMutation.isPending}
          collapsed={cmdCollapsed}
          onCollapsedChange={setCmdCollapsed}
          initialValues={urlInitialValues}
        />

        {/* Success banner for execution */}
        {executeBanner && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-3">
            <HugeiconsIcon
              icon={Tick02Icon}
              className="size-5 flex-shrink-0 text-emerald-600"
              strokeWidth={2}
            />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {executeBanner}
            </span>
            <button
              onClick={() => setExecuteBanner(null)}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error display for execution */}
        {executeMutation.isError && activeTab === "simulation" &&
          (() => {
            const err = executeMutation.error;
            return (
              <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4">
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  className="mt-0.5 size-5 flex-shrink-0 text-destructive"
                  strokeWidth={2}
                />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-destructive">
                    Execution Failed
                  </span>
                  <p className="text-sm text-destructive/80">
                    {err?.message ?? "An unknown error occurred during execution"}
                  </p>
                </div>
              </div>
            );
          })()}

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
            {(simulation.isPending || executeMutation.isPending) && (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border bg-muted/20 py-16 text-center">
                <Spinner className="size-8" />
                <p className="text-sm text-muted-foreground">
                  {executeMutation.isPending ? "Executing command on ledger..." : "Running simulation..."}
                </p>
              </div>
            )}

            {simResult && !simulation.isPending && !executeMutation.isPending && (
              <div className="flex flex-col gap-4">
                <SimulationResultView result={simResult} />
                <Separator />
                <WhatIfPanel
                  originalResult={simResult}
                  initialRequest={lastRequest}
                />
              </div>
            )}

            {!simResult && !simulation.isPending && !executeMutation.isPending && (
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
