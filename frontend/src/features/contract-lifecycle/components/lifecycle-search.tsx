import { useState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Clock01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
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

function clearRecentContracts() {
  localStorage.removeItem(STORAGE_KEY);
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
  contractId: initialContractId,
  onSearch,
  isLoading,
}: LifecycleSearchProps) {
  const [inputValue, setInputValue] = useState(initialContractId);
  const [recentContracts, setRecentContracts] = useState<string[]>([]);

  useEffect(() => {
    setRecentContracts(getRecentContracts());
  }, []);

  useEffect(() => {
    setInputValue(initialContractId);
  }, [initialContractId]);

  const handleSearch = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      addRecentContract(trimmed);
      setRecentContracts(getRecentContracts());
      onSearch(trimmed);
    }
  };

  const handleSelectRecent = (id: string) => {
    setInputValue(id);
    addRecentContract(id);
    setRecentContracts(getRecentContracts());
    onSearch(id);
  };

  const handleClearRecent = () => {
    clearRecentContracts();
    setRecentContracts([]);
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <HugeiconsIcon icon={Search01Icon} className="size-4" strokeWidth={2} />
        <span>Contract Lifecycle Search</span>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Contract ID
          </label>
          <div className="relative">
            <HugeiconsIcon icon={Search01Icon} className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
            <Input
              className="h-9 pl-8 pr-10 font-mono text-xs"
              placeholder="Enter contract ID..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
            {inputValue && (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                onClick={() => setInputValue("")}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5 text-muted-foreground hover:text-foreground" strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        {/* Recent contracts dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <HugeiconsIcon icon={Clock01Icon} data-icon="inline-start" strokeWidth={2} />
              Recent
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Recent Contracts</span>
              {recentContracts.length > 0 && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleClearRecent}
                >
                  Clear
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {recentContracts.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                No recent contracts
              </div>
            ) : (
              recentContracts.map((id) => (
                <DropdownMenuItem
                  key={id}
                  className="cursor-pointer font-mono text-xs"
                  onClick={() => handleSelectRecent(id)}
                >
                  {truncateId(id, 16)}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="sm"
          onClick={handleSearch}
          disabled={!inputValue.trim() || isLoading}
          className="h-9"
        >
          {isLoading ? (
            <Spinner className="size-3.5" data-icon="inline-start" />
          ) : (
            <HugeiconsIcon icon={Search01Icon} data-icon="inline-start" strokeWidth={2} />
          )}
          Search
        </Button>
      </div>
    </div>
  );
}
