import React, { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeTypes,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { HugeiconsIcon } from "@hugeicons/react";
import { Maximize01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import type {
  TransactionDetail,
  LedgerEvent,
  ExercisedEvent,
} from "@/lib/types";
import {
  CreateNode,
  ExerciseNode,
  ArchiveNode,
  type EventNodeData,
} from "./event-node";

// ---------------------------------------------------------------------------
// Custom node types -- defined outside the component to keep a stable reference
// ---------------------------------------------------------------------------

const nodeTypes: NodeTypes = {
  createNode: CreateNode as unknown as NodeTypes[string],
  exerciseNode: ExerciseNode as unknown as NodeTypes[string],
  archiveNode: ArchiveNode as unknown as NodeTypes[string],
};

// ---------------------------------------------------------------------------
// Tree layout builder
// ---------------------------------------------------------------------------

interface LayoutState {
  nodes: Node[];
  edges: Edge[];
}

function getNodeType(event: LedgerEvent): string {
  switch (event.eventType) {
    case "created":
      return "createNode";
    case "archived":
      return "archiveNode";
    case "exercised":
      return "exerciseNode";
    default:
      return "createNode";
  }
}

function buildTree(transaction: TransactionDetail): LayoutState {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const HORIZONTAL_SPACING = 400;
  const VERTICAL_SPACING = 300;
  let xCounter = 0;

  function addEvent(
    eventId: string,
    depth: number,
    parentId: string | null
  ): void {
    const event = transaction.eventsById[eventId];
    if (!event) return;

    const nodeId = eventId;

    const nodeData: EventNodeData = {
      event,
      label: eventId,
    };

    if (parentId) {
      edges.push({
        id: `${parentId}->${nodeId}`,
        source: parentId,
        target: nodeId,
        type: "smoothstep",
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 1.5 },
      });
    }

    // If exercise event, position it at the center of its children's span
    if (event.eventType === "exercised") {
      const exercised = event as ExercisedEvent;
      const startX = xCounter;
      for (const childId of exercised.childEventIds) {
        addEvent(childId, depth + 1, nodeId);
      }
      // If an exercise has no children, it still occupies one column
      if (exercised.childEventIds.length === 0) {
        xCounter++;
      }
      const endX = xCounter - 1;
      const centerX =
        ((startX + endX) / 2) * HORIZONTAL_SPACING;

      nodes.push({
        id: nodeId,
        type: getNodeType(event),
        position: { x: centerX, y: depth * VERTICAL_SPACING },
        data: nodeData as Record<string, unknown>,
      });
    } else {
      // Leaf node (create / archive) -- takes one column slot
      nodes.push({
        id: nodeId,
        type: getNodeType(event),
        position: {
          x: xCounter * HORIZONTAL_SPACING,
          y: depth * VERTICAL_SPACING,
        },
        data: nodeData as Record<string, unknown>,
      });
      xCounter++;
    }
  }

  // Process root events
  for (const rootId of transaction.rootEventIds) {
    addEvent(rootId, 0, null);
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Inner component (needs ReactFlowProvider context for useReactFlow)
// ---------------------------------------------------------------------------

function TransactionTreeInner({ transaction }: { transaction: TransactionDetail }) {
  const layout = useMemo(() => buildTree(transaction), [transaction]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);
  const { fitView } = useReactFlow();

  // Update when transaction changes
  React.useEffect(() => {
    const l = buildTree(transaction);
    setNodes(l.nodes);
    setEdges(l.edges);
    // Wait a tick for React Flow to render new nodes, then fit
    requestAnimationFrame(() => {
      fitView({ padding: 0.15, maxZoom: 1.1 });
    });
  }, [transaction, setNodes, setEdges, fitView]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.15, maxZoom: 1.1 });
  }, [fitView]);

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "400px" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        defaultViewport={{ x: 50, y: 50, zoom: 0.25 }}
        minZoom={0.05}
        maxZoom={2}
        defaultEdgeOptions={{
          type: "smoothstep",
          style: { strokeWidth: 1.5 },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />

        <Panel position="top-right">
          <Button
            variant="outline"
            size="sm"
            className="bg-card shadow-sm"
            onClick={handleFitView}
          >
            <HugeiconsIcon icon={Maximize01Icon} strokeWidth={2} data-icon="inline-start" />
            Fit
          </Button>
        </Panel>
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported component -- wraps with ReactFlowProvider
// ---------------------------------------------------------------------------

export interface TransactionTreeProps {
  transaction: TransactionDetail;
}

export function TransactionTree({ transaction }: TransactionTreeProps) {
  return (
    <ReactFlowProvider>
      <TransactionTreeInner transaction={transaction} />
    </ReactFlowProvider>
  );
}
