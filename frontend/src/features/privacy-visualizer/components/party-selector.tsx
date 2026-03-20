import { HugeiconsIcon } from "@hugeicons/react";
import { UserGroupIcon, CheckmarkSquareIcon, Square01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PartyColor } from "../hooks";

// ---------------------------------------------------------------------------
// Party Selector
// ---------------------------------------------------------------------------

export interface PartySelectorProps {
  parties: string[];
  partyColors: Record<string, PartyColor>;
  selectedParties: Set<string>;
  highlightedParty: string | null;
  onToggleParty: (party: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onHighlightParty: (party: string | null) => void;
}

export function PartySelector({
  parties,
  partyColors,
  selectedParties,
  highlightedParty,
  onToggleParty,
  onSelectAll,
  onSelectNone,
  onHighlightParty,
}: PartySelectorProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} className="size-4 text-muted-foreground" />
          <span>Parties</span>
          <span className="text-xs text-muted-foreground">
            ({selectedParties.size}/{parties.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onSelectAll}
          >
            Select All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onSelectNone}
          >
            None
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {parties.map((party) => {
          const color = partyColors[party];
          const isSelected = selectedParties.has(party);
          const isHighlighted = highlightedParty === party;

          return (
            <div
              key={party}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                isHighlighted && "bg-accent"
              )}
            >
              {/* Checkbox */}
              <button
                onClick={() => onToggleParty(party)}
                className="flex-shrink-0"
                role="checkbox"
                aria-checked={isSelected}
                aria-label={`Toggle visibility for ${party}`}
              >
                {isSelected ? (
                  <HugeiconsIcon icon={CheckmarkSquareIcon} strokeWidth={2} className={cn("size-4", color?.text)} />
                ) : (
                  <HugeiconsIcon icon={Square01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
                )}
              </button>

              {/* Color dot */}
              <div
                className={cn(
                  "size-2.5 flex-shrink-0 rounded-full",
                  color?.bg,
                  !isSelected && "opacity-30"
                )}
              />

              {/* Party name */}
              <button
                className={cn(
                  "min-w-0 flex-1 truncate text-left font-mono text-xs transition-opacity",
                  !isSelected && "opacity-40"
                )}
                onClick={() =>
                  onHighlightParty(isHighlighted ? null : party)
                }
                title={`Click to ${isHighlighted ? "unhighlight" : "highlight"} ${party}`}
                aria-label={`${isHighlighted ? "Unhighlight" : "Highlight"} ${party}'s view`}
              >
                {party}
              </button>
            </div>
          );
        })}
      </div>

      {highlightedParty && (
        <div className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
          Highlighting view for{" "}
          <span className="font-mono font-medium">{highlightedParty}</span>.
          Click the party name again to unhighlight.
        </div>
      )}
    </div>
  );
}
