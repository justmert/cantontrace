import { HugeiconsIcon } from "@hugeicons/react";
import { FilterIcon, InformationCircleIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EventStreamFilter, TemplateId } from "@/lib/types";

// ---------------------------------------------------------------------------
// Event type definitions for checkboxes
// ---------------------------------------------------------------------------

const EVENT_TYPES = [
  { id: "created", label: "Create", color: "bg-primary" },
  { id: "archived", label: "Archive", color: "bg-destructive" },
  { id: "exercised", label: "Exercise", color: "bg-accent-foreground" },
  { id: "assigned", label: "Reassign", color: "bg-secondary-foreground" },
  { id: "topology", label: "Topology", color: "bg-muted-foreground" },
  { id: "checkpoint", label: "Checkpoint", color: "bg-muted-foreground/50" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function templateIdToKey(t: TemplateId): string {
  return `${t.packageName}:${t.moduleName}:${t.entityName}`;
}

function keyToTemplateId(key: string): TemplateId {
  const [packageName, moduleName, entityName] = key.split(":");
  return { packageName, moduleName, entityName };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface EventFilterProps {
  filter: EventStreamFilter;
  templates: TemplateId[];
  parties: string[];
  onSetTemplates: (templates: EventStreamFilter["templates"]) => void;
  onSetEventTypes: (types: string[]) => void;
  onSetParties: (parties: string[]) => void;
  onSetTransactionShape: (
    shape: EventStreamFilter["transactionShape"]
  ) => void;
  onApply: () => void;
  onReset: () => void;
}

export function EventFilter({
  filter,
  templates,
  parties,
  onSetTemplates,
  onSetEventTypes,
  onSetParties,
  onSetTransactionShape,
  onApply,
  onReset,
}: EventFilterProps) {
  const selectedTypes = new Set(filter.eventTypes ?? []);
  const selectedParty = filter.parties?.[0] ?? "__all__";
  const selectedTemplate =
    filter.templates && filter.templates.length > 0
      ? templateIdToKey(filter.templates[0])
      : "__all__";

  const toggleEventType = (type: string) => {
    const next = new Set(selectedTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    onSetEventTypes(Array.from(next));
  };

  const hasActiveFilters =
    (filter.eventTypes && filter.eventTypes.length > 0) ||
    (filter.parties && filter.parties.length > 0) ||
    (filter.templates && filter.templates.length > 0);

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <HugeiconsIcon icon={FilterIcon} strokeWidth={2} className="size-4" />
        <span>Event Filters</span>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        {/* Template filter */}
        <div className="flex min-w-[180px] flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Template
          </label>
          <Select
            value={selectedTemplate}
            onValueChange={(v) =>
              onSetTemplates(
                v === "__all__" ? undefined : [keyToTemplateId(v)]
              )
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All templates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All templates</SelectItem>
              {templates.map((t) => {
                const key = templateIdToKey(t);
                return (
                  <SelectItem key={key} value={key}>
                    <span className="font-mono text-xs">
                      {t.moduleName}:{t.entityName}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Party filter */}
        <div className="flex min-w-[160px] flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Party
          </label>
          <Select
            value={selectedParty}
            onValueChange={(v) =>
              onSetParties(v === "__all__" ? [] : [v])
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All parties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All parties</SelectItem>
              {parties.map((party) => (
                <SelectItem key={party} value={party}>
                  <span className="font-mono text-xs">{party}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Event type checkboxes */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Event Types
          </label>
          <div className="flex items-center gap-1.5">
            {EVENT_TYPES.map((et) => {
              const isActive =
                selectedTypes.size === 0 || selectedTypes.has(et.id);
              return (
                <button
                  key={et.id}
                  onClick={() => toggleEventType(et.id)}
                  aria-label={`Toggle ${et.label} events`}
                  aria-pressed={isActive}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                    isActive
                      ? "border-border bg-secondary font-medium text-secondary-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "size-1.5 rounded-full",
                      isActive ? et.color : "bg-muted-foreground"
                    )}
                  />
                  {et.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Transaction shape toggle */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              Shape
            </label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px]">
                  <p className="text-xs">
                    <strong>ACS_DELTA</strong>: Shows net contract
                    creates/archives per transaction.
                  </p>
                  <p className="mt-1 text-xs">
                    <strong>LEDGER_EFFECTS</strong>: Shows the full
                    exercise tree including intermediate events.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex rounded-md border bg-muted p-0.5">
            <button
              className={cn(
                "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
                filter.transactionShape === "ACS_DELTA"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={filter.transactionShape === "ACS_DELTA"}
              onClick={() => onSetTransactionShape("ACS_DELTA")}
            >
              ACS_DELTA
            </button>
            <button
              className={cn(
                "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
                filter.transactionShape === "LEDGER_EFFECTS"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={filter.transactionShape === "LEDGER_EFFECTS"}
              onClick={() => onSetTransactionShape("LEDGER_EFFECTS")}
            >
              LEDGER_EFFECTS
            </button>
          </div>
        </div>

        {/* Reset filters */}
        {hasActiveFilters && (
          <Button size="sm" variant="ghost" onClick={onReset} className="h-9">
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} data-icon="inline-start" />
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
