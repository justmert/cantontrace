import { useCallback, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { RadioIcon } from "@hugeicons/core-free-icons";
import { useEventStream, useEventFilter } from "./hooks";
import { StreamControls } from "./components/stream-controls";
import { EventFilter } from "./components/event-filter";
import { EventList } from "./components/event-list";

export default function EventStreamPage() {
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

  // Apply is a no-op — filters are applied client-side instantly via filteredEvents
  const handleApplyFilter = useCallback(() => {
    // Filters already apply instantly via the filteredEvents useMemo.
    // No need to reconnect the stream.
  }, []);

  // Derive unique parties from seen events for the party filter dropdown
  const seenParties = useMemo(() => {
    const set = new Set<string>();
    for (const update of events) {
      for (const event of (update.events ?? [])) {
        if (event.eventType === "exercised") {
          for (const p of (event as { actingParties: string[] })
            .actingParties) {
            set.add(p);
          }
        }
        if ("signatories" in event) {
          for (const s of (event as { signatories: string[] })
            .signatories) {
            set.add(s);
          }
        }
      }
    }
    return Array.from(set).sort();
  }, [events]);

  // Derive unique template names from seen events for the template filter dropdown
  const seenTemplates = useMemo(() => {
    const map = new Map<string, { packageName: string; moduleName: string; entityName: string }>();
    for (const update of events) {
      for (const event of (update.events ?? [])) {
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
      `${a.moduleName}:${a.entityName}`.localeCompare(`${b.moduleName}:${b.entityName}`)
    );
  }, [events]);

  // Apply client-side filtering at the EVENT level (not update level).
  // Each update's events array is filtered, and updates with no matching events are removed.
  const filteredEvents = useMemo(() => {
    const hasTypeFilter = filter.eventTypes && filter.eventTypes.length > 0;
    const hasTemplateFilter = filter.templates && filter.templates.length > 0;
    const hasPartyFilter = filter.parties && filter.parties.length > 0;

    if (!hasTypeFilter && !hasTemplateFilter && !hasPartyFilter) {
      return events;
    }

    const allowedTypes = hasTypeFilter ? new Set(filter.eventTypes) : null;
    const templateKeys = hasTemplateFilter
      ? new Set(filter.templates!.map((t) => `${t.moduleName}:${t.entityName}`))
      : null;
    const partySet = hasPartyFilter ? new Set(filter.parties) : null;

    return events
      .map((update) => {
        const updateEvents = update.events ?? [];
        if (updateEvents.length === 0) {
          // Topology/checkpoint — check against updateType if type filter is active
          if (allowedTypes && !allowedTypes.has(update.updateType)) return null;
          return update;
        }

        // Filter individual events
        const filtered = updateEvents.filter((e) => {
          // Type filter
          if (allowedTypes && !allowedTypes.has(e.eventType)) return false;

          // Template filter
          if (templateKeys && "templateId" in e && e.templateId) {
            const key = `${e.templateId.moduleName}:${e.templateId.entityName}`;
            if (!templateKeys.has(key)) return false;
          }

          // Party filter
          if (partySet) {
            let matchesParty = false;
            if (e.eventType === "exercised") {
              matchesParty = (e as { actingParties: string[] }).actingParties.some(
                (p) => partySet.has(p)
              );
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

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <HugeiconsIcon icon={RadioIcon} strokeWidth={2} className="size-5 text-primary" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Event Stream Monitor</h1>
          <p className="text-xs text-muted-foreground">
            Real-time ledger event feed
          </p>
        </div>

        {/* Stream controls in the header */}
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
      </div>

      <div className="flex flex-1 flex-col gap-0 overflow-hidden">
        {/* Filter bar */}
        <div className="border-b p-4">
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
    </div>
  );
}
