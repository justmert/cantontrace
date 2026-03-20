import React, { useRef, useEffect, useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlusSignIcon,
  MinusSignIcon,
  FlashIcon,
  ArrowDataTransferHorizontalIcon,
  GlobeIcon,
  MapPinIcon,
  Copy01Icon,
  Tick02Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { truncateId } from "@/lib/utils";
import type {
  LedgerUpdate,
  LedgerEvent,
  ExercisedEvent,
} from "@/lib/types";
import { EventDetailPopover } from "./event-detail-popover";

// ---------------------------------------------------------------------------
// Event type helpers
// ---------------------------------------------------------------------------

function getEventIcon(type: string) {
  switch (type) {
    case "created":
      return <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3.5" />;
    case "archived":
      return <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="size-3.5" />;
    case "exercised":
      return <HugeiconsIcon icon={FlashIcon} strokeWidth={2} className="size-3.5" />;
    case "assigned":
    case "unassigned":
      return <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2} className="size-3.5" />;
    case "topology":
      return <HugeiconsIcon icon={GlobeIcon} strokeWidth={2} className="size-3.5" />;
    case "checkpoint":
      return <HugeiconsIcon icon={MapPinIcon} strokeWidth={2} className="size-3.5" />;
    default:
      return <HugeiconsIcon icon={FlashIcon} strokeWidth={2} className="size-3.5" />;
  }
}

function getEventColor(type: string) {
  switch (type) {
    case "created":
      return "bg-card border-border border-l-primary border-l-2";
    case "archived":
      return "bg-card border-border border-l-destructive border-l-2";
    case "exercised":
      return "bg-card border-border border-l-accent-foreground border-l-2";
    case "assigned":
    case "unassigned":
      return "bg-card border-border border-l-secondary-foreground border-l-2";
    default:
      return "bg-card border-border";
  }
}

