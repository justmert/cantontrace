import React, { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlusSignIcon,
  MinusSignIcon,
  FlashIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Copy01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { truncateId, formatTemplateId } from "@/lib/utils";
import type {
  LedgerEvent,
  CreatedEvent,
  ArchivedEvent,
  ExercisedEvent,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Copy helper
// ---------------------------------------------------------------------------

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be blocked in some contexts; silently ignore.
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex size-4 shrink-0 items-center justify-center rounded hover:bg-muted"
    >
      {copied ? (
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-2.5 text-primary" />
      ) : (
        <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-2.5 text-current opacity-50" />
      )}
    </button>
  );
}

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
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "min-w-[220px] max-w-[320px] rounded-lg border-2 border-primary/40 bg-card shadow-sm",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary" />

      <div className="flex items-center gap-2 border-b border-primary/20 px-3 py-2">
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary">
          CREATE
        </span>
        <a
          href={`/templates?template=${encodeURIComponent(formatTemplateId(event.templateId))}`}
          className="ml-auto text-xs font-medium text-primary hover:underline"
        >
          {event.templateId.entityName}
        </a>
      </div>

      <div className="flex flex-col gap-1 overflow-hidden px-3 py-2">
        <div className="flex items-center gap-1 overflow-hidden">
          <span className="shrink-0 text-[10px] text-muted-foreground">Contract:</span>
          <a
            href={`/contracts/${encodeURIComponent(event.contractId)}`}
            className="truncate font-mono text-[10px] text-primary hover:underline"
          >
            {truncateId(event.contractId, 8)}
          </a>
          <CopyBtn text={event.contractId} />
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
          <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-2 font-mono text-[9px] leading-relaxed">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exercise node
// ---------------------------------------------------------------------------

export function ExerciseNode({ data }: NodeProps) {
  const nodeData = data as unknown as EventNodeData;
  const event = nodeData.event as ExercisedEvent;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "min-w-[220px] max-w-[320px] rounded-lg border-2 border-accent-foreground/40 bg-card shadow-sm",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-accent-foreground" />

      <div className="flex items-center gap-2 border-b border-accent-foreground/20 px-3 py-2">
        <HugeiconsIcon icon={FlashIcon} strokeWidth={2} className="size-3.5 text-accent-foreground" />
        <span className="text-xs font-semibold text-accent-foreground">
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
          <span className="truncate font-mono text-xs font-semibold text-accent-foreground">
            {event.choice}
          </span>
        </div>

        <div className="flex items-center gap-1 overflow-hidden">
          <span className="shrink-0 text-[10px] text-muted-foreground">Template:</span>
          <a
            href={`/templates?template=${encodeURIComponent(formatTemplateId(event.templateId))}`}
            className="truncate text-[10px] text-accent-foreground hover:underline"
          >
            {event.templateId.entityName}
          </a>
        </div>

        <div className="flex items-center gap-1 overflow-hidden">
          <span className="shrink-0 text-[10px] text-muted-foreground">Contract:</span>
          <a
            href={`/contracts/${encodeURIComponent(event.contractId)}`}
            className="truncate font-mono text-[10px] text-accent-foreground hover:underline"
          >
            {truncateId(event.contractId, 8)}
          </a>
          <CopyBtn text={event.contractId} />
        </div>

        <div className="flex items-center gap-1 overflow-hidden">
          <span className="shrink-0 text-[10px] text-muted-foreground">Actor:</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate font-mono text-[10px]">
                  {event.actingParties.join(", ")}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs break-all font-mono text-[10px]">
                {event.actingParties.join(", ")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
          <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-2 font-mono text-[9px] leading-relaxed">
            {JSON.stringify(event.choiceArgument, null, 2)}
          </pre>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-accent-foreground" />
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
        "min-w-[200px] max-w-[280px] rounded-lg border-2 border-destructive/40 bg-card shadow-sm",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-destructive" />

      <div className="flex items-center gap-2 border-b border-destructive/20 px-3 py-2">
        <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="size-3.5 text-destructive" />
        <span className="text-xs font-semibold text-destructive">
          ARCHIVE
        </span>
        <span className="ml-auto text-xs text-destructive">
          {event.templateId.entityName}
        </span>
      </div>

      <div className="flex flex-col gap-1 overflow-hidden px-3 py-2">
        <div className="flex items-center gap-1 overflow-hidden">
          <span className="shrink-0 text-[10px] text-muted-foreground">Contract:</span>
          <a
            href={`/contracts/${encodeURIComponent(event.contractId)}`}
            className="truncate font-mono text-[10px] text-destructive hover:underline"
          >
            {truncateId(event.contractId, 8)}
          </a>
          <CopyBtn text={event.contractId} />
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-destructive" />
    </div>
  );
}
