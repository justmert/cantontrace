import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { truncateId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Update ID Combobox
//
// A text input with autocomplete for recent transaction update IDs.
// Fetches recent successful completions and lets the user search/pick one.
// Also accepts free-form input so unknown update IDs can be typed.
// ---------------------------------------------------------------------------

export interface UpdateIdComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function UpdateIdCombobox({
  value,
  onChange,
  placeholder = "Select or type an update ID...",
  className,
}: UpdateIdComboboxProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  // Fetch recent successful completions that have an updateId
  const { data: completions } = useQuery({
    queryKey: ["completions-for-combobox"],
    queryFn: () =>
      api
        .getCompletions({ status: "succeeded", pageSize: 50 })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  // Filter to completions with updateId, then filter by query text
  const suggestions = (completions ?? [])
    .filter((c) => !!c.updateId)
    .filter(
      (c) =>
        !query ||
        c.updateId!.toLowerCase().includes(query.toLowerCase()) ||
        (c.commandId ?? "").toLowerCase().includes(query.toLowerCase()) ||
        c.actAs.some((p) => p.toLowerCase().includes(query.toLowerCase()))
    )
    .slice(0, 30);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [suggestions.length]);

  const handleSelect = useCallback(
    (updateId: string) => {
      onChange(updateId);
      setQuery(updateId);
      setOpen(false);
      setHighlightIndex(-1);
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightIndex].updateId!);
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightIndex(-1);
    }
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        className={`font-mono text-xs ${className ?? ""}`}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          onChange(v);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 200);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border bg-popover shadow-lg">
          {suggestions.map((c, idx) => (
            <button
              key={c.updateId}
              className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs hover:bg-accent ${
                idx === highlightIndex ? "bg-accent" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(c.updateId!);
              }}
              onMouseEnter={() => setHighlightIndex(idx)}
            >
              <div className="flex items-center gap-2">
                <span className="truncate font-mono">
                  {truncateId(c.updateId!, 28)}
                </span>
                <Badge
                  variant="outline"
                  className="ml-auto flex-shrink-0 text-[9px]"
                >
                  {c.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {c.commandId && (
                  <span className="truncate">cmd: {truncateId(c.commandId, 16)}</span>
                )}
                {c.actAs.length > 0 && (
                  <span className="truncate">
                    parties: {c.actAs.map((p) => truncateId(p, 12)).join(", ")}
                  </span>
                )}
                <span className="ml-auto flex-shrink-0">
                  {new Date(c.recordTime).toLocaleTimeString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
