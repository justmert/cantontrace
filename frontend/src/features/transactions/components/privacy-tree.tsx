import React, { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  type NodeProps,
  MarkerType,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { HugeiconsIcon } from "@hugeicons/react";
import { ViewOffIcon, ShieldEnergyIcon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { PartyBadge } from "@/components/party-badge";
import { cn, formatTemplateId } from "@/lib/utils";
import type { PrivacyEvent, DisclosedBoundary } from "@/lib/types";
import type { PartyColor } from "@/features/transactions/hooks";

// ---------------------------------------------------------------------------
// Custom node for privacy tree events
// ---------------------------------------------------------------------------

export interface PrivacyEventNodeData {
  event: PrivacyEvent;
  partyColors: Record<string, PartyColor>;
  selectedParties: Set<string>;
  highlightedParty: string | null;
  disclosedBoundary: DisclosedBoundary | undefined;
  [key: string]: unknown;
}

function PrivacyEventNode({
  data,
}: NodeProps & { data: PrivacyEventNodeData }) {
  const { event, partyColors, selectedParties, highlightedParty, disclosedBoundary } =
    data;

  // Determine which parties can see this event
  const visibleParties = event.witnesses.filter((p) => selectedParties.has(p));
  const isVisibleToSelected = visibleParties.length > 0;

  // In highlight mode: check if highlighted party sees this
  const isHighlightVisible = highlightedParty
    ? event.witnesses.includes(highlightedParty)
    : true;

  const isGrayed = highlightedParty ? !isHighlightVisible : !isVisibleToSelected;

  // Event type styling (semantic)
  const eventTypeConfig: Record<
    string,
    { label: string; borderColor: string; bgColor: string }
  > = {
    created: {
      label: "Create",
      borderColor: "border-primary",
      bgColor: "bg-primary/10",
    },
    exercised: {
      label: "Exercise",
      borderColor: "border-secondary-foreground",
      bgColor: "bg-secondary/10",
    },
    archived: {
      label: "Archive",
      borderColor: "border-destructive",
      bgColor: "bg-destructive/10",
    },
  };

  const typeConfig = eventTypeConfig[event.eventType] ?? {
    label: event.eventType,
    borderColor: "border-muted-foreground",
    bgColor: "bg-muted",
  };

  // Build a CSS gradient for the left-side party color strip
  const partyStripColors = visibleParties.map((p) => partyColors[p]?.hex ?? "#888");
  const partyStripGradient =
    partyStripColors.length > 1
      ? `linear-gradient(to bottom, ${partyStripColors.map((c, i) => `${c} ${(i / partyStripColors.length) * 100}%, ${c} ${((i + 1) / partyStripColors.length) * 100}%`).join(", ")})`
      : partyStripColors[0] ?? "var(--muted-foreground)";

  return (
    <TooltipProvider>
      <div
        className={cn(
          "flex min-w-[200px] max-w-[260px] overflow-hidden rounded-md border bg-card shadow-sm transition-all",
          isGrayed && "opacity-40",
          event.isDisclosed && "border-dashed"
        )}
      >
        {/* Left-side party color strip */}
        <div
          className="w-1.5 shrink-0"
          style={{
            background: isGrayed ? "var(--muted-foreground)" : partyStripGradient,
          }}
        />

        <div className="flex-1 p-3">
          {/* Event type badge */}
          <div className="mb-2 flex items-center justify-between">
            <Badge
              variant="outline"
              className={cn("text-xs", typeConfig.bgColor)}
            >
              {typeConfig.label}
            </Badge>
            {event.isDisclosed && disclosedBoundary && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-0.5">
                    <HugeiconsIcon icon={ShieldEnergyIcon} strokeWidth={2} className="size-3 text-secondary-foreground" />
                    <span className="text-[11px] text-secondary-foreground">
                      Disclosed
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Accessed via explicit disclosure &mdash;{" "}
                    <PartyBadge party={disclosedBoundary.accessedBy} variant="compact" />{" "}
                    is not a stakeholder but accessed it through an attached
                    disclosed contract.
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Human-readable node label */}
          <div className="mb-1 text-sm font-medium">
            {event.eventType === "exercised"
              ? `Exercise ${event.choice ?? event.templateId.entityName}`
              : event.eventType === "created"
                ? `Create ${event.templateId.entityName}`
                : event.eventType === "archived"
                  ? `Archive ${event.templateId.entityName}`
                  : event.templateId.entityName}
          </div>

          {/* Template + Event ID */}
          <div className="mb-2 flex flex-col gap-0.5">
            {event.eventType === "exercised" && (
              <div className="truncate text-xs text-muted-foreground" title={formatTemplateId(event.templateId)}>
                {event.templateId.entityName}
              </div>
            )}
            <div className="truncate font-mono text-xs text-muted-foreground" title={event.eventId}>
              {event.eventId}
            </div>
          </div>

          {/* Party visibility dots */}
          {isGrayed ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={ViewOffIcon} strokeWidth={2} className="size-3" />
              <span className="italic">
                {highlightedParty
                  ? `Not in ${highlightedParty.split("::")[0]}'s projection`
                  : "Not in selected parties' projection"}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {visibleParties.map((party) => {
                const color = partyColors[party];
                return (
                  <Tooltip key={party}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "size-3 rounded-full ring-1 ring-offset-1 ring-offset-background",
                          color?.bg,
                          color?.ring
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <PartyBadge party={party} variant="compact" />
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </div>

        {/* Handles */}
        <Handle
          type="target"
          position={Position.Top}
          className="!size-2 !border-2 !border-background !bg-muted-foreground"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          className="!size-2 !border-2 !border-background !bg-muted-foreground"
        />
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Node types registration
// ---------------------------------------------------------------------------

const nodeTypes: NodeTypes = {
  privacyEvent: PrivacyEventNode as unknown as NodeTypes[string],
};

// ---------------------------------------------------------------------------
// Build tree layout (top to bottom)
// ---------------------------------------------------------------------------

const NODE_WIDTH = 230;
const NODE_HEIGHT = 140;
const H_GAP = 40;
const V_GAP = 60;

function buildTreeLayout(
  events: PrivacyEvent[],
  partyColors: Record<string, PartyColor>,
  selectedParties: Set<string>,
  highlightedParty: string | null,
  disclosedBoundaries: DisclosedBoundary[]
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (events.length === 0) return { nodes, edges };

  // Build parent-child relationships using event ordering and signatory overlap
  // Exercise events are parents of subsequent created events that share signatories
  const eventIndex = new Map<string, number>();
  events.forEach((e, idx) => eventIndex.set(e.eventId, idx));

  // Track which events are children (so we know roots)
  const childSet = new Set<string>();
  const childrenOf = new Map<string, string[]>(); // parentId -> [childIds]

  const exercisedEvents = events.filter((e) => e.eventType === "exercised");
  const createdEvents = events.filter((e) => e.eventType === "created");

  exercisedEvents.forEach((exercised) => {
    const exercisedIdx = eventIndex.get(exercised.eventId)!;
    const children: string[] = [];

    createdEvents.forEach((created) => {
      const createdIdx = eventIndex.get(created.eventId)!;
      if (createdIdx <= exercisedIdx) return;

      const isChild = exercised.actingParties.some(
        (s) =>
          created.signatories.includes(s) || created.witnesses.includes(s)
      ) || exercised.witnesses.some((w) => created.witnesses.includes(w));

      if (isChild && !childSet.has(created.eventId)) {
        children.push(created.eventId);
        childSet.add(created.eventId);
      }
    });

    if (children.length > 0) {
      childrenOf.set(exercised.eventId, children);
    }
  });

  // Identify roots: events that are not children of any exercise
  const roots = events.filter((e) => !childSet.has(e.eventId));

  // Assign positions using BFS level-based layout
  type LayoutItem = { eventId: string; depth: number; index: number };
  const layouts: LayoutItem[] = [];
  const depthCounts: number[] = [];

  function layoutSubtree(eventId: string, depth: number) {
    while (depthCounts.length <= depth) depthCounts.push(0);
    const index = depthCounts[depth]++;
    layouts.push({ eventId, depth, index });

    const children = childrenOf.get(eventId) ?? [];
    children.forEach((childId) => layoutSubtree(childId, depth + 1));
  }

  roots.forEach((root) => layoutSubtree(root.eventId, 0));

  // Handle any events that were missed (no parent, no root status -- shouldn't happen but safe)
  events.forEach((e) => {
    if (!layouts.some((l) => l.eventId === e.eventId)) {
      while (depthCounts.length <= 0) depthCounts.push(0);
      const index = depthCounts[0]++;
      layouts.push({ eventId: e.eventId, depth: 0, index });
    }
  });

  // Create nodes
  const eventMap = new Map(events.map((e) => [e.eventId, e]));

  for (const { eventId, depth, index } of layouts) {
    const event = eventMap.get(eventId);
    if (!event) continue;

    const disclosedBoundary = disclosedBoundaries.find(
      (b) => b.eventId === event.eventId
    );

    nodes.push({
      id: event.eventId,
      type: "privacyEvent",
      position: {
        x: index * (NODE_WIDTH + H_GAP),
        y: depth * (NODE_HEIGHT + V_GAP),
      },
      data: {
        event,
        partyColors,
        selectedParties,
        highlightedParty,
        disclosedBoundary,
      } satisfies PrivacyEventNodeData,
    });
  }

  // Create edges from parent-child relationships, colored by shared party visibility
  for (const [parentId, childIds] of childrenOf.entries()) {
    const parentEvent = eventMap.get(parentId);
    for (const childId of childIds) {
      const childEvent = eventMap.get(childId);
      // Find the first selected party visible in both parent and child to color the edge
      let edgeColor: string | undefined;
      if (parentEvent && childEvent) {
        const parentWitnesses = new Set(parentEvent.witnesses);
        const sharedParty = childEvent.witnesses.find(
          (p) => parentWitnesses.has(p) && selectedParties.has(p)
        );
        if (sharedParty && partyColors[sharedParty]) {
          edgeColor = partyColors[sharedParty].hex;
        }
      }

      edges.push({
        id: `edge-${parentId}-${childId}`,
        source: parentId,
        target: childId,
        type: "smoothstep",
        style: {
          strokeWidth: 1.5,
          ...(edgeColor ? { stroke: edgeColor } : {}),
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          ...(edgeColor ? { color: edgeColor } : {}),
        },
      });
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function TreeSkeleton() {
  return (
    <div className="flex h-[400px] flex-col items-center justify-center gap-6">
      <div className="flex gap-6">
        <Skeleton className="h-28 w-52 rounded-md" />
      </div>
      <div className="flex gap-6">
        <Skeleton className="h-28 w-52 rounded-md" />
        <Skeleton className="h-28 w-52 rounded-md" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface PrivacyTreeProps {
  events: PrivacyEvent[];
  partyColors: Record<string, PartyColor>;
  selectedParties: Set<string>;
  highlightedParty: string | null;
  disclosedBoundaries: DisclosedBoundary[];
  isLoading: boolean;
}

export function PrivacyTree({
  events,
  partyColors,
  selectedParties,
  highlightedParty,
  disclosedBoundaries,
  isLoading,
}: PrivacyTreeProps) {
  const { computedNodes, computedEdges } = useMemo(() => {
    if (events.length === 0) {
      return { computedNodes: [] as Node[], computedEdges: [] as Edge[] };
    }
    const { nodes, edges } = buildTreeLayout(
      events,
      partyColors,
      selectedParties,
      highlightedParty,
      disclosedBoundaries
    );
    return { computedNodes: nodes, computedEdges: edges };
  }, [events, partyColors, selectedParties, highlightedParty, disclosedBoundaries]);

  // Use controlled nodes/edges pattern -- store in state and sync from memo
  const [nodes, setNodes] = React.useState<Node[]>(computedNodes);
  const [edges, setEdges] = React.useState<Edge[]>(computedEdges);

  React.useEffect(() => {
    setNodes(computedNodes);
    setEdges(computedEdges);
  }, [computedNodes, computedEdges]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <TreeSkeleton />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <Empty className="h-[400px]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={ViewOffIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No events to visualize</EmptyTitle>
          <EmptyDescription>
            Enter an Update ID above to analyze transaction privacy
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
