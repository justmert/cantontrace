import { useCallback, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick01Icon, ViewOffIcon, ArrowUpDownIcon, GridTableIcon } from "@hugeicons/core-free-icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import type { PrivacyEvent } from "@/lib/types";
import type { PartyColor } from "@/features/transactions/hooks";

// ---------------------------------------------------------------------------
// Visibility Matrix
// ---------------------------------------------------------------------------

type SortField = "event" | string; // string for party names
type SortDir = "asc" | "desc";

export interface VisibilityMatrixProps {
  events: PrivacyEvent[];
  parties: string[];
  partyColors: Record<string, PartyColor>;
  visibilityMatrix: Record<string, string[]>;
}

export function VisibilityMatrix({
  events,
  parties,
  partyColors,
  visibilityMatrix,
}: VisibilityMatrixProps) {
  const [sortField, setSortField] = useState<SortField>("event");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // Determine if a party can see an event (eventId -> parties[])
  const canSee = useCallback(
    (eventId: string, party: string): boolean => {
      const viewers = visibilityMatrix[eventId];
      return viewers ? viewers.includes(party) : false;
    },
    [visibilityMatrix]
  );

  // Sort events
  const sortedEvents = useMemo(() => {
    const arr = [...events];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortField === "event") {
        cmp = a.eventId.localeCompare(b.eventId);
      } else {
        // Sort by visibility for a specific party
        const aVis = canSee(a.eventId, sortField) ? 1 : 0;
        const bVis = canSee(b.eventId, sortField) ? 1 : 0;
        cmp = aVis - bVis;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [events, sortField, sortDir, canSee]);

  // Summary per party
  const partySummaries = useMemo(() => {
    const summaries: Record<string, number> = {};
    parties.forEach((party) => {
      summaries[party] = events.filter((e) => canSee(e.eventId, party)).length;
    });
    return summaries;
  }, [events, parties, canSee]);

  if (events.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={GridTableIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No events to display in the visibility matrix</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <TooltipProvider>
      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              {/* Event column */}
              <TableHead className="sticky left-0 z-10 bg-muted/30">
                <button
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  onClick={() => handleSort("event")}
                >
                  Event
                  <HugeiconsIcon
                    icon={ArrowUpDownIcon}
                    strokeWidth={2}
                    className={cn(
                      "size-3",
                      sortField === "event"
                        ? "text-foreground"
                        : "text-muted-foreground/50"
                    )}
                  />
                </button>
              </TableHead>
              <TableHead className="sticky left-0 z-10 bg-muted/30">
                Type
              </TableHead>
              <TableHead className="sticky left-0 z-10 bg-muted/30">
                Template
              </TableHead>
              {/* Party columns */}
              {parties.map((party) => (
                <TableHead key={party} className="text-center">
                  <button
                    className="inline-flex flex-col items-center gap-0.5 hover:text-foreground"
                    onClick={() => handleSort(party)}
                  >
                    <div
                      className={cn(
                        "size-2 rounded-full",
                        partyColors[party]?.bg
                      )}
                    />
                    <span className="max-w-[80px] truncate font-mono text-[10px]">
                      {party}
                    </span>
                    <HugeiconsIcon
                      icon={ArrowUpDownIcon}
                      strokeWidth={2}
                      className={cn(
                        "size-2.5",
                        sortField === party
                          ? "text-foreground"
                          : "text-muted-foreground/50"
                      )}
                    />
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedEvents.map((event) => (
              <TableRow key={event.eventId}>
                <TableCell className="sticky left-0 max-w-[180px] bg-card font-mono text-xs">
                  <span className="block truncate" title={event.eventId}>{event.eventId}</span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      event.eventType === "created" &&
                        "border-primary/50 text-primary",
                      event.eventType === "exercised" &&
                        "border-secondary-foreground/50 text-secondary-foreground",
                      event.eventType === "archived" &&
                        "border-destructive/50 text-destructive"
                    )}
                  >
                    {event.eventType}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-xs">
                    {event.templateId.entityName}
                  </span>
                </TableCell>
                {parties.map((party) => {
                  const visible = canSee(event.eventId, party);
                  return (
                    <TableCell key={party} className="text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center justify-center">
                            {visible ? (
                              <div className="flex size-5 items-center justify-center rounded-full bg-primary/15">
                                <HugeiconsIcon icon={Tick01Icon} strokeWidth={2} className="size-3 text-primary" />
                              </div>
                            ) : (
                              <div className="flex size-5 items-center justify-center rounded-full bg-muted/50">
                                <HugeiconsIcon icon={ViewOffIcon} strokeWidth={2} className="size-3 text-muted-foreground/50" />
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {visible
                            ? `${party} can see this event (is a witness)`
                            : `Not in ${party}'s projection of the transaction -- this does not mean the event is absent, only that ${party} has no visibility`}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}

            {/* Summary row */}
            <TableRow className="border-t-2 bg-muted/20 font-medium">
              <TableCell
                colSpan={3}
                className="sticky left-0 bg-muted/20 text-xs text-muted-foreground"
              >
                Summary
              </TableCell>
              {parties.map((party) => (
                <TableCell key={party} className="text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs">
                        {partySummaries[party]}/{events.length}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {party} can see {partySummaries[party]} of{" "}
                      {events.length} events
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
