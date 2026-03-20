import { useState, useEffect, useRef, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  ArrowDown01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { truncateId } from "@/lib/utils";

export interface TransactionSearchProps {
  currentUpdateId: string | null;
  recentUpdateIds: string[];
  isLoading: boolean;
  onSearch: (updateId: string) => void;
  onBrowseLatest: () => void;
}

export function TransactionSearch({
  currentUpdateId,
  recentUpdateIds,
  isLoading,
  onSearch,
  onBrowseLatest,
}: TransactionSearchProps) {
  const [inputValue, setInputValue] = useState(currentUpdateId ?? "");
  const [showRecent, setShowRecent] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync input when currentUpdateId changes externally (Browse Latest, route)
  useEffect(() => {
    if (currentUpdateId !== null) {
      setInputValue(currentUpdateId);
    }
  }, [currentUpdateId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showRecent) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowRecent(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showRecent]);

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      onSearch(trimmed);
      setShowRecent(false);
    }
  }, [inputValue, onSearch]);

  return (
    <div className="relative flex items-center gap-2">
      {/* Search input */}
      <div className="relative flex-1">
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Enter Update ID to inspect..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          className="h-10 pl-9 font-mono text-sm"
        />
      </div>

      <Button onClick={handleSubmit} disabled={isLoading || !inputValue.trim()}>
        {isLoading ? "Loading..." : "Search"}
      </Button>

      {/* Recent transactions dropdown */}
      <div className="relative" ref={dropdownRef}>
        <Button
          variant="outline"
          onClick={() => setShowRecent(!showRecent)}
          disabled={recentUpdateIds.length === 0}
        >
          <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} data-icon="inline-start" />
          Recent
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} data-icon="inline-end" />
        </Button>

        {showRecent && recentUpdateIds.length > 0 && (
          <div className="absolute right-0 top-full z-50 mt-1 max-h-80 w-80 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
            {recentUpdateIds.map((uid) => (
              <button
                key={uid}
                className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-xs hover:bg-accent"
                onClick={() => {
                  onSearch(uid);
                  setShowRecent(false);
                }}
              >
                <span className="font-mono">{truncateId(uid, 16)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Browse latest */}
      <Button variant="outline" onClick={onBrowseLatest}>
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} data-icon="inline-start" />
        Browse Latest
      </Button>
    </div>
  );
}
