import React, { useRef, useEffect, useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlusSignIcon,
  MinusSignIcon,
  FlashIcon,
  ArrowDataTransferHorizontalIcon,
  GlobeIcon,
  MapPinIcon,
  LinkForwardIcon,
  Copy01Icon,
  Tick02Icon,
  ArrowUp01Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn, formatTimestamp, formatTemplateId, formatPayloadValue } from "@/lib/utils";
import { JsonView } from "@/components/json-view";
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

export function EventDetail({ event }: { event: LedgerEvent }) {
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
            <div className="max-h-40 overflow-auto rounded-md bg-muted p-2">
              <JsonView data={e.payload} defaultExpandDepth={3} />
            </div>
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
            <Badge variant={e.consuming ? "destructive" : "secondary"} className="text-[11px]">
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
            <div className="max-h-40 overflow-auto rounded-md bg-muted p-2">
              <JsonView data={e.choiceArgument} defaultExpandDepth={3} />
            </div>
          </div>
          {/* Exercise result */}
          {e.exerciseResult !== undefined && e.exerciseResult !== null && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Exercise Result</span>
              <div className="max-h-32 overflow-auto rounded-md bg-muted p-2">
                <JsonView data={e.exerciseResult} defaultExpandDepth={2} />
              </div>
            </div>
          )}
          {/* Child event IDs */}
          {e.childEventIds && e.childEventIds.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Child Events ({e.childEventIds.length})
              </span>
              <div className="flex flex-col gap-1">
                {e.childEventIds.map((childId) => (
                  <IdBadge key={childId} id={childId} truncateLen={16} />
                ))}
              </div>
            </div>
          )}
          {/* Witnesses */}
          {e.witnesses && e.witnesses.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Witnesses</span>
              <div className="flex flex-wrap gap-1">
                {e.witnesses.map((w) => (
                  <PartyBadge key={w} party={w} />
                ))}
              </div>
            </div>
          )}
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
        <div className="max-h-40 overflow-auto rounded-md bg-muted p-2">
          <JsonView data={event} defaultExpandDepth={2} />
        </div>
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

function getFirstSignatory(event: LedgerEvent): string | null {
  if (event.eventType === "created") {
    return (event as CreatedEvent).signatories?.[0] ?? null;
  }
  return null;
}

/**
 * Extract the first 2-3 primitive payload fields from a CreatedEvent for
 * inline preview in the event list. Skips nested objects/arrays.
 */
