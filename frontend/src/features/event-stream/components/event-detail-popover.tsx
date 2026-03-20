import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  LinkForwardIcon,
  Copy01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatTemplateId, truncateId } from "@/lib/utils";
import type { LedgerUpdate, LedgerEvent, CreatedEvent, ExercisedEvent, ArchivedEvent } from "@/lib/types";

// ---------------------------------------------------------------------------
// Inline copy button
// ---------------------------------------------------------------------------

function InlineCopy({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = async () => {
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
      onClick={(e) => { e.stopPropagation(); handleCopy(); }}
      className="inline-flex size-5 items-center justify-center rounded hover:bg-muted"
    >
      {copied ? (
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3 text-primary" />
      ) : (
        <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-3 text-muted-foreground" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Event detail popover content
// ---------------------------------------------------------------------------

function EventSummary({ event }: { event: LedgerEvent }) {
  switch (event.eventType) {
    case "created": {
      const e = event as CreatedEvent;
      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1 overflow-hidden">
            <span className="text-xs font-medium text-muted-foreground">Template</span>
            <span className="truncate font-mono text-xs" title={formatTemplateId(e.templateId)}>{formatTemplateId(e.templateId)}</span>
          </div>
          <div className="flex flex-col gap-1 overflow-hidden">
            <span className="text-xs font-medium text-muted-foreground">Contract ID</span>
            <div className="flex items-center gap-1 min-w-0">
              <span className="min-w-0 break-all font-mono text-xs">{e.contractId}</span>
              <InlineCopy text={e.contractId} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Signatories</span>
            <div className="flex flex-wrap gap-1">
              {e.signatories.map((s) => (
                <Badge key={s} variant="secondary" className="max-w-full font-mono text-[10px]">
                  <span className="truncate">{s}</span>
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Payload (preview)</span>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[10px]">
              {JSON.stringify(e.payload, null, 2).slice(0, 500)}
            </pre>
          </div>
        </div>
      );
    }
    case "exercised": {
      const e = event as ExercisedEvent;
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold">{e.choice}</span>
            <Badge variant={e.consuming ? "destructive" : "secondary"} className="text-[9px]">
              {e.consuming ? "Consuming" : "Non-consuming"}
            </Badge>
          </div>
          <div className="flex flex-col gap-1 overflow-hidden">
            <span className="text-xs font-medium text-muted-foreground">Contract ID</span>
            <div className="flex items-center gap-1 min-w-0">
              <span className="min-w-0 break-all font-mono text-xs">{e.contractId}</span>
              <InlineCopy text={e.contractId} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Acting Parties</span>
            <div className="flex flex-wrap gap-1">
              {e.actingParties.map((p) => (
                <Badge key={p} variant="secondary" className="max-w-full font-mono text-[10px]">
                  <span className="truncate">{p}</span>
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Choice Argument</span>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[10px]">
              {JSON.stringify(e.choiceArgument, null, 2).slice(0, 500)}
            </pre>
          </div>
        </div>
      );
    }
    case "archived": {
      const e = event as ArchivedEvent;
      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1 overflow-hidden">
            <span className="text-xs font-medium text-muted-foreground">Template</span>
            <span className="truncate font-mono text-xs" title={formatTemplateId(e.templateId)}>{formatTemplateId(e.templateId)}</span>
          </div>
          <div className="flex flex-col gap-1 overflow-hidden">
            <span className="text-xs font-medium text-muted-foreground">Contract ID</span>
            <div className="flex items-center gap-1 min-w-0">
              <span className="min-w-0 break-all font-mono text-xs">{e.contractId}</span>
              <InlineCopy text={e.contractId} />
            </div>
          </div>
        </div>
      );
    }
    default:
      return (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[10px]">
          {JSON.stringify(event, null, 2)}
        </pre>
      );
  }
}

// ---------------------------------------------------------------------------
// Exported popover component
// ---------------------------------------------------------------------------

export interface EventDetailPopoverProps {
  update: LedgerUpdate;
  event: LedgerEvent;
  onClose: () => void;
}

export function EventDetailPopover({
  update,
  event,
  onClose,
}: EventDetailPopoverProps) {
  return (
    <div className="flex w-[380px] flex-col gap-3 rounded-lg border bg-card p-4 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge
            variant={
              event.eventType === "created"
                ? "secondary"
                : event.eventType === "archived"
                  ? "destructive"
                  : "default"
            }
            className="text-[10px]"
          >
            {event.eventType.toUpperCase()}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">
            {truncateId(update.updateId, 8)}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close event detail"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      <Separator />

      {/* Event details */}
      <EventSummary event={event} />

      <Separator />

      {/* Actions */}
      <a
        href={`/transactions/${encodeURIComponent(update.updateId)}`}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <HugeiconsIcon icon={LinkForwardIcon} strokeWidth={2} className="size-3" />
        Open in Transaction Explorer
      </a>
    </div>
  );
}
