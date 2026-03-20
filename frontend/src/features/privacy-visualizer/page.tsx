import React, { useState, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { PrivacyTree } from "./components/privacy-tree";
import { PartySelector } from "./components/party-selector";
import { VisibilityMatrix } from "./components/visibility-matrix";
import { MultiPartyComparison } from "./components/multi-party-comparison";
import { StaticAnalysis } from "./components/static-analysis";
import { usePrivacyAnalysis, usePartyColors } from "./hooks";

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

export default function PrivacyVisualizerPage() {
  const navigate = useNavigate();
  const urlUpdateId = useUpdateIdFromUrl();

  const [updateIdInput, setUpdateIdInput] = useState(urlUpdateId ?? "");
  const [activeUpdateId, setActiveUpdateId] = useState<string | null>(
    urlUpdateId ?? null
  );
  const [selectedParties, setSelectedParties] = useState<Set<string>>(
    new Set()
  );
  const [highlightedParty, setHighlightedParty] = useState<string | null>(null);

  // When the URL param changes (e.g. direct navigation), sync state
  useEffect(() => {
    if (urlUpdateId && urlUpdateId !== activeUpdateId) {
      setUpdateIdInput(urlUpdateId);
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

  const handleSearch = useCallback(() => {
    const trimmed = updateIdInput.trim();
    if (trimmed) {
      setActiveUpdateId(trimmed);
      setHighlightedParty(null);
      // Update the URL to include the updateId
      navigate({ to: `/privacy/${encodeURIComponent(trimmed)}` });
    }
  }, [updateIdInput, navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
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
    <div className="flex flex-col gap-4 p-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
          <HugeiconsIcon icon={ViewIcon} strokeWidth={2} className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Privacy Visualizer
          </h1>
          <p className="text-sm text-muted-foreground">
            Per-party visibility analysis for transaction events
          </p>
        </div>
      </div>

      {/* Update ID input */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
          <span>Transaction</span>
        </div>
        <div className="flex gap-2">
          <Input
            className="flex-1 font-mono text-xs"
            placeholder="Enter Update ID to analyze privacy..."
            value={updateIdInput}
            onChange={(e) => setUpdateIdInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button
            onClick={handleSearch}
            disabled={!updateIdInput.trim() || isLoading}
          >
            {isLoading ? "Analyzing..." : "Analyze"}
          </Button>
        </div>
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
  );
}
