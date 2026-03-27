import React, { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  PlayIcon,
  Delete01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  LinkSquare01Icon,
  Alert01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { cn, truncateId, formatTemplateId } from "@/lib/utils";
import type { ContractLifecycle } from "@/lib/types";

// ---------------------------------------------------------------------------
// JSON tree viewer
// ---------------------------------------------------------------------------

function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (data === null || data === undefined) {
    return <span className="text-muted-foreground">null</span>;
  }

  if (typeof data !== "object") {
    if (typeof data === "string") {
      return <span className="break-all text-primary">&quot;{data}&quot;</span>;
    }
    if (typeof data === "boolean") {
      return (
        <span className="text-secondary-foreground">
          {data ? "true" : "false"}
        </span>
      );
    }
    return <span className="text-accent-foreground">{String(data)}</span>;
  }

  const entries = Array.isArray(data)
    ? data.map((v, i) => [String(i), v] as const)
    : Object.entries(data as Record<string, unknown>);

  if (entries.length === 0) {
    return (
      <span className="text-muted-foreground">
        {Array.isArray(data) ? "[]" : "{}"}
      </span>
    );
  }

  return (
    <div className="flex flex-col">
      <button
        className="inline-flex items-center gap-1 text-xs hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3" strokeWidth={2} />
        ) : (
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" strokeWidth={2} />
        )}
        <span className="text-muted-foreground">
          {Array.isArray(data)
            ? `Array(${entries.length})`
            : `{${entries.length} fields}`}
        </span>
      </button>
      {expanded && (
        <div className="ml-4 flex flex-col gap-0.5 border-l border-border pl-3">
          {entries.map(([key, value]) => (
            <div key={key} className="flex min-w-0 items-start gap-1.5 text-xs">
              <span className="flex-shrink-0 font-mono text-muted-foreground">
                {key}:
              </span>
              <div className="min-w-0">
                <JsonTree data={value} depth={depth + 1} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timestamp formatter
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string) {
  if (!ts) return "\u2014";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "\u2014";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts || "\u2014";
  }
}

// ---------------------------------------------------------------------------
// Event type config
// ---------------------------------------------------------------------------

const EVENT_CONFIG = {
  creation: {
    icon: Add01Icon,
    label: "Created",
    dotBg: "bg-emerald-500/15",
    dotBorder: "border-emerald-500/40",
    dotIcon: "text-emerald-600 dark:text-emerald-400",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    spine: "bg-emerald-500/30",
  },
  exercise: {
    icon: PlayIcon,
    label: "Exercised",
    dotBg: "bg-blue-500/15",
    dotBorder: "border-blue-500/40",
    dotIcon: "text-blue-600 dark:text-blue-400",
    badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    spine: "bg-blue-500/30",
  },
  "exercise-consuming": {
    icon: PlayIcon,
    label: "Exercised (consuming)",
    dotBg: "bg-amber-500/15",
    dotBorder: "border-amber-500/40",
    dotIcon: "text-amber-600 dark:text-amber-400",
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    spine: "bg-amber-500/30",
  },
  archival: {
    icon: Delete01Icon,
    label: "Archived",
    dotBg: "bg-red-500/15",
    dotBorder: "border-red-500/40",
    dotIcon: "text-red-600 dark:text-red-400",
    badgeClass: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
    spine: "bg-red-500/30",
  },
} as const;

type EventConfigKey = keyof typeof EVENT_CONFIG;

// ---------------------------------------------------------------------------
// Timeline event card
// ---------------------------------------------------------------------------

interface TimelineCardProps {
  configKey: EventConfigKey;
  title: string;
  templateOrChoice: string;
  timestamp: string;
  offset: string;
  updateId: string;
  actingParties?: string[];
  isLast?: boolean;
  onNavigateTransaction?: (updateId: string) => void;
  children?: React.ReactNode;
}

function TimelineCard({
  configKey,
  title,
  templateOrChoice,
  timestamp,
  offset,
  updateId,
  actingParties,
  isLast,
  onNavigateTransaction,
  children,
}: TimelineCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = EVENT_CONFIG[configKey];

  return (
    <div className="relative flex gap-0">
      {/* Timeline spine column */}
      <div className="relative flex w-10 flex-shrink-0 flex-col items-center">
        {/* Dot */}
        <div
          className={cn(
            "z-10 flex size-10 items-center justify-center rounded-full border-2",
            config.dotBg,
            config.dotBorder
          )}
        >
          <HugeiconsIcon icon={config.icon} className={cn("size-4", config.dotIcon)} strokeWidth={2} />
        </div>
        {/* Spine below dot */}
        {!isLast && (
          <div className={cn("w-0.5 flex-1", config.spine)} />
        )}
      </div>

      {/* Card */}
      <div className={cn("ml-4 flex-1 pb-8", isLast && "pb-0")}>
        <div
          className={cn(
            "rounded-lg border bg-card shadow-sm transition-colors",
            expanded && "ring-1 ring-border"
          )}
        >
          {/* Card header -- always visible */}
          <button
            className="flex w-full items-start justify-between gap-3 p-4 text-left"
            onClick={() => setExpanded(!expanded)}
          >
            <div className="flex flex-1 flex-col gap-1.5">
              {/* Title row: badge + title */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-none",
                    config.badgeClass
                  )}
                >
                  {config.label}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {title}
                </span>
              </div>
              {/* Template / choice name */}
              <span className="truncate font-mono text-xs text-muted-foreground">
                {templateOrChoice}
              </span>
            </div>

            {/* Right side: timestamp + expand chevron */}
            <div className="flex flex-shrink-0 items-center gap-2">
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatTimestamp(timestamp)}
                </span>
                {offset && (
                  <span className="font-mono text-[10px] text-muted-foreground/70">
                    offset {offset}
                  </span>
                )}
              </div>
              <HugeiconsIcon
                icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
                className="size-4 text-muted-foreground"
                strokeWidth={2}
              />
            </div>
          </button>

          {/* Collapsed summary row: acting parties + tx link */}
          {!expanded && (
            <div className="flex flex-wrap items-center gap-3 border-t px-4 py-2.5">
              {/* Transaction link */}
              {updateId ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Tx
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {truncateId(updateId, 10)}
                  </span>
                  <CopyButton text={updateId} />
                  {onNavigateTransaction && (
                    <button
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateTransaction(updateId);
                      }}
                    >
                      <HugeiconsIcon icon={LinkSquare01Icon} className="size-3" strokeWidth={2} />
                      View
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground italic">
                  Transaction ID not available
                </span>
              )}

              {/* Separator dot */}
              {actingParties && actingParties.length > 0 && (
                <>
                  <span className="text-muted-foreground/40">|</span>
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    {actingParties.map((p) => (
                      <Badge key={p} variant="outline" className="max-w-full font-mono text-[10px]">
                        <span className="truncate">{p}</span>
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Expanded detail content */}
          {expanded && (
            <div className="border-t">
              {/* Transaction row */}
              <div className="flex flex-wrap items-center gap-3 bg-muted/30 px-4 py-3">
                {updateId ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Transaction
                    </span>
                    <span className="font-mono text-xs">{truncateId(updateId, 14)}</span>
                    <CopyButton text={updateId} />
                    {onNavigateTransaction && (
                      <Button
                        size="sm"
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateTransaction(updateId);
                        }}
                      >
                        <HugeiconsIcon icon={LinkSquare01Icon} data-icon="inline-start" strokeWidth={2} />
                        View Transaction
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    Transaction ID not available for this event
                  </span>
                )}

                {offset && (
                  <>
                    <span className="text-muted-foreground/40">|</span>
                    <span className="text-xs text-muted-foreground">
                      Offset: <span className="font-mono">{offset}</span>
                    </span>
                  </>
                )}
              </div>

              {/* Acting parties */}
              {actingParties && actingParties.length > 0 && (
                <div className="flex flex-col gap-1.5 px-4 py-3">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Acting Parties
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {actingParties.map((p) => (
                      <Badge key={p} variant="outline" className="max-w-full font-mono text-[10px]">
                        <span className="truncate">{p}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Event-specific content */}
              <div className="px-4 pb-4 pt-1">{children}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main timeline component
// ---------------------------------------------------------------------------

export interface LifecycleTimelineProps {
  lifecycle: ContractLifecycle;
  onNavigateTransaction?: (updateId: string) => void;
  onNavigateContract?: (contractId: string) => void;
}

export function LifecycleTimeline({
  lifecycle,
  onNavigateTransaction,
  onNavigateContract,
}: LifecycleTimelineProps) {
  const isArchived = !!lifecycle.archival;
  const totalEvents = 1 + lifecycle.exercises.length + (isArchived ? 1 : 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Contract summary header */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4 shadow-sm overflow-hidden">
        <Badge
          variant={isArchived ? "destructive" : "default"}
          className="shrink-0 text-xs"
        >
          {isArchived ? "Archived" : "Active"}
        </Badge>
        <span className="min-w-0 truncate font-mono text-sm text-muted-foreground">
          {formatTemplateId(lifecycle.templateId)}
        </span>
        <span className="text-muted-foreground/40">|</span>
        <span className="text-xs text-muted-foreground">
          {totalEvents} event{totalEvents !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Warnings */}
      {lifecycle.isPruned && (
        <div className="flex items-start gap-3 rounded-lg border border-muted-foreground/20 bg-muted/50 p-3">
          <HugeiconsIcon icon={Alert01Icon} className="mt-0.5 size-4 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
          <p className="text-xs text-muted-foreground">
            Historical data pruned before offset{" "}
            <span className="font-mono">{lifecycle.prunedBefore}</span>. Some
            events may be missing.
          </p>
        </div>
      )}

      {lifecycle.isDivulged && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <HugeiconsIcon icon={InformationCircleIcon} className="mt-0.5 size-4 flex-shrink-0 text-primary" strokeWidth={2} />
          <p className="text-xs text-primary/80">
            This contract was divulged to your party. Archival may not be
            communicated to you.
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="flex flex-col">
        {/* Creation */}
        <TimelineCard
          configKey="creation"
          title="Contract Created"
          templateOrChoice={formatTemplateId(lifecycle.templateId)}
          timestamp={lifecycle.creation.recordTime}
          offset={lifecycle.creation.offset}
          updateId={lifecycle.creation.updateId}
          onNavigateTransaction={onNavigateTransaction}
          isLast={totalEvents === 1}
        >
          <div className="flex flex-col gap-4">
            {/* Signatories / Observers */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Signatories
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {lifecycle.creation.signatories.map((p) => (
                    <Badge
                      key={p}
                      variant="outline"
                      className="max-w-full font-mono text-[10px]"
                    >
                      <span className="truncate">{p}</span>
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Observers
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {lifecycle.creation.observers.length === 0 ? (
                    <span className="text-xs text-muted-foreground">None</span>
                  ) : (
                    lifecycle.creation.observers.map((p) => (
                      <Badge
                        key={p}
                        variant="outline"
                        className="max-w-full font-mono text-[10px]"
                      >
                        <span className="truncate">{p}</span>
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Payload */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Payload
              </span>
              <div className="rounded-md border bg-muted/30 p-3">
                <JsonTree data={lifecycle.creation.payload} />
              </div>
            </div>
          </div>
        </TimelineCard>

        {/* Exercises */}
        {lifecycle.exercises.map((exercise, idx) => {
          const isLastEvent =
            !isArchived && idx === lifecycle.exercises.length - 1;
          const eKey: EventConfigKey = exercise.consuming
            ? "exercise-consuming"
            : "exercise";

          return (
            <TimelineCard
              key={`${exercise.updateId}-${idx}`}
              configKey={eKey}
              title={`Choice: ${exercise.choice}`}
              templateOrChoice={
                exercise.consuming
                  ? "Consuming exercise"
                  : "Non-consuming exercise"
              }
              timestamp={exercise.recordTime}
              offset={exercise.offset}
              updateId={exercise.updateId}
              actingParties={exercise.actingParties}
              onNavigateTransaction={onNavigateTransaction}
              isLast={isLastEvent}
            >
              <div className="flex flex-col gap-4">
                {/* Choice arguments */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Choice Arguments
                  </span>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <JsonTree data={exercise.choiceArgument} />
                  </div>
                </div>

                {/* Child contracts */}
                {exercise.childContractIds.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Child Contracts Created
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {exercise.childContractIds.map((childId) => (
                        <div key={childId} className="flex items-center gap-2">
                          <span className="font-mono text-xs">
                            {truncateId(childId, 12)}
                          </span>
                          <CopyButton text={childId} />
                          {onNavigateContract && (
                            <Button
                              size="sm"
                              variant="link"
                              className="h-auto p-0 text-xs"
                              onClick={() => onNavigateContract(childId)}
                            >
                              <HugeiconsIcon icon={LinkSquare01Icon} data-icon="inline-start" strokeWidth={2} />
                              View Lifecycle
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TimelineCard>
          );
        })}

        {/* Archival */}
        {lifecycle.archival && (
          <TimelineCard
            configKey="archival"
            title={`Archived via: ${lifecycle.archival.choice}`}
            templateOrChoice="Consuming exercise (contract archived)"
            timestamp={lifecycle.archival.recordTime}
            offset={lifecycle.archival.offset}
            updateId={lifecycle.archival.updateId}
            actingParties={lifecycle.archival.actingParties}
            onNavigateTransaction={onNavigateTransaction}
            isLast
          >
            <div className="flex flex-col gap-4">
              {/* Choice arguments */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Choice Arguments
                </span>
                <div className="rounded-md border bg-muted/30 p-3">
                  <JsonTree data={lifecycle.archival.choiceArgument} />
                </div>
              </div>

              {/* Child contracts */}
              {lifecycle.archival.childContractIds.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Child Contracts Created
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {lifecycle.archival.childContractIds.map((childId) => (
                      <div key={childId} className="flex items-center gap-2">
                        <span className="font-mono text-xs">
                          {truncateId(childId, 12)}
                        </span>
                        <CopyButton text={childId} />
                        {onNavigateContract && (
                          <Button
                            size="sm"
                            variant="link"
                            className="h-auto p-0 text-xs"
                            onClick={() => onNavigateContract(childId)}
                          >
                            <HugeiconsIcon icon={LinkSquare01Icon} data-icon="inline-start" strokeWidth={2} />
                            View Lifecycle
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TimelineCard>
        )}
      </div>
    </div>
  );
}