function getPayloadPreview(
  event: LedgerEvent,
  maxFields = 3
): Array<{ key: string; value: string }> | null {
  if (event.eventType !== "created") return null;
  const payload = (event as CreatedEvent).payload;
  if (!payload || typeof payload !== "object") return null;

  const entries = Object.entries(payload);
  const result: Array<{ key: string; value: string }> = [];

  for (const [key, value] of entries) {
    if (result.length >= maxFields) break;
    // Skip nested objects and arrays — only show scalar values
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    result.push({ key, value: formatPayloadValue(value) });
  }

  return result.length > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// Single event card with inline expansion
// ---------------------------------------------------------------------------

function EventCard({
  update,
  event,
  isSelected,
  onSelect,
}: {
  update: LedgerUpdate;
  event: LedgerEvent;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const templateName = getEventTemplateName(event);
  const contractId = getEventContractId(event);
  const actingParty = getActingParty(event);
  const firstSignatory = getFirstSignatory(event);
  const payloadPreview = getPayloadPreview(event);
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

  const handleCopyContractId = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!contractId) return;
      try {
        await navigator.clipboard.writeText(contractId);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Clipboard API may not be available
      }
    },
    [contractId]
  );

  const handleViewTransaction = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      window.location.href = `/transactions/${encodeURIComponent(update.updateId)}`;
    },
    [update.updateId]
  );

  return (
    <div
      className={cn(
        "group cursor-pointer rounded-lg border bg-card transition-colors hover:bg-muted/50",
        isSelected && "ring-1 ring-ring/20 bg-muted/30"
      )}
      onClick={onSelect}
    >
      {/* Row: type badge + template + contract ID + timestamp */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Icon with colored background circle */}
        <div className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", style.iconBgClass)}>
          {style.icon}
        </div>

        {/* Badge */}
        <Badge variant={getBadgeVariant(event.eventType)} className={cn("shrink-0 text-[11px]", style.textColorClass)}>
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

        {/* Acting party (exercises) */}
        {actingParty && (
          <span className="hidden sm:inline">
            <PartyBadge party={actingParty} variant="compact" />
          </span>
        )}

        {/* Signatory party (created events) */}
        {!actingParty && firstSignatory && (
          <span className="hidden sm:inline">
            <PartyBadge party={firstSignatory} variant="compact" />
          </span>
        )}

        {/* Payload preview for created events */}
        {payloadPreview && (
          <span className="hidden truncate text-xs text-muted-foreground lg:inline">
            {payloadPreview.map((f, i) => (
              <span key={f.key}>
                {i > 0 && <span className="mx-1 text-muted-foreground/30">{"\u00B7"}</span>}
                <span className="text-muted-foreground/60">{f.key}:</span>{" "}
                <span>{f.value}</span>
              </span>
            ))}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Hover action buttons */}
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  onClick={handleViewTransaction}
                >
                  <HugeiconsIcon icon={LinkForwardIcon} strokeWidth={2} className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>View Transaction</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {contractId && contractId.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    onClick={handleCopyContractId}
                  >
                    <HugeiconsIcon
                      icon={copied ? Tick02Icon : Copy01Icon}
                      strokeWidth={2}
                      className={cn("size-3.5", copied && "text-primary")}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{copied ? "Copied!" : "Copy Contract ID"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Timestamp with tooltip */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0 cursor-default font-mono text-xs text-muted-foreground">
                {formattedTime}
              </span>
            </TooltipTrigger>
            <TooltipContent>{fullTimestamp}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event list
// ---------------------------------------------------------------------------

export interface EventListProps {
  events: LedgerUpdate[];
  isPaused: boolean;
  selectedEventKey?: string | null;
  onSelectEvent?: (key: string, update: LedgerUpdate, event: LedgerEvent) => void;
}

export function EventList({ events, isPaused, selectedEventKey, onSelectEvent }: EventListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);
  const [newEventsSinceScroll, setNewEventsSinceScroll] = useState(0);
  const prevCountRef = useRef(events.length);

  // Track scroll position — since list is reversed (newest at top),
  // "at top" means the user sees the latest events
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isAtTop = el.scrollTop < 60;
    setAtTop(isAtTop);
    if (isAtTop) {
      setNewEventsSinceScroll(0);
    }
  }, []);

  // Track new events when user has scrolled away from top
  useEffect(() => {
    if (events.length > prevCountRef.current && !atTop) {
      setNewEventsSinceScroll(
        (prev) => prev + (events.length - prevCountRef.current)
      );
    }
    prevCountRef.current = events.length;
  }, [events.length, atTop]);

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setAtTop(true);
    setNewEventsSinceScroll(0);
  };

  // Flatten updates -> events with their parent update
  const flatEvents = React.useMemo(() => {
    const result: Array<{ update: LedgerUpdate; event: LedgerEvent }> = [];
    for (const update of events) {
      const updateEvents = update.events ?? [];
      if (updateEvents.length === 0) {
        // Topology / checkpoint with no sub-events -- create a summary event card
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
      {/* "New events" floating button — shown when user has scrolled away and new events arrive */}
      {newEventsSinceScroll > 0 && (
        <div className="absolute top-3 left-1/2 z-40 -translate-x-1/2 animate-in fade-in slide-in-from-top-2 duration-200">
          <Button
            size="sm"
            className="shadow-lg gap-1.5"
            onClick={scrollToTop}
          >
            <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="size-3.5" />
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
                isSelected={selectedEventKey === eventKey}
                onSelect={() => onSelectEvent?.(eventKey, update, event)}
              />
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
