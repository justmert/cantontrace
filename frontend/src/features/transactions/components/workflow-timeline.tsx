import React, { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
  type NodeTypes,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { HugeiconsIcon } from "@hugeicons/react";
import { Maximize01Icon, GitBranchIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { truncateId } from "@/lib/utils";
import type { WorkflowTimeline as WorkflowTimelineType } from "@/lib/types";
import {
  WorkflowTransactionCard,
  type WorkflowTransactionNodeData,
  type TransactionCardNode,
} from "./workflow-transaction-card";

// ---------------------------------------------------------------------------
// Node types registration
// ---------------------------------------------------------------------------

const nodeTypes: NodeTypes = {
  transactionCard: WorkflowTransactionCard,
};

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

const NODE_WIDTH = 240;
const NODE_GAP_X = 100;
const NODE_GAP_Y = 40;

function buildNodesAndEdges(
  timeline: WorkflowTimelineType,
  selectedUpdateId: string | null,
  onNodeClick: (updateId: string) => void
): { nodes: TransactionCardNode[]; edges: Edge[] } {
  const transactions = [...timeline.transactions].sort(
    (a, b) => new Date(a.recordTime).getTime() - new Date(b.recordTime).getTime()
  );

  const txIndexMap = new Map<string, number>();
  transactions.forEach((tx, i) => txIndexMap.set(tx.updateId, i));

  // Build nodes positioned chronologically left to right
  const nodes: TransactionCardNode[] = transactions.map((tx, idx) => ({
    id: tx.updateId,
    type: "transactionCard" as const,
    position: {
      x: idx * (NODE_WIDTH + NODE_GAP_X),
      y: NODE_GAP_Y,
    },
    data: {
      transaction: tx,
      isSelected: tx.updateId === selectedUpdateId,
      onClick: onNodeClick,
    } satisfies WorkflowTransactionNodeData,
    draggable: true,
  }));

  // Build edges from contract flows
  const edges: Edge[] = timeline.contractFlows.map((flow, idx) => ({
    id: `flow-${idx}`,
    source: flow.fromUpdateId,
    target: flow.toUpdateId,
    label: truncateId(flow.contractId, 6),
    type: "smoothstep",
    animated: false,
    style: { strokeWidth: 2 },
    labelStyle: { fontSize: 10, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" },
    labelBgStyle: { fill: "hsl(var(--card))", fillOpacity: 0.9 },
    labelBgPadding: [4, 2] as [number, number],
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
    },
  }));

  // Add trace-context-based edges (dashed) for transactions sharing trace context
  // but not already connected by contract flows
  const flowPairs = new Set(
    timeline.contractFlows.map((f) => `${f.fromUpdateId}:${f.toUpdateId}`)
  );

  const traceGroups = new Map<string, string[]>();
  transactions.forEach((tx) => {
    if (tx.traceContext?.traceParent) {
      const traceId = tx.traceContext.traceParent;
      if (!traceGroups.has(traceId)) {
        traceGroups.set(traceId, []);
      }
      traceGroups.get(traceId)!.push(tx.updateId);
    }
  });

  let traceEdgeIdx = 0;
  for (const [, group] of traceGroups) {
    for (let i = 0; i < group.length - 1; i++) {
      const source = group[i];
      const target = group[i + 1];
      const pairKey = `${source}:${target}`;
      if (!flowPairs.has(pairKey)) {
        edges.push({
          id: `trace-${traceEdgeIdx++}`,
          source,
          target,
          type: "smoothstep",
          animated: true,
          style: {
            strokeWidth: 1.5,
            strokeDasharray: "6 3",
            opacity: 0.6,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
          },
        });
      }
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Timeline ruler component
// ---------------------------------------------------------------------------

function TimelineRuler({
  transactions,
}: {
  transactions: WorkflowTimelineType["transactions"];
}) {
  if (transactions.length === 0) return null;

  const sorted = [...transactions].sort(
    (a, b) => new Date(a.recordTime).getTime() - new Date(b.recordTime).getTime()
  );
  const earliest = new Date(sorted[0].recordTime);
  const latest = new Date(sorted[sorted.length - 1].recordTime);
  const durationMs = latest.getTime() - earliest.getTime();

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="font-mono">
        {earliest.toLocaleTimeString()}
      </span>
      <div className="relative flex-1">
        <div className="h-px w-full bg-border" />
        {sorted.map((tx, idx) => {
          const offset =
            durationMs > 0
              ? ((new Date(tx.recordTime).getTime() - earliest.getTime()) /
                  durationMs) *
                100
              : (idx / Math.max(1, sorted.length - 1)) * 100;
          return (
            <div
              key={tx.updateId}
              className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-muted-foreground/50"
              style={{ left: `${offset}%` }}
            />
          );
        })}
      </div>
      <span className="font-mono">
        {latest.toLocaleTimeString()}
      </span>
      {durationMs > 0 && (
        <span className="ml-1 text-muted-foreground/70">
          ({durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`})
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function TimelineSkeleton() {
  return (
    <div className="flex h-[400px] items-center justify-center gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-32 w-52 rounded-md" />
          {i < 3 && <Skeleton className="h-0.5 w-16" />}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fit view button (must be inside ReactFlowProvider)
// ---------------------------------------------------------------------------

function FitViewButton() {
  const { fitView } = useReactFlow();
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      onClick={() => fitView({ padding: 0.2 })}
    >
      <HugeiconsIcon icon={Maximize01Icon} data-icon="inline-start" strokeWidth={2} />
      Fit View
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface WorkflowTimelineProps {
  timeline: WorkflowTimelineType | undefined;
  isLoading: boolean;
  selectedUpdateId: string | null;
  onSelectTransaction: (updateId: string) => void;
}

export function WorkflowTimeline({
  timeline,
  isLoading,
  selectedUpdateId,
  onSelectTransaction,
}: WorkflowTimelineProps) {
  const handleNodeClick = useCallback(
    (updateId: string) => {
      onSelectTransaction(updateId);
    },
    [onSelectTransaction]
  );

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!timeline || timeline.transactions.length === 0) {
      return { initialNodes: [], initialEdges: [] };
    }
    const { nodes, edges } = buildNodesAndEdges(
      timeline,
      selectedUpdateId,
      handleNodeClick
    );
    return { initialNodes: nodes, initialEdges: edges };
  }, [timeline, selectedUpdateId, handleNodeClick]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes/edges when timeline changes
  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Empty state
  if (!isLoading && !timeline) {
    return (
      <Empty className="h-[400px]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>Enter a correlation key above to trace a workflow</EmptyTitle>
          <EmptyDescription>
            Use a Trace ID, Contract Chain, Workflow ID, or Update ID to
            visualize related transactions
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <TimelineSkeleton />
      </div>
    );
  }

  if (timeline && timeline.transactions.length === 0) {
    return (
      <Empty className="h-[400px]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No transactions found</EmptyTitle>
          <EmptyDescription>
            No transactions matched the given correlation key. Try a different
            search method.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {timeline!.correlationType}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">
            {truncateId(timeline!.correlationKey, 16)}
          </span>
          <Badge variant="secondary" className="text-xs">
            {timeline!.transactions.length} transaction
            {timeline!.transactions.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="h-2 w-4 rounded-sm border-l-2 border-l-primary bg-muted" />
            <span>Create</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-4 rounded-sm border-l-2 border-l-secondary-foreground bg-muted" />
            <span>Exercise</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-4 rounded-sm border-l-2 border-l-destructive bg-muted" />
            <span>Consume</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-0.5 w-4 border-t-2 border-dashed border-muted-foreground/50" />
            <span>Trace ctx</span>
          </div>
        </div>
      </div>

      {/* ReactFlow canvas */}
      <div className="h-[420px] overflow-hidden rounded-lg border bg-background">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls
              showInteractive={false}
              className="!rounded-md !border !shadow-sm"
            />
            <MiniMap
              className="!rounded-md !border !shadow-sm"
              nodeColor="#94a3b8"
              maskColor="hsl(var(--background) / 0.7)"
            />
            <Panel position="top-right">
              <FitViewButton />
            </Panel>
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      {/* Timeline ruler */}
      {timeline && <TimelineRuler transactions={timeline.transactions} />}
    </div>
  );
}
