import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { truncateId, formatTemplateId } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { TemplateId } from "@/lib/types";

// ---------------------------------------------------------------------------
// Contract ID Combobox
//
// A text input with ACS-backed autocomplete suggestions. The user can still
// type a contract ID freely (free-form), but gets a dropdown of matching
// contracts from the active contract set when the query is long enough.
// ---------------------------------------------------------------------------

export interface ContractIdComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Optional template filter to scope suggestions to a specific template */
  templateFilter?: TemplateId[];
  placeholder?: string;
  className?: string;
}

export function ContractIdCombobox({
  value,
  onChange,
  templateFilter,
  placeholder = "Select or type a contract ID...",
  className,
}: ContractIdComboboxProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  // Fetch contracts from ACS, filtered by template if provided
  const { data: acsData } = useQuery({
    queryKey: ["acs-combobox", templateFilter],
    queryFn: () =>
      api
        .getACS({
          pageSize: 100,
          templateFilter:
            templateFilter && templateFilter.length > 0
              ? templateFilter
              : undefined,
        })
        .then((r) => r.data),
    enabled: query.length >= 1 || open,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // Client-side filter by query text
  const suggestions = (acsData?.contracts ?? []).filter(
    (c) =>
      !query ||
      c.contractId.toLowerCase().includes(query.toLowerCase()) ||
      c.templateId.entityName.toLowerCase().includes(query.toLowerCase()) ||
      Object.values(c.payload)
        .slice(0, 4)
        .some(
          (v) =>
            typeof v === "string" &&
            v.toLowerCase().includes(query.toLowerCase())
        )
  );

  // Sync external value changes into local query
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Reset highlight when suggestions change
  useEffect(() => {
    setHighlightIndex(-1);
  }, [suggestions.length]);

  const handleSelect = useCallback(
    (contractId: string) => {
      onChange(contractId);
      setQuery(contractId);
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
      handleSelect(suggestions[highlightIndex].contractId);
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative">
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
          // Delay close so click on suggestion registers
          setTimeout(() => setOpen(false), 200);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border bg-popover shadow-lg">
          {suggestions.map((c, idx) => {
            // Build a sublabel from the first 2 payload fields
            const sublabel = Object.entries(c.payload)
              .slice(0, 2)
              .map(
                ([k, v]) =>
                  `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`
              )
              .join(", ");

            return (
              <button
                key={c.contractId}
                className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs hover:bg-accent ${
                  idx === highlightIndex ? "bg-accent" : ""
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(c.contractId);
                }}
                onMouseEnter={() => setHighlightIndex(idx)}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono">
                    {truncateId(c.contractId, 24)}
                  </span>
                  <Badge
                    variant="outline"
                    className="ml-auto flex-shrink-0 text-[9px]"
                  >
                    {formatTemplateId(c.templateId)}
                  </Badge>
                </div>
                {sublabel && (
                  <span className="truncate text-[10px] text-muted-foreground">
                    {sublabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
