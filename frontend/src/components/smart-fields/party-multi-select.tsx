import { useState, useRef, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/stores/connection-store";
import { truncateId } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Party Multi-Select
//
// A multi-select dropdown backed by the connection store's knownParties.
// Users can pick from the dropdown or type a custom party identifier.
// The component always allows free-form input so unknown parties can be added.
// ---------------------------------------------------------------------------

/** Stable empty array to avoid re-render loops with Zustand selectors. */
const EMPTY_PARTIES: string[] = [];

export interface PartyMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function PartyMultiSelect({
  value,
  onChange,
  placeholder = "Select parties...",
  className,
}: PartyMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [customParty, setCustomParty] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  const knownParties = useConnectionStore(
    (s) => s.bootstrap?.knownParties ?? EMPTY_PARTIES
  );

  const toggleParty = useCallback(
    (party: string) => {
      if (value.includes(party)) {
        onChange(value.filter((p) => p !== party));
      } else {
        onChange([...value, party]);
      }
    },
    [value, onChange]
  );

  const removeParty = useCallback(
    (party: string) => {
      onChange(value.filter((p) => p !== party));
    },
    [value, onChange]
  );

  const addCustomParty = useCallback(() => {
    const trimmed = customParty.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setCustomParty("");
  }, [customParty, value, onChange]);

  const handleCustomKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      addCustomParty();
    }
  };

  // Combine known parties with any custom parties already in the value
  const allParties = Array.from(
    new Set([...knownParties, ...value])
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`h-auto min-h-9 w-full justify-between font-normal ${className ?? ""}`}
        >
          <div className="flex flex-1 flex-wrap gap-1">
            {value.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                {placeholder}
              </span>
            ) : (
              value.map((party) => (
                <Badge
                  key={party}
                  variant="secondary"
                  className="gap-1 font-mono text-xs"
                >
                  {truncateId(party, 20)}
                  <button
                    className="ml-0.5 rounded-full outline-none hover:bg-muted-foreground/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeParty(party);
                    }}
                  >
                    <HugeiconsIcon
                      icon={Cancel01Icon}
                      className="size-3"
                      strokeWidth={2}
                    />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className="ml-2 size-4 shrink-0 opacity-50"
            strokeWidth={2}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search parties..." />
          <CommandList>
            <CommandEmpty>
              <span className="text-xs text-muted-foreground">
                No matching parties. Type below to add a custom party.
              </span>
            </CommandEmpty>
            <CommandGroup>
              {allParties.map((party) => (
                <CommandItem
                  key={party}
                  value={party}
                  onSelect={() => toggleParty(party)}
                >
                  <Checkbox
                    checked={value.includes(party)}
                    className="pointer-events-none"
                  />
                  <span className="truncate font-mono text-xs">
                    {truncateId(party, 30)}
                  </span>
                  {!knownParties.includes(party) && (
                    <Badge
                      variant="outline"
                      className="ml-auto text-[11px]"
                    >
                      custom
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {/* Free-form input for adding unknown parties */}
          <div className="border-t p-2">
            <div className="flex gap-1.5">
              <Input
                ref={customInputRef}
                className="h-7 flex-1 font-mono text-xs"
                placeholder="Add custom party..."
                value={customParty}
                onChange={(e) => setCustomParty(e.target.value)}
                onKeyDown={handleCustomKeyDown}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={!customParty.trim()}
                onClick={addCustomParty}
              >
                Add
              </Button>
            </div>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
