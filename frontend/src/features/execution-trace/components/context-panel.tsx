import { useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FileAttachmentIcon,
  GitBranchIcon,
  BarChartIcon,
  LinkSquare01Icon,
  Tick02Icon,
  Cancel01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
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
  onNavigateContract?: (contractId: string) => void;
  onNavigateTemplate?: (templateId: string) => void;
}

function ContractsTab({ step, onNavigateContract, onNavigateTemplate }: ContractsTabProps) {
  const payloads = step?.context.contractPayloads ?? {};
  const contractIds = Object.keys(payloads);

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
          const keyFields = Object.entries(payload).slice(0, 3);
          return (
            <div
              key={cid}
              className="flex flex-col gap-1.5 rounded-md border bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs">
                  {truncateId(cid, 10)}
                </span>
                <Badge variant="outline" className="flex-shrink-0 text-[9px]">
                  ACS
                </Badge>
              </div>
              {keyFields.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {keyFields.map(([k, v]) => (
                    <span key={k} className="text-[10px]">
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
              <div className="mt-1 flex items-center gap-3">
                {onNavigateContract && (
                  <button
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                    onClick={() => onNavigateContract(cid)}
                  >
                    <HugeiconsIcon icon={LinkSquare01Icon} className="size-2.5" strokeWidth={2} />
                    View Lifecycle
                  </button>
                )}
                {onNavigateTemplate && step?.context.templateId && (
                  <button
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                    onClick={() => {
                      const tid = step.context.templateId;
                      if (tid) {
                        onNavigateTemplate(`${tid.packageName}:${tid.moduleName}:${tid.entityName}`);
                      }
                    }}
                  >
                    <HugeiconsIcon icon={LinkSquare01Icon} className="size-2.5" strokeWidth={2} />
                    View Template
                  </button>
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
}

function AuthorizationTab({ step }: AuthorizationTabProps) {
  const ctx = step?.context;
  const required = ctx?.requiredAuthority ?? [];
  const provided = ctx?.providedAuthority ?? [];

  const allRequired = required.every((r) => provided.includes(r));

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
              allRequired
                ? "border-primary/20 bg-primary/5"
                : "border-destructive/20 bg-destructive/5"
            )}
          >
            {allRequired ? (
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
// Transaction Tree tab (ReactFlow)
// ---------------------------------------------------------------------------

interface TransactionTreeTabProps {
  steps: TraceStep[];
  currentStepIndex: number;
}

function TransactionTreeTab({
  steps,
  currentStepIndex,
}: TransactionTreeTabProps) {
  const { nodes, edges } = useMemo(() => {
    const treeNodes: Node[] = [];
    const treeEdges: Edge[] = [];

    const actionSteps = steps.filter((s) =>
      ["create_contract", "exercise_choice", "archive_contract"].includes(
        s.stepType
      )
    );

    let prevId: string | null = null;
    actionSteps.forEach((step, idx) => {
      const nodeId = `step-${step.stepNumber}`;
      const isFuture = step.stepNumber > currentStepIndex + 1;

      let label = step.summary;
      if (label.length > 40) label = label.slice(0, 37) + "...";

      const bgColor = isFuture
        ? "#f3f4f6"
        : step.stepType === "create_contract"
        ? "#dcfce7"
        : step.stepType === "archive_contract"
        ? "#fee2e2"
        : "#dbeafe";

      treeNodes.push({
        id: nodeId,
        position: { x: 20, y: idx * 80 },
        data: { label },
        style: {
          background: bgColor,
          border: isFuture ? "1px dashed #d1d5db" : "1px solid #9ca3af",
          borderRadius: "6px",
          padding: "8px 12px",
          fontSize: "11px",
          opacity: isFuture ? 0.5 : 1,
          width: 220,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      });

      if (prevId) {
        treeEdges.push({
          id: `e-${prevId}-${nodeId}`,
          source: prevId,
          target: nodeId,
          animated: !isFuture,
          style: { stroke: isFuture ? "#d1d5db" : "#6b7280" },
        });
      }

      prevId = nodeId;
    });

    return { nodes: treeNodes, edges: treeEdges };
  }, [steps, currentStepIndex]);

  if (nodes.length === 0) {
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
    <div className="h-[calc(100vh-360px)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        panOnDrag
        zoomOnScroll
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profiler tab
// ---------------------------------------------------------------------------

interface ProfilerTabProps {
  profilerData: unknown;
  steps: TraceStep[];
}

function ProfilerTab({ profilerData, steps }: ProfilerTabProps) {
  if (!profilerData) {
    return (
      <Empty className="py-8">
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={BarChartIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyDescription>
            Profiling data not available. Enterprise Sandbox feature. The step-by-step trace still works fully.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const stepCounts = steps.reduce(
    (acc, s) => {
      acc[s.stepType] = (acc[s.stepType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const chartData = Object.entries(stepCounts).map(([type, count]) => ({
    name: type.replace(/_/g, " "),
    count,
  }));

  return (
    <div className="flex flex-col gap-3 p-3">
      <h3 className="text-xs font-medium text-muted-foreground">
        Step Distribution
      </h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
          <RechartsTooltip />
          <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main context panel
// ---------------------------------------------------------------------------

export interface ContextPanelProps {
  trace: ExecutionTrace | null;
  currentStep: TraceStep | null;
  currentStepIndex: number;
  onNavigateContract?: (contractId: string) => void;
  onNavigateTemplate?: (templateId: string) => void;
}

export function ContextPanel({
  trace,
  currentStep,
  currentStepIndex,
  onNavigateContract,
  onNavigateTemplate,
}: ContextPanelProps) {
  if (!trace) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2">
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
    <div className="flex h-full flex-col">
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
          <ContractsTab
            step={currentStep}
            onNavigateContract={onNavigateContract}
            onNavigateTemplate={onNavigateTemplate}
          />
        </TabsContent>

        <TabsContent value="auth" className="flex-1">
          <AuthorizationTab step={currentStep} />
        </TabsContent>

        <TabsContent value="tree" className="flex-1">
          <TransactionTreeTab
            steps={trace.steps}
            currentStepIndex={currentStepIndex}
          />
        </TabsContent>

        <TabsContent value="profiler" className="flex-1">
          <ProfilerTab
            profilerData={trace.profilerData}
            steps={trace.steps}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
