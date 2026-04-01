import React, { useRef, useEffect, useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlusSignIcon,
  MinusSignIcon,
  FlashIcon,
  ArrowDataTransferHorizontalIcon,
  GlobeIcon,
  MapPinIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  LinkForwardIcon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { IdBadge } from "@/components/id-badge";
import { PartyBadge } from "@/components/party-badge";
import { cn, formatTimestamp, formatTemplateId, formatJsonForDisplay } from "@/lib/utils";
import type {
  LedgerUpdate,
  LedgerEvent,
  CreatedEvent,
  ExercisedEvent,
  ArchivedEvent,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Event type helpers
// ---------------------------------------------------------------------------

interface EventStyle {
  icon: React.ReactNode;
  borderClass: string;
  iconBgClass: string;
  textColorClass: string;
}

function getEventStyle(type: string): EventStyle {
  switch (type) {
    case "created":
      return {
        icon: <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3.5 text-event-create" />,
        borderClass: "",
        iconBgClass: "bg-event-create/15",
        textColorClass: "text-event-create",
      };
    case "archived":
      return {
        icon: <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="size-3.5 text-event-archive" />,
        borderClass: "",
        iconBgClass: "bg-event-archive/15",
        textColorClass: "text-event-archive",
      };
    case "exercised":
      return {
        icon: <HugeiconsIcon icon={FlashIcon} strokeWidth={2} className="size-3.5 text-event-exercise" />,
        borderClass: "",
        iconBgClass: "bg-event-exercise/15",
        textColorClass: "text-event-exercise",
      };
    case "assigned":
    case "unassigned":
      return {
        icon: <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2} className="size-3.5 text-event-reassign" />,
        borderClass: "",
        iconBgClass: "bg-event-reassign/15",
        textColorClass: "text-event-reassign",
      };
    case "topology":
      return {
        icon: <HugeiconsIcon icon={GlobeIcon} strokeWidth={2} className="size-3.5 text-event-topology" />,
        borderClass: "",
        iconBgClass: "bg-event-topology/15",
        textColorClass: "text-event-topology",
      };
    case "checkpoint":
      return {
        icon: <HugeiconsIcon icon={MapPinIcon} strokeWidth={2} className="size-3.5 text-muted-foreground" />,
        borderClass: "",
        iconBgClass: "bg-muted-foreground/10",
        textColorClass: "text-muted-foreground",
      };
    default:
      return {
        icon: <HugeiconsIcon icon={FlashIcon} strokeWidth={2} className="size-3.5 text-muted-foreground" />,
        borderClass: "",
        iconBgClass: "bg-muted-foreground/10",
        textColorClass: "text-muted-foreground",
      };
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
// Inline event detail (replaces the old popover)
// ---------------------------------------------------------------------------

function EventDetail({ event }: { event: LedgerEvent }) {
  switch (event.eventType) {
    case "created": {
      const e = event as CreatedEvent;
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 overflow-hidden">
            <span className="text-xs font-medium text-muted-foreground">Template</span>
            <span className="truncate font-mono text-xs" title={formatTemplateId(e.templateId)}>
              {formatTemplateId(e.templateId)}
            </span>
          </div>
          <div className="flex flex-col gap-1 overflow-hidden">
            <span className="text-xs font-medium text-muted-foreground">Contract ID</span>
            <IdBadge id={e.contractId} truncateLen={14} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Signatories</span>
            <div className="flex flex-wrap gap-1">
              {e.signatories.map((s) => (
                <PartyBadge key={s} party={s} />
              ))}
            </div>
          </div>
          {e.observers.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Observers</span>
              <div className="flex flex-wrap gap-1">
                {e.observers.map((o) => (
                  <PartyBadge key={o} party={o} />
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Payload</span>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[10px]">
              {formatJsonForDisplay(e.payload).slice(0, 800)}
            </pre>
          </div>
        </div>
      );
    }
    case "exercised": {
      const e = event as ExercisedEvent;
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold">{e.choice}</span>
            <Badge variant={e.consuming ? "destructive" : "secondary"} className="text-[9px]">
              {e.consuming ? "Consuming" : "Non-consuming"}
            </Badge>
          </div>
          <div className="flex flex-col gap-1 overflow-hidden">
            <span className="text-xs font-medium text-muted-foreground">Contract ID</span>
            <IdBadge id={e.contractId} truncateLen={14} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Acting Parties</span>
            <div className="flex flex-wrap gap-1">
              {e.actingParties.map((p) => (
                <PartyBadge key={p} party={p} />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Choice Argument</span>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[10px]">
              {formatJsonForDisplay(e.choiceArgument).slice(0, 800)}
            </pre>
          </div>
        </div>
      );
    }
    case "archived": {
      const e = event as ArchivedEvent;
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 overflow-hidden">
            <span className="text-xs font-medium text-muted-foreground">Template</span>
            <span className="truncate font-mono text-xs" title={formatTemplateId(e.templateId)}>
              {formatTemplateId(e.templateId)}
            </span>
          </div>
          <div className="flex flex-col gap-1 overflow-hidden">
            <span className="text-xs font-medium text-muted-foreground">Contract ID</span>
            <IdBadge id={e.contractId} truncateLen={14} />
          </div>
        </div>
      );
    }
    default:
      return (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[10px]">
          {formatJsonForDisplay(event)}
        </pre>
      );
  }
}

// ---------------------------------------------------------------------------
// Event card helpers
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

// ---------------------------------------------------------------------------
// Single event card with inline expansion
// ---------------------------------------------------------------------------

function EventCard({
  update,
  event,
  isExpanded,
  onToggle,
}: {
  update: LedgerUpdate;
  event: LedgerEvent;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const templateName = getEventTemplateName(event);
  const contractId = getEventContractId(event);
  const actingParty = getActingParty(event);
  const style = getEventStyle(event.eventType);
  const recordDate = new Date(update.recordTime);
  const formattedTime = formatTimestamp(recordDate, "time");
  const fullTimestamp = recordDate.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div
        className={cn(
          "rounded-lg border bg-card transition-colors",
          isExpanded && "ring-1 ring-ring/20"
        )}
      >
        {/* Collapsed row: type badge + template + contract ID + timestamp */}
        <CollapsibleTrigger asChild>
          <div
            className={cn(
              "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50",
              isExpanded && "bg-muted/30"
            )}
          >
            {/* Icon with colored background circle */}
            <div className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", style.iconBgClass)}>
              {style.icon}
            </div>

            {/* Badge */}
            <Badge variant={getBadgeVariant(event.eventType)} className={cn("shrink-0 text-[9px]", style.textColorClass)}>
              {event.eventType.toUpperCase()}
            </Badge>

            {/* Template name */}
            {templateName && (
              <span className="truncate font-mono text-xs font-medium">
                {templateName}
              </span>
            )}

            {/* Choice name for exercised events */}
            {event.eventType === "exercised" && (
              <span className="shrink-0 text-xs text-muted-foreground">
                .{(event as ExercisedEvent).choice}
              </span>
            )}

            {/* Contract ID */}
            {contractId && contractId.length > 0 && (
              <IdBadge id={contractId} truncateLen={8} />
            )}

            {/* Acting party */}
            {actingParty && (
              <span className="hidden sm:inline">
                <PartyBadge party={actingParty} variant="compact" />
              </span>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Timestamp with tooltip */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0 cursor-default font-mono text-[10px] text-muted-foreground">
                    {formattedTime}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{fullTimestamp}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Expand/collapse chevron */}
            <HugeiconsIcon
              icon={isExpanded ? ArrowUp01Icon : ArrowDown01Icon}
              strokeWidth={2}
              className="size-3.5 shrink-0 text-muted-foreground transition-transform"
            />
          </div>
        </CollapsibleTrigger>

        {/* Expanded detail panel */}
        <CollapsibleContent>
          <div className="overflow-hidden">
            <Separator />
            <div className="px-4 py-3">
              <EventDetail event={event} />

              <Separator className="my-3" />

              {/* Footer actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>Update:</span>
                  <IdBadge id={update.updateId} truncateLen={12} />
                </div>
                <a
                  href={`/transactions/${encodeURIComponent(update.updateId)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <HugeiconsIcon icon={LinkForwardIcon} strokeWidth={2} className="size-3" />
                  Open in Transaction Explorer
                </a>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
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
  const [autoScroll, setAutoScroll] = useState(false);
  const [newEventsSinceScroll, setNewEventsSinceScroll] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    // Reverse so newest events appear at the top
    result.reverse();
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
            const eventKey = `${update.updateId}-${index}`;
            return (
              <EventCard
                key={eventKey}
                update={update}
                event={event}
                isExpanded={expandedId === eventKey}
                onToggle={() =>
                  setExpandedId(
                    expandedId === eventKey ? null : eventKey
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
