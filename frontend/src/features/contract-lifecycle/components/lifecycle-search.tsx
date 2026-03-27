import { useState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
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

// ---------------------------------------------------------------------------
// Recent contracts storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = "cantontrace:recent-contracts";
const MAX_RECENT = 10;

function getRecentContracts(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRecentContract(contractId: string) {
  const recent = getRecentContracts().filter((id) => id !== contractId);
  recent.unshift(contractId);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(recent.slice(0, MAX_RECENT))
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface LifecycleSearchProps {
  contractId: string;
  onSearch: (contractId: string) => void;
  isLoading?: boolean;
}

export function LifecycleSearch({
  contractId: currentContractId,
  onSearch,
  isLoading,
}: LifecycleSearchProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [recentContracts, setRecentContracts] = useState<string[]>([]);

  useEffect(() => {
    setRecentContracts(getRecentContracts());
  }, []);

  const handleSelect = (contractId: string) => {
    const trimmed = contractId.trim();
    if (trimmed) {
      addRecentContract(trimmed);
      setRecentContracts(getRecentContracts());
      onSearch(trimmed);
      setOpen(false);
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && inputValue.trim()) {
      // Always fire handleSelect directly on Enter — don't rely on cmdk's
      // internal item-select dispatch, which can silently fail when
      // shouldFilter={false} and the highlighted item state is stale.
      e.preventDefault();
      handleSelect(inputValue.trim());
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <HugeiconsIcon
          icon={Search01Icon}
          className="size-4"
          strokeWidth={2}
        />
        <span>Contract Lifecycle Search</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Contract ID
        </label>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="h-9 w-full justify-between px-3 font-normal"
            >
              <div className="flex items-center gap-2 truncate">
                {isLoading ? (
                  <Spinner className="size-3.5 shrink-0" />
                ) : (
                  <HugeiconsIcon
                    icon={Search01Icon}
                    strokeWidth={2}
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                )}
                {currentContractId ? (
                  <span className="font-mono text-xs">
                    {truncateId(currentContractId, 24)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Enter contract ID...
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
                placeholder="Search by Contract ID..."
                value={inputValue}
                onValueChange={setInputValue}
                onKeyDown={handleKeyDown}
              />
              <CommandList>
                <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                  {inputValue.trim()
                    ? "Press Enter to search this Contract ID"
                    : "No recent contracts"}
                </CommandEmpty>

                {recentContracts.length > 0 && (
                  <CommandGroup heading="Recent Contracts">
                    {recentContracts
                      .filter(
                        (id) =>
                          !inputValue.trim() ||
                          id
                            .toLowerCase()
                            .includes(inputValue.trim().toLowerCase())
                      )
                      .map((id) => (
                        <CommandItem
                          key={id}
                          value={id}
                          onSelect={() => handleSelect(id)}
                          className="flex items-center gap-2"
                        >
                          <span className="min-w-0 truncate font-mono text-xs">
                            {truncateId(id, 24)}
                          </span>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
