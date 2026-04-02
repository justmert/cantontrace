import { useState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDataTransferHorizontalIcon,
  Tick01Icon,
  ViewOffIcon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatPartyDisplay } from "@/lib/utils";
import type { PrivacyEvent } from "@/lib/types";
import type { PartyColor } from "@/features/transactions/hooks";

// ---------------------------------------------------------------------------
// Multi-Party Comparison
// ---------------------------------------------------------------------------

export interface MultiPartyComparisonProps {
  events: PrivacyEvent[];
  parties: string[];
  partyColors: Record<string, PartyColor>;
  visibilityMatrix: Record<string, string[]>;
}

export function MultiPartyComparison({
  events,
  parties,
  partyColors,
  visibilityMatrix,
}: MultiPartyComparisonProps) {
  const [partyA, setPartyA] = useState<string>(parties[0] ?? "");
  const [partyB, setPartyB] = useState<string>(parties[1] ?? parties[0] ?? "");

  // Sync defaults when parties arrive asynchronously (initial render has [])
  useEffect(() => {
    if (parties.length >= 2) {
      setPartyA((prev) => (prev && parties.includes(prev) ? prev : parties[0]));
      setPartyB((prev) => (prev && parties.includes(prev) ? prev : parties[1]));
    } else if (parties.length === 1) {
      setPartyA((prev) => (prev && parties.includes(prev) ? prev : parties[0]));
      setPartyB((prev) => (prev && parties.includes(prev) ? prev : parties[0]));
    }
  }, [parties]);

  // Show a message when fewer than 2 parties are available
  if (parties.length < 2) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
        <HugeiconsIcon
          icon={AlertCircleIcon}
          strokeWidth={2}
          className="size-6 text-muted-foreground"
        />
        <div className="text-center">
          <p className="text-sm font-medium">
            Multi-party comparison requires 2+ parties
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {parties.length === 0
              ? "No parties found in this transaction."
              : `Only 1 party found (${parties[0]}). This view compares what different parties can see.`}
          </p>
        </div>
      </div>
    );
  }

  const canSee = (eventId: string, party: string): boolean => {
    const viewers = visibilityMatrix[eventId];
    return viewers ? viewers.includes(party) : false;
  };

  // Categorize events
  const categorized = events.map((event) => {
    const aVisible = canSee(event.eventId, partyA);
    const bVisible = canSee(event.eventId, partyB);
    let category: "both" | "only_a" | "only_b" | "neither";
    if (aVisible && bVisible) category = "both";
    else if (aVisible) category = "only_a";
    else if (bVisible) category = "only_b";
    else category = "neither";
    return { event, aVisible, bVisible, category };
  });

  const bothCount = categorized.filter((c) => c.category === "both").length;
  const onlyACount = categorized.filter((c) => c.category === "only_a").length;
  const onlyBCount = categorized.filter((c) => c.category === "only_b").length;

  return (
    <div className="flex flex-col gap-4">
      {/* Party selectors */}
      <div className="flex items-center gap-3">
        <div className="flex min-w-[180px] flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Party A
          </label>
          <Select value={partyA} onValueChange={setPartyA}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select party" />
            </SelectTrigger>
            <SelectContent>
              {parties.map((p) => (
                <SelectItem key={p} value={p}>
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "size-2 rounded-full",
                        partyColors[p]?.bg
                      )}
                    />
                    <span className="font-mono text-xs" title={p}>{formatPartyDisplay(p)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2} className="mt-5 size-4 text-muted-foreground" />

        <div className="flex min-w-[180px] flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Party B
          </label>
          <Select value={partyB} onValueChange={setPartyB}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select party" />
            </SelectTrigger>
            <SelectContent>
              {parties.map((p) => (
                <SelectItem key={p} value={p}>
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "size-2 rounded-full",
                        partyColors[p]?.bg
                      )}
                    />
                    <span className="font-mono text-xs" title={p}>{formatPartyDisplay(p)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary badges */}
        <div className="ml-auto flex items-center gap-2 pt-4">
          <Badge variant="secondary" className="text-xs">
            Both: {bothCount}
          </Badge>
          <Badge
            variant="outline"
            className={cn("text-xs", partyColors[partyA]?.text)}
          >
            Only A: {onlyACount}
          </Badge>
          <Badge
            variant="outline"
            className={cn("text-xs", partyColors[partyB]?.text)}
          >
            Only B: {onlyBCount}
          </Badge>
        </div>
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-4">
        {/* Party A's view */}
        <div className="rounded-lg border">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
            <div
              className={cn(
                "size-3 rounded-full",
                partyColors[partyA]?.bg
              )}
            />
            <span className="font-mono text-sm font-medium" title={partyA}>{formatPartyDisplay(partyA)}</span>
            <span className="text-xs text-muted-foreground">
              ({bothCount + onlyACount} of {events.length} events visible)
            </span>
          </div>
          <ScrollArea className="h-[300px]">
            <div className="flex flex-col gap-1 p-2">
              {categorized.map(({ event, aVisible, category }) => (
                <div
                  key={event.eventId}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs transition-colors",
                    aVisible
                      ? "bg-card"
                      : "bg-muted/30 text-muted-foreground/50",
                    category === "only_a" &&
                      "ring-1 ring-inset ring-primary/20 bg-primary/5"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {aVisible ? (
                        <HugeiconsIcon icon={Tick01Icon} strokeWidth={2} className="size-3 text-primary" />
                      ) : (
                        <HugeiconsIcon icon={ViewOffIcon} strokeWidth={2} className="size-3 text-muted-foreground/40" />
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          !aVisible && "opacity-40"
                        )}
                      >
                        {event.eventType}
                      </Badge>
                      <span className={cn(!aVisible && "opacity-40")}>
                        {event.templateId.entityName}
                      </span>
                    </div>
                    {!aVisible && (
                      <span className="text-[10px] italic text-muted-foreground/60">
                        Not in this party's projection
                      </span>
                    )}
                    {category === "only_a" && (
                      <Badge className="bg-primary/10 text-primary text-[9px] px-1 py-0">
                        unique
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Party B's view */}
        <div className="rounded-lg border">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
            <div
              className={cn(
                "size-3 rounded-full",
                partyColors[partyB]?.bg
              )}
            />
            <span className="font-mono text-sm font-medium" title={partyB}>{formatPartyDisplay(partyB)}</span>
            <span className="text-xs text-muted-foreground">
              ({bothCount + onlyBCount} of {events.length} events visible)
            </span>
          </div>
          <ScrollArea className="h-[300px]">
            <div className="flex flex-col gap-1 p-2">
              {categorized.map(({ event, bVisible, category }) => (
                <div
                  key={event.eventId}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs transition-colors",
                    bVisible
                      ? "bg-card"
                      : "bg-muted/30 text-muted-foreground/50",
                    category === "only_b" &&
                      "ring-1 ring-inset ring-primary/20 bg-primary/5"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {bVisible ? (
                        <HugeiconsIcon icon={Tick01Icon} strokeWidth={2} className="size-3 text-primary" />
                      ) : (
                        <HugeiconsIcon icon={ViewOffIcon} strokeWidth={2} className="size-3 text-muted-foreground/40" />
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          !bVisible && "opacity-40"
                        )}
                      >
                        {event.eventType}
                      </Badge>
                      <span className={cn(!bVisible && "opacity-40")}>
                        {event.templateId.entityName}
                      </span>
                    </div>
                    {!bVisible && (
                      <span className="text-[10px] italic text-muted-foreground/60">
                        Not in this party's projection
                      </span>
                    )}
                    {category === "only_b" && (
                      <Badge className="bg-primary/10 text-primary text-[9px] px-1 py-0">
                        unique
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
