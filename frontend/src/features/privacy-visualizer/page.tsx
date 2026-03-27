import React, { useState, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, Search01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { truncateId } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { PrivacyTree } from "./components/privacy-tree";
import { PartySelector } from "./components/party-selector";
import { VisibilityMatrix } from "./components/visibility-matrix";
import { MultiPartyComparison } from "./components/multi-party-comparison";
import { StaticAnalysis } from "./components/static-analysis";
import { usePrivacyAnalysis, usePartyColors } from "./hooks";
import { useRecentTransactions } from "../transaction-explorer/hooks";

// ---------------------------------------------------------------------------
// Privacy Visualizer Page
// ---------------------------------------------------------------------------

/**
 * Extract the updateId from the URL pathname when the route is
 * `/privacy/:updateId`.  TanStack Router's `useLocation` gives us
 * `pathname` which we can parse manually to avoid requiring typed
 * route-param hooks that depend on generated route types.
 */
function useUpdateIdFromUrl(): string | undefined {
  const { pathname } = useLocation();
  const match = pathname.match(/^\/privacy\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

// ---------------------------------------------------------------------------
// Event type badge color mapping (shared with transaction-search)
// ---------------------------------------------------------------------------

function eventTypeBadgeVariant(
  eventType: string
): "default" | "secondary" | "outline" {
  const lower = eventType.toLowerCase();
  if (lower.includes("created") || lower.includes("create")) return "default";
  if (lower.includes("exercised") || lower.includes("exercise"))
    return "secondary";
  return "outline";
}

export default function PrivacyVisualizerPage() {
  const navigate = useNavigate();
  const urlUpdateId = useUpdateIdFromUrl();

  const [activeUpdateId, setActiveUpdateId] = useState<string | null>(
    urlUpdateId ?? null
  );
  const [selectedParties, setSelectedParties] = useState<Set<string>>(
    new Set()
  );
  const [highlightedParty, setHighlightedParty] = useState<string | null>(null);

  // Combobox state
  const [comboOpen, setComboOpen] = useState(false);
  const [comboInput, setComboInput] = useState("");

  const { data: recentTransactions } = useRecentTransactions();

  // When the URL param changes (e.g. direct navigation), sync state
  useEffect(() => {
    if (urlUpdateId && urlUpdateId !== activeUpdateId) {
      setActiveUpdateId(urlUpdateId);
      setHighlightedParty(null);
    }
  }, [urlUpdateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    data: analysis,
    isLoading,
    error,
  } = usePrivacyAnalysis(activeUpdateId);

  const parties = analysis?.parties ?? [];
  const partyColors = usePartyColors(parties);

  // Initialize selected parties when analysis loads
  useEffect(() => {
    if (analysis) {
      setSelectedParties(new Set(analysis.parties));
    }
  }, [analysis]);

  const handleSelectTransaction = useCallback(
    (updateId: string) => {
      const trimmed = updateId.trim();
      if (trimmed) {
        setActiveUpdateId(trimmed);
        setHighlightedParty(null);
        setComboOpen(false);
        setComboInput("");
        navigate({ to: `/privacy/${encodeURIComponent(trimmed)}` });
      }
    },
    [navigate]
  );

  const handleComboKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && comboInput.trim()) {
      const trimmed = comboInput.trim();
      const isExactMatch = (recentTransactions ?? []).some(
        (tx) => tx.updateId === trimmed
      );
      if (!isExactMatch) {
        handleSelectTransaction(trimmed);
        e.preventDefault();
      }
    }
  };

  const handleToggleParty = useCallback((party: string) => {
    setSelectedParties((prev) => {
      const next = new Set(prev);
      if (next.has(party)) {
        next.delete(party);
      } else {
        next.add(party);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedParties(new Set(parties));
  }, [parties]);

  const handleSelectNone = useCallback(() => {
    setSelectedParties(new Set());
  }, []);

  const handleHighlightParty = useCallback((party: string | null) => {
    setHighlightedParty(party);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <PageHeader
        icon={ViewIcon}
        title="Privacy Visualizer"
        subtitle="Per-party visibility analysis for transaction events"
      />

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">

      {/* Transaction combobox */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
          <span>Transaction</span>
        </div>

        <Popover open={comboOpen} onOpenChange={setComboOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={comboOpen}
              className="h-10 w-full justify-between px-3 font-normal"
            >
              <div className="flex items-center gap-2 truncate">
                {isLoading ? (
                  <Spinner className="size-3.5 shrink-0" />
                ) : (
                  <HugeiconsIcon
                    icon={Search01Icon}
                    strokeWidth={2}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                )}
                {activeUpdateId ? (
                  <span className="font-mono text-sm">
                    {truncateId(activeUpdateId, 24)}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Select a transaction to analyze...
                  </span>
                )}
              </div>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                strokeWidth={2}
                className="size-4 shrink-0 opacity-50"
              />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search by Update ID..."
                value={comboInput}
                onValueChange={setComboInput}
                onKeyDown={handleComboKeyDown}
              />
              <CommandList>
                <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                  {comboInput.trim()
                    ? "Press Enter to analyze this Update ID"
                    : "No recent transactions"}
                </CommandEmpty>

                {(recentTransactions ?? []).length > 0 && (
                  <CommandGroup heading="Recent Transactions">
                    {(recentTransactions ?? [])
                      .filter(
                        (tx) =>
                          !comboInput.trim() ||
                          tx.updateId
                            .toLowerCase()
                            .includes(comboInput.trim().toLowerCase()) ||
                          tx.offset.includes(comboInput.trim())
                      )
                      .map((tx) => (
                        <CommandItem
                          key={tx.updateId}
                          value={tx.updateId}
                          onSelect={() =>
                            handleSelectTransaction(tx.updateId)
                          }
                          className="flex items-center gap-2"
                        >
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            #{tx.offset}
                          </span>

                          {tx.eventTypes.slice(0, 1).map((et) => (
                            <Badge
                              key={et}
                              variant={eventTypeBadgeVariant(et)}
                              className="shrink-0 text-[10px]"
                            >
                              {et}
                            </Badge>
                          ))}

                          <span className="min-w-0 truncate font-mono text-xs">
                            {truncateId(tx.updateId, 16)}
                          </span>

                          {tx.recordTime && (
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                              {formatDistanceToNow(
                                new Date(tx.recordTime),
                                { addSuffix: true }
                              )}
                            </span>
                          )}
                        </CommandItem>
                      ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Loading state */}
      {isLoading && !analysis && (
        <div className="flex h-[300px] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Spinner className="size-6" />
            <p className="text-sm text-muted-foreground">
              Loading privacy analysis...
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Failed to load privacy analysis</p>
          <p className="mt-1 text-xs">
            {error instanceof Error
              ? error.message
              : "An unexpected error occurred"}
          </p>
        </div>
      )}

      {/* Main content */}
      {analysis && (
        <div className="grid grid-cols-[1fr_260px] gap-4">
          {/* Left: visualization area */}
          <div className="flex flex-col gap-4">
            <Tabs defaultValue="tree">
              <TabsList>
                <TabsTrigger value="tree">Privacy Tree</TabsTrigger>
                <TabsTrigger value="matrix">Visibility Matrix</TabsTrigger>
                <TabsTrigger value="comparison">Multi-Party Comparison</TabsTrigger>
                <TabsTrigger value="static">Static Analysis</TabsTrigger>
              </TabsList>

              <TabsContent value="tree">
                <PrivacyTree
                  events={analysis.events}
                  partyColors={partyColors}
                  selectedParties={selectedParties}
                  highlightedParty={highlightedParty}
                  disclosedBoundaries={analysis.disclosedContractBoundaries}
                  isLoading={isLoading}
                />
              </TabsContent>

              <TabsContent value="matrix">
                <VisibilityMatrix
                  events={analysis.events}
                  parties={parties}
                  partyColors={partyColors}
                  visibilityMatrix={analysis.visibilityMatrix}
                />
              </TabsContent>

              <TabsContent value="comparison">
                <MultiPartyComparison
                  events={analysis.events}
                  parties={parties}
                  partyColors={partyColors}
                  visibilityMatrix={analysis.visibilityMatrix}
                />
              </TabsContent>

              <TabsContent value="static">
                <StaticAnalysis events={analysis.events} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: party selector sidebar */}
          <PartySelector
            parties={parties}
            partyColors={partyColors}
            selectedParties={selectedParties}
            highlightedParty={highlightedParty}
            onToggleParty={handleToggleParty}
            onSelectAll={handleSelectAll}
            onSelectNone={handleSelectNone}
            onHighlightParty={handleHighlightParty}
          />
        </div>
      )}

      {/* Empty state when no analysis loaded */}
      {!analysis && !isLoading && !error && (
        <Empty className="h-[300px]">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={ViewIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>Enter an Update ID to analyze privacy</EmptyTitle>
            <EmptyDescription>
              View which parties can see each event in a transaction, with
              support for disclosed contract boundaries
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      </div>
    </div>
  );
}