function getBadgeVariant(type: string): "default" | "secondary" | "destructive" | "outline" {
  switch (type) {
    case "created":
      return "secondary";
    case "archived":
      return "outline";
    case "exercised":
      return "outline";
    default:
      return "outline";
  }
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function InlineCopy({ text }: { text: string }) {
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCopy}
            className="inline-flex size-5 items-center justify-center rounded hover:bg-muted"
          >
            {copied ? (
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3 text-primary" />
            ) : (
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-3 text-muted-foreground" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>{copied ? "Copied!" : "Copy"}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Single event card
// ---------------------------------------------------------------------------

function getEventTemplateName(event: LedgerEvent): string | null {
  if ("templateId" in event && event.templateId) {
    return event.templateId.entityName;
  }
  return null;
}

function getEventContractId(event: LedgerEvent): string | null {
  if ("contractId" in event) {
    return event.contractId;
  }
  return null;
}

function getActingParty(event: LedgerEvent): string | null {
  if (event.eventType === "exercised") {
    return (event as ExercisedEvent).actingParties[0] ?? null;
  }
  return null;
}

function EventCard({
  update,
  event,
  onClickEvent,
  onClickContractId,
  popoverOpen,
  onTogglePopover,
}: {
  update: LedgerUpdate;
  event: LedgerEvent;
  onClickEvent: (updateId: string) => void;
  onClickContractId: (contractId: string) => void;
  popoverOpen: boolean;
  onTogglePopover: () => void;
}) {
  const templateName = getEventTemplateName(event);
  const contractId = getEventContractId(event);
  const actingParty = getActingParty(event);
  const timestamp = new Date(update.recordTime).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);

  return (
    <div className="relative">
      <div
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50",
          getEventColor(event.eventType)
        )}
        onClick={onTogglePopover}
      >
        {/* Icon */}
        <div className="mt-0.5 shrink-0">{getEventIcon(event.eventType)}</div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-1 overflow-hidden">
          <div className="flex items-center gap-2">
            <Badge variant={getBadgeVariant(event.eventType)} className="text-[9px]">
              {event.eventType.toUpperCase()}
            </Badge>
            {templateName && (
              <span className="truncate font-mono text-xs font-medium">
                {templateName}
              </span>
            )}
            {event.eventType === "exercised" && (
              <span className="text-xs text-muted-foreground">
                .{(event as ExercisedEvent).choice}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {contractId && (
              <div className="flex items-center gap-0.5">
                <a
                  href={`/contracts/${encodeURIComponent(contractId)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClickContractId(contractId);
                  }}
                  className="font-mono hover:underline"
                >
                  {truncateId(contractId, 8)}
                </a>
                <InlineCopy text={contractId} />
              </div>
            )}
            {actingParty && (
              <span className="max-w-[120px] truncate font-mono" title={actingParty}>{actingParty}</span>
            )}
            <span className="ml-auto font-mono">{timestamp}</span>
          </div>
        </div>

        {/* Update ID */}
        <div className="shrink-0">
          <a
            href={`/transactions/${encodeURIComponent(update.updateId)}`}
            onClick={(e) => {
              e.stopPropagation();
              onClickEvent(update.updateId);
            }}
            className="font-mono text-[10px] text-muted-foreground hover:underline"
          >
            {truncateId(update.updateId, 6)}
          </a>
        </div>
      </div>

      {/* Popover */}
      {popoverOpen && (
        <div className="absolute right-0 top-full z-50 mt-1">
          <EventDetailPopover
            update={update}
            event={event}
            onClose={onTogglePopover}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event list
// ---------------------------------------------------------------------------

export interface EventListProps {
  events: LedgerUpdate[];
  isPaused: boolean;
}

export function EventList({ events, isPaused }: EventListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newEventsSinceScroll, setNewEventsSinceScroll] = useState(0);
  const [popoverId, setPopoverId] = useState<string | null>(null);
  const prevCountRef = useRef(events.length);

  // Track scroll position
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
    if (atBottom) {
      setNewEventsSinceScroll(0);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
    // Track new events when scrolled up
    if (events.length > prevCountRef.current && !autoScroll) {
      setNewEventsSinceScroll(
        (prev) => prev + (events.length - prevCountRef.current)
      );
    }
    prevCountRef.current = events.length;
  }, [events.length, autoScroll]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setAutoScroll(true);
    setNewEventsSinceScroll(0);
  };

  // Flatten updates -> events with their parent update
  const flatEvents = React.useMemo(() => {
    const result: Array<{ update: LedgerUpdate; event: LedgerEvent }> = [];
    for (const update of events) {
      const updateEvents = update.events ?? [];
      if (updateEvents.length === 0) {
        // Topology / checkpoint with no sub-events -- create a synthetic event card
        result.push({
          update,
          event: {
            eventType: "created",
            eventId: update.updateId,
            contractId: "",
            templateId: {
              packageName: "",
              moduleName: "",
              entityName: update.updateType,
            },
            payload: {},
            signatories: [],
            observers: [],
            witnesses: [],
          } as LedgerEvent,
        });
      } else {
        for (const event of updateEvents) {
          result.push({ update, event });
        }
      }
    }
    return result;
  }, [events]);

  // Empty state
  if (flatEvents.length === 0) {
    return (
      <Empty className="flex-1">
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={FlashIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No events yet</EmptyTitle>
          <EmptyDescription>
            {isPaused
              ? "Stream is paused. Resume to see events."
              : "Waiting for ledger events..."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* "New events" banner */}
      {newEventsSinceScroll > 0 && (
        <div className="absolute bottom-4 left-1/2 z-40 -translate-x-1/2">
          <Button
            size="sm"
            className="shadow-lg"
            onClick={scrollToBottom}
          >
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} data-icon="inline-start" />
            {newEventsSinceScroll} new event
            {newEventsSinceScroll !== 1 ? "s" : ""}
          </Button>
        </div>
      )}

      {/* Virtualized-ish list -- using overflow-auto + native scrolling.
          For extreme volumes, swap for @tanstack/react-virtual. */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        <div className="flex flex-col gap-1.5 p-3">
          {flatEvents.map(({ update, event }, index) => {
            // eventId is NOT unique within an update (e.g. multiple
            // created/archived events can share the same eventId).
            // Include the flat-list index to guarantee uniqueness.
            const eventKey = `${update.updateId}-${index}`;
            return (
              <EventCard
                key={eventKey}
                update={update}
                event={event}
                onClickEvent={() => {
                  // Navigation handled by <a> tags
                }}
                onClickContractId={() => {
                  // Navigation handled by <a> tags
                }}
                popoverOpen={popoverId === eventKey}
                onTogglePopover={() =>
                  setPopoverId(
                    popoverId === eventKey ? null : eventKey
                  )
                }
              />
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
