import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlusSignIcon,
  MinusSignIcon,
  FlashIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { IdBadge } from "@/components/id-badge";
import { PartyBadge } from "@/components/party-badge";
import { cn } from "@/lib/utils";
import { formatTemplateId } from "@/lib/utils";
import type {
  LedgerEvent,
  CreatedEvent,
  ArchivedEvent,
  ExercisedEvent,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Node data type
// ---------------------------------------------------------------------------

export interface EventNodeData {
  event: LedgerEvent;
  label: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Create node
// ---------------------------------------------------------------------------

export function CreateNode({ data }: NodeProps) {
  const nodeData = data as unknown as EventNodeData;
  const event = nodeData.event as CreatedEvent;
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className={cn(
        "min-w-[220px] max-w-[360px] rounded-lg border-2 border-event-create/40 bg-card shadow-sm",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-event-create" />

      <div className="flex items-center gap-2 border-b border-event-create/20 px-3 py-2">
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3.5 text-event-create" />
        <span className="text-xs font-semibold text-event-create">
          CREATE
        </span>
        <a
          href={`/templates?template=${encodeURIComponent(formatTemplateId(event.templateId))}`}
          className="ml-auto text-xs font-medium text-event-create hover:underline"
        >
          {event.templateId.entityName}
        </a>
      </div>

      <div className="flex flex-col gap-1 overflow-hidden px-3 py-2">
        <div className="flex items-center gap-1 overflow-hidden">
          <span className="shrink-0 text-[10px] text-muted-foreground">Contract:</span>
          <IdBadge id={event.contractId} truncateLen={8} href={`/contracts/${encodeURIComponent(event.contractId)}`} />
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3" />
          ) : (
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3" />
          )}
          Payload
        </button>

        {expanded && (
          <pre className="mt-1 whitespace-pre-wrap break-all rounded-lg bg-muted p-2 font-mono text-[9px] leading-relaxed">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-event-create" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exercise node
// ---------------------------------------------------------------------------

export function ExerciseNode({ data }: NodeProps) {
  const nodeData = data as unknown as EventNodeData;
  const event = nodeData.event as ExercisedEvent;
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className={cn(
        "min-w-[220px] max-w-[360px] rounded-lg border-2 border-event-exercise/40 bg-card shadow-sm",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-event-exercise" />

      <div className="flex items-center gap-2 border-b border-event-exercise/20 px-3 py-2">
        <HugeiconsIcon icon={FlashIcon} strokeWidth={2} className="size-3.5 text-event-exercise" />
        <span className="text-xs font-semibold text-event-exercise">
          EXERCISE
        </span>
        <Badge
          variant={event.consuming ? "destructive" : "secondary"}
          className="ml-auto text-[8px] px-1 py-0"
        >
          {event.consuming ? "Consuming" : "Non-consuming"}
        </Badge>
      </div>

      <div className="flex flex-col gap-1 overflow-hidden px-3 py-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="truncate font-mono text-xs font-semibold text-event-exercise">
            {event.choice}
          </span>
        </div>

        <div className="flex items-center gap-1 overflow-hidden">
          <span className="shrink-0 text-[10px] text-muted-foreground">Template:</span>
          <a
            href={`/templates?template=${encodeURIComponent(formatTemplateId(event.templateId))}`}
            className="truncate text-[10px] text-event-exercise hover:underline"
          >
            {event.templateId.entityName}
          </a>
        </div>

        <div className="flex items-center gap-1 overflow-hidden">
          <span className="shrink-0 text-[10px] text-muted-foreground">Contract:</span>
          <IdBadge id={event.contractId} truncateLen={8} href={`/contracts/${encodeURIComponent(event.contractId)}`} />
        </div>

        <div className="flex items-center gap-1 overflow-hidden">
          <span className="shrink-0 text-[10px] text-muted-foreground">Actor:</span>
          <div className="flex flex-wrap gap-0.5">
            {event.actingParties.map((p) => (
              <PartyBadge key={p} party={p} variant="compact" />
            ))}
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3" />
          ) : (
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3" />
          )}
          Choice Argument
        </button>

        {expanded && (
          <pre className="mt-1 whitespace-pre-wrap break-all rounded-lg bg-muted p-2 font-mono text-[9px] leading-relaxed">
            {JSON.stringify(event.choiceArgument, null, 2)}
          </pre>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-event-exercise" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archive node
// ---------------------------------------------------------------------------

export function ArchiveNode({ data }: NodeProps) {
  const nodeData = data as unknown as EventNodeData;
  const event = nodeData.event as ArchivedEvent;

  return (
    <div
      className={cn(
        "min-w-[200px] max-w-[360px] rounded-lg border-2 border-event-archive/40 bg-card shadow-sm",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-event-archive" />

      <div className="flex items-center gap-2 border-b border-event-archive/20 px-3 py-2">
        <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="size-3.5 text-event-archive" />
        <span className="text-xs font-semibold text-event-archive">
          ARCHIVE
        </span>
        <span className="ml-auto text-xs text-event-archive">
          {event.templateId.entityName}
        </span>
      </div>

      <div className="flex flex-col gap-1 overflow-hidden px-3 py-2">
        <div className="flex items-center gap-1 overflow-hidden">
          <span className="shrink-0 text-[10px] text-muted-foreground">Contract:</span>
          <IdBadge id={event.contractId} truncateLen={8} href={`/contracts/${encodeURIComponent(event.contractId)}`} />
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-event-archive" />
    </div>
  );
}
