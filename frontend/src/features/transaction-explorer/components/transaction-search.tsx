import { useState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
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
import { Spinner } from "@/components/ui/spinner";
import { truncateId } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { RecentTransaction } from "../hooks";

// ---------------------------------------------------------------------------
// Event type badge color mapping
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface TransactionSearchProps {
  currentUpdateId: string | null;
  recentTransactions: RecentTransaction[];
  isLoading: boolean;
  onSelect: (updateId: string) => void;
}

export function TransactionSearch({
  currentUpdateId,
  recentTransactions,
  isLoading,
  onSelect,
}: TransactionSearchProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Sync display when currentUpdateId changes externally (e.g. route navigation)
  useEffect(() => {
    if (currentUpdateId !== null) {
      setInputValue("");
    }
  }, [currentUpdateId]);

  const handleSelect = (updateId: string) => {
    onSelect(updateId);
    setOpen(false);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Allow submitting a typed update ID with Enter when no item is highlighted
    if (e.key === "Enter" && inputValue.trim()) {
      // Check if the input looks like an explicit ID (not matching any dropdown item text)
      const trimmed = inputValue.trim();
      const isExactMatch = recentTransactions.some(
        (tx) => tx.updateId === trimmed
      );
      if (!isExactMatch) {
        // User typed a custom update ID -- submit it directly
        handleSelect(trimmed);
        e.preventDefault();
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
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
            {currentUpdateId ? (
              <span className="font-mono text-sm">
                {truncateId(currentUpdateId, 24)}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Select a transaction...
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

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by Update ID..."
            value={inputValue}
            onValueChange={setInputValue}
            onKeyDown={handleKeyDown}
          />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              {inputValue.trim()
                ? "Press Enter to search this Update ID"
                : "No recent transactions"}
            </CommandEmpty>

            {recentTransactions.length > 0 && (
              <CommandGroup heading="Recent Transactions">
                {recentTransactions
                  .filter(
                    (tx) =>
                      !inputValue.trim() ||
                      tx.updateId
                        .toLowerCase()
                        .includes(inputValue.trim().toLowerCase()) ||
                      tx.offset.includes(inputValue.trim())
                  )
                  .map((tx) => (
                    <CommandItem
                      key={tx.updateId}
                      value={tx.updateId}
                      onSelect={() => handleSelect(tx.updateId)}
                      className="flex items-center gap-2"
                    >
                      {/* Offset number */}
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        #{tx.offset}
                      </span>

                      {/* Event type badge(s) */}
                      {tx.eventTypes.slice(0, 1).map((et) => (
                        <Badge
                          key={et}
                          variant={eventTypeBadgeVariant(et)}
                          className="shrink-0 text-[10px]"
                        >
                          {et}
                        </Badge>
                      ))}

                      {/* Truncated Update ID */}
                      <span className="min-w-0 truncate font-mono text-xs">
                        {truncateId(tx.updateId, 16)}
                      </span>

                      {/* Relative time */}
                      {tx.recordTime && (
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(tx.recordTime), {
                            addSuffix: true,
                          })}
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
  );
}
