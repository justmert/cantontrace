import React, { useState, useCallback, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  RadioIcon,
  AlertCircleIcon,
  Search01Icon,
  Shield01Icon,
  Sword01Icon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import type {
  LedgerUpdate,
  Reassignment,
  ContentionTimeline as ContentionTimelineType,
} from "@/lib/types";
import {
  useEventStream,
  useEventFilter,
  useReassignments,
  useErrorExplanation,
  type ReassignmentFilter,
} from "./hooks";
import { StreamControls } from "./components/stream-controls";
import { EventFilter } from "./components/event-filter";
import { EventList } from "./components/event-list";
import { ErrorList } from "./components/error-list";
import { ErrorCategoryBadge } from "./components/error-category-badge";
import { ContentionTimeline } from "./components/contention-timeline";
import { ReassignmentList } from "./components/reassignment-list";
import { ReassignmentDetail } from "./components/reassignment-detail";

// ---------------------------------------------------------------------------
// Stream tab content
// ---------------------------------------------------------------------------

function StreamTabContent({
  events,
  isPaused,
  filter,
  setTemplates,
  setEventTypes,
  setParties,
  setTransactionShape,
  resetFilter,
}: {
  events: LedgerUpdate[];
  isPaused: boolean;
  filter: ReturnType<typeof useEventFilter>["filter"];
  setTemplates: ReturnType<typeof useEventFilter>["setTemplates"];
  setEventTypes: ReturnType<typeof useEventFilter>["setEventTypes"];
  setParties: ReturnType<typeof useEventFilter>["setParties"];
  setTransactionShape: ReturnType<typeof useEventFilter>["setTransactionShape"];
  resetFilter: ReturnType<typeof useEventFilter>["reset"];
}) {
  // Derive unique parties from seen events for the party filter dropdown
  const seenParties = useMemo(() => {
    const set = new Set<string>();
    for (const update of events) {
      for (const event of update.events ?? []) {
        if (event.eventType === "exercised") {
          for (const p of (event as { actingParties: string[] })
            .actingParties) {
            set.add(p);
          }
        }
        if ("signatories" in event) {
          for (const s of (event as { signatories: string[] }).signatories) {
            set.add(s);
          }
        }
      }
    }
    return Array.from(set).sort();
  }, [events]);

  // Derive unique template names from seen events for the template filter dropdown
  const seenTemplates = useMemo(() => {
    const map = new Map<
      string,
      { packageName: string; moduleName: string; entityName: string }
    >();
    for (const update of events) {
      for (const event of update.events ?? []) {
        if ("templateId" in event && event.templateId) {
          const tid = event.templateId;
          const key = `${tid.packageName}:${tid.moduleName}:${tid.entityName}`;
          if (!map.has(key)) {
            map.set(key, tid);
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      `${a.moduleName}:${a.entityName}`.localeCompare(
        `${b.moduleName}:${b.entityName}`
      )
    );
  }, [events]);

  // Apply client-side filtering at the EVENT level
  const filteredEvents = useMemo(() => {
    const hasTypeFilter = filter.eventTypes && filter.eventTypes.length > 0;
    const hasTemplateFilter = filter.templates && filter.templates.length > 0;
    const hasPartyFilter = filter.parties && filter.parties.length > 0;

    if (!hasTypeFilter && !hasTemplateFilter && !hasPartyFilter) {
      return events;
    }

    const allowedTypes = hasTypeFilter ? new Set(filter.eventTypes) : null;
    const templateKeys = hasTemplateFilter
      ? new Set(
          filter.templates!.map((t) => `${t.moduleName}:${t.entityName}`)
        )
      : null;
    const partySet = hasPartyFilter ? new Set(filter.parties) : null;

    return events
      .map((update) => {
        const updateEvents = update.events ?? [];
        if (updateEvents.length === 0) {
          if (allowedTypes && !allowedTypes.has(update.updateType)) return null;
          return update;
        }

        const filtered = updateEvents.filter((e) => {
          if (allowedTypes && !allowedTypes.has(e.eventType)) return false;

          if (templateKeys && "templateId" in e && e.templateId) {
            const key = `${e.templateId.moduleName}:${e.templateId.entityName}`;
            if (!templateKeys.has(key)) return false;
          }

          if (partySet) {
            let matchesParty = false;
            if (e.eventType === "exercised") {
              matchesParty = (
                e as { actingParties: string[] }
              ).actingParties.some((p) => partySet.has(p));
            }
            if (!matchesParty && "signatories" in e) {
              matchesParty = (e as { signatories: string[] }).signatories.some(
                (s) => partySet.has(s)
              );
            }
            if (!matchesParty) return false;
          }

          return true;
        });

        if (filtered.length === 0) return null;
        return { ...update, events: filtered };
      })
      .filter((u): u is LedgerUpdate => u !== null);
  }, [events, filter.eventTypes, filter.templates, filter.parties]);

  const handleApplyFilter = useCallback(() => {
    // Filters apply instantly via filteredEvents useMemo -- no-op
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden">
      {/* Filter bar */}
      <div>
        <EventFilter
          filter={filter}
          templates={seenTemplates}
          parties={seenParties}
          onSetTemplates={setTemplates}
          onSetEventTypes={setEventTypes}
          onSetParties={setParties}
          onSetTransactionShape={setTransactionShape}
          onApply={handleApplyFilter}
          onReset={resetFilter}
        />
      </div>

      {/* Live event feed */}
      <EventList events={filteredEvents} isPaused={isPaused} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Errors tab content (mirrors error-debugger/page.tsx internal tabs)
// ---------------------------------------------------------------------------

function ErrorLookupTab() {
  const [errorCode, setErrorCode] = useState("");
  const [lookupCode, setLookupCode] = useState<string | undefined>(undefined);
  const {
    data: explanation,
    isLoading,
    isError,
  } = useErrorExplanation(lookupCode);

  const handleLookup = () => {
    const trimmed = errorCode.trim();
    if (trimmed) {
      setLookupCode(trimmed);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <Field className="max-w-md flex-1">
          <FieldLabel className="text-xs font-medium text-muted-foreground">
            Error Code
          </FieldLabel>
          <Input
            placeholder="Enter an error code (e.g. CONTRACT_NOT_FOUND)..."
            className="font-mono text-sm"
            value={errorCode}
            onChange={(e) => setErrorCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLookup();
            }}
          />
        </Field>
        <Button onClick={handleLookup} disabled={!errorCode.trim() || isLoading}>
          <HugeiconsIcon
            icon={Search01Icon}
            data-icon="inline-start"
            strokeWidth={2}
          />
          Look Up
        </Button>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3 rounded-lg border p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      )}

      {isError && (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyDescription>
              Error code not found in the knowledge base. Check the code and try
              again.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {lookupCode && !isLoading && !isError && !explanation && (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Error code not found</EmptyTitle>
            <EmptyDescription>
              &ldquo;{lookupCode}&rdquo; was not found in the knowledge base.
              Check the code and try again.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {explanation && (
        <div className="flex flex-col gap-4">
          {/* Header with error code and category */}
          <div className="flex items-start gap-4 rounded-lg border p-5">
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold">
                  {explanation.errorCodeId}
                </span>
                {explanation.category && (
                  <ErrorCategoryBadge category={explanation.category} />
                )}
              </div>
              {explanation.grpcStatusCode && (
                <span className="text-xs text-muted-foreground">
                  gRPC status: {explanation.grpcStatusCode}
                </span>
              )}
            </div>
          </div>

          {/* PERMISSION_DENIED / auth credential security banner */}
          {(explanation.category ===
            "AuthInterceptorInvalidAuthenticationCredentials" ||
            explanation.grpcStatusCode === "PERMISSION_DENIED") && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <HugeiconsIcon
                icon={Shield01Icon}
                className="mt-0.5 size-5 flex-shrink-0 text-destructive"
                strokeWidth={2}
              />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-destructive">
                  Security Note
                </span>
                <p className="text-xs text-destructive/80">
                  Detailed error information has been stripped from the API
                  response for security reasons. Check the participant node's
                  server-side logs for full details.
                </p>
              </div>
            </div>
          )}

          {/* Explanation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Explanation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground">
                {explanation.explanation}
              </p>
            </CardContent>
          </Card>

          {/* Common Causes */}
          {explanation.commonCauses && explanation.commonCauses.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Common Causes</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-2 text-sm">
                  {explanation.commonCauses.map((cause: string, i: number) => (
                    <li key={i} className="flex gap-2">
                      <span className="flex size-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {i + 1}
                      </span>
                      <span className="text-muted-foreground">{cause}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* Suggested Fixes */}
          {explanation.suggestedFixes &&
            explanation.suggestedFixes.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Suggested Fixes</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="flex flex-col gap-2 text-sm">
                    {explanation.suggestedFixes.map(
                      (fix: string, i: number) => (
                        <li key={i} className="flex gap-2">
                          <span className="flex size-5 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                            {i + 1}
                          </span>
                          <span>{fix}</span>
                        </li>
                      )
                    )}
                  </ol>
                </CardContent>
              </Card>
            )}
        </div>
      )}
    </div>
  );
}

function ContentionTab() {
  const [contentionEvents] = useState<ContentionTimelineType[]>([]);

  if (contentionEvents.length === 0) {
    return (
      <Empty className="py-20">
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={Sword01Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No contention events detected</EmptyTitle>
          <EmptyDescription>
            When multiple transactions compete for the same contract, contention
            details will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {contentionEvents.map((ce, i) => (
        <ContentionTimeline key={i} contention={ce} />
      ))}
    </div>
  );
}

function ErrorsTabContent() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Tabs defaultValue="recent" className="flex flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="recent">Recent Errors</TabsTrigger>
          <TabsTrigger value="lookup">Error Lookup</TabsTrigger>
          <TabsTrigger value="contention">Contention</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="flex-1 overflow-auto pb-6">
          <ErrorList />
        </TabsContent>

        <TabsContent value="lookup" className="flex-1 overflow-auto pb-6">
          <ErrorLookupTab />
        </TabsContent>

        <TabsContent
          value="contention"
          className="flex-1 overflow-auto pb-6"
        >
          <ContentionTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reassignments tab content
// ---------------------------------------------------------------------------

function ReassignmentsTabContent() {
  const [filter, setFilter] = useState<ReassignmentFilter>({});
  const [selectedReassignment, setSelectedReassignment] =
    useState<Reassignment | null>(null);

  const {
    data: reassignments,
    isLoading,
    error,
  } = useReassignments(filter);

  const handleSelect = useCallback((reassignment: Reassignment) => {
    setSelectedReassignment(reassignment);
  }, []);

  const handleFilterChange = useCallback((newFilter: ReassignmentFilter) => {
    setFilter(newFilter);
  }, []);

  // Keep selection in sync with refreshed data
  const selectedId = selectedReassignment?.reassignmentId ?? null;
  React.useEffect(() => {
    if (selectedId && reassignments) {
      const updated = reassignments.find(
        (r) => r.reassignmentId === selectedId
      );
      if (updated) {
        setSelectedReassignment(updated);
      }
    }
  }, [reassignments, selectedId]);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto">
      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Failed to load reassignments</p>
          <p className="mt-1 text-xs">
            {error instanceof Error
              ? error.message
              : "An unexpected error occurred"}
          </p>
        </div>
      )}

      {/* Reassignment list with filters */}
      <ReassignmentList
        reassignments={reassignments}
        isLoading={isLoading}
        filter={filter}
        onFilterChange={handleFilterChange}
        selectedReassignmentId={selectedReassignment?.reassignmentId ?? null}
        onSelect={handleSelect}
      />

      {/* Detail panel */}
      {selectedReassignment && (
        <ReassignmentDetail reassignment={selectedReassignment} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main unified Events page
// ---------------------------------------------------------------------------

export default function EventsPage() {
  const {
    filter,
    setTemplates,
    setParties,
    setEventTypes,
    setTransactionShape,
    reset: resetFilter,
  } = useEventFilter();

  const {
    events,
    status,
    isPaused,
    eventCount,
    isLoadingRecent,
    pause,
    resume,
    clear,
    reconnect,
    loadRecent,
  } = useEventStream(filter);

  return (
    <div className="flex h-full flex-col">
      {/* Page header with stream controls */}
      <PageHeader
        icon={RadioIcon}
        title="Events"
        subtitle="Live ledger activity"
      >
        <StreamControls
          status={status}
          isPaused={isPaused}
          eventCount={eventCount}
          isLoadingRecent={isLoadingRecent}
          onPause={pause}
          onResume={resume}
          onClear={clear}
          onReconnect={reconnect}
          onLoadRecent={loadRecent}
        />
      </PageHeader>

      {/* Top-level tabs */}
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <Tabs defaultValue="stream" className="flex flex-1 flex-col">
          <TabsList variant="line">
            <TabsTrigger value="stream">Stream</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
            <TabsTrigger value="reassignments">Reassignments</TabsTrigger>
          </TabsList>

          <TabsContent
            value="stream"
            className="flex flex-1 flex-col overflow-hidden"
          >
            <StreamTabContent
              events={events}
              isPaused={isPaused}
              filter={filter}
              setTemplates={setTemplates}
              setEventTypes={setEventTypes}
              setParties={setParties}
              setTransactionShape={setTransactionShape}
              resetFilter={resetFilter}
            />
          </TabsContent>

          <TabsContent
            value="errors"
            className="flex flex-1 flex-col overflow-hidden"
          >
            <ErrorsTabContent />
          </TabsContent>

          <TabsContent
            value="reassignments"
            className="flex flex-1 flex-col overflow-hidden"
          >
            <ReassignmentsTabContent />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
