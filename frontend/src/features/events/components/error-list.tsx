import { useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  Refresh01Icon,
  Search01Icon,
  Cancel01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Calendar01Icon,
} from "@hugeicons/core-free-icons";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { cn, truncateId, formatPartyDisplay } from "@/lib/utils";
import type { ErrorCategory } from "@/lib/types";
import { ErrorCategoryBadge } from "./error-category-badge";
import { ErrorDetail } from "./error-detail";
import { useCompletions, type CompletionFilter } from "../hooks";

// ---------------------------------------------------------------------------
// All error categories for the filter dropdown
// ---------------------------------------------------------------------------

const ALL_CATEGORIES: ErrorCategory[] = [
  "InvalidIndependentOfSystemState",
  "AuthInterceptorInvalidAuthenticationCredentials",
  "InvalidGivenCurrentSystemStateOther",
  "InvalidGivenCurrentSystemStateResourceMissing",
  "InvalidGivenCurrentSystemStateResourceExists",
  "ContentionOnSharedResources",
  "DeadlineExceededRequestStateUnknown",
  "TransientServerFailure",
  "SystemInternalAssumptionViolated",
  "MaliciousOrFaultyBehaviour",
  "InternalUnsupportedOperation",
];

// ---------------------------------------------------------------------------
// Skeleton rows
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <Skeleton className="h-4 w-32" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-36" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-full" />
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Date picker field (Calendar + Popover, theme-compatible)
// ---------------------------------------------------------------------------

function DatePickerField({
  value,
  onChange,
  placeholder,
}: {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [timeValue, setTimeValue] = useState(() => {
    if (value) {
      return format(value, "HH:mm");
    }
    return "00:00";
  });

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) {
      onChange(undefined);
      setOpen(false);
      return;
    }
    // Preserve time when changing date
    const [hours, minutes] = timeValue.split(":").map(Number);
    const combined = new Date(day);
    combined.setHours(hours, minutes, 0, 0);
    onChange(combined);
    setOpen(false);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setTimeValue(newTime);
    if (value) {
      const [hours, minutes] = newTime.split(":").map(Number);
      const updated = new Date(value);
      updated.setHours(hours, minutes, 0, 0);
      onChange(updated);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 w-[170px] justify-start gap-2 text-left font-normal",
            !value && "text-muted-foreground"
          )}
        >
          <HugeiconsIcon
            icon={Calendar01Icon}
            strokeWidth={2}
            className="size-3.5 shrink-0"
          />
          <span className="truncate text-xs">
            {value ? format(value, "MMM d, yyyy HH:mm") : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleDateSelect}
            initialFocus
          />
          <div className="border-t px-3 py-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Time
              <Input
                type="time"
                value={timeValue}
                onChange={handleTimeChange}
                className="h-7 w-[100px] text-xs"
              />
            </label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Error List component (full-width, inline expandable detail)
// ---------------------------------------------------------------------------

export function ErrorList() {
  const [filter, setFilter] = useState<CompletionFilter>({});
  const [categoryFilter, setCategoryFilter] = useState<string>("__all__");
  const [partyFilter, setPartyFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data: completions,
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useCompletions(filter);

  const applyFilters = useCallback(() => {
    setFilter({
      category:
        categoryFilter !== "__all__"
          ? (categoryFilter as ErrorCategory)
          : undefined,
      party: partyFilter || undefined,
      dateFrom: dateFrom ? dateFrom.toISOString() : undefined,
      dateTo: dateTo ? dateTo.toISOString() : undefined,
    });
  }, [categoryFilter, partyFilter, dateFrom, dateTo]);

  const clearFilters = useCallback(() => {
    setCategoryFilter("__all__");
    setPartyFilter("");
    setDateFrom(undefined);
    setDateTo(undefined);
    setFilter({});
  }, []);

  const hasActiveFilters =
    categoryFilter !== "__all__" || partyFilter || dateFrom || dateTo;

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return ts;
    }
  };

  const toggleExpanded = (commandId: string) => {
    setExpandedId((prev) => (prev === commandId ? null : commandId));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Compact filter bar */}
      <div className="flex flex-wrap items-end gap-2">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {ALL_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                <span className="text-xs">{cat}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2}
          />
          <Input
            className="h-8 w-[180px] pl-8 font-mono text-xs"
            placeholder="Filter by party..."
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters();
            }}
          />
        </div>

        <DatePickerField
          value={dateFrom}
          onChange={setDateFrom}
          placeholder="From date"
        />

        <DatePickerField
          value={dateTo}
          onChange={setDateTo}
          placeholder="To date"
        />

        <Button size="sm" className="h-8" onClick={applyFilters} disabled={isLoading}>
          Apply
        </Button>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={clearFilters}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            Clear
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {completions && (
            <Badge variant="secondary" className="font-mono text-xs">
              {completions.length} error{completions.length !== 1 ? "s" : ""}
            </Badge>
          )}
          <Button
            size="sm"
            className="h-8"
            variant="outline"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <HugeiconsIcon
              icon={Refresh01Icon}
              className={cn(isRefetching && "animate-spin")}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error state */}
      {!isLoading && isError ? (
        <Empty className="py-20">
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Failed to load errors</EmptyTitle>
            <EmptyDescription>
              Could not fetch completions from the server. Check your connection
              and try again.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <HugeiconsIcon
              icon={Refresh01Icon}
              data-icon="inline-start"
              strokeWidth={2}
            />
            Retry
          </Button>
        </Empty>
      ) : !isLoading && (!completions || completions.length === 0) ? (
        <Empty className="py-20">
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No errors detected</EmptyTitle>
            <EmptyDescription>
              {hasActiveFilters
                ? "No failed commands match the current filters."
                : "Your commands are all succeeding. Errors will appear here when they occur."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Timestamp</TableHead>
                <TableHead>Command ID</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Acting Party</TableHead>
                <TableHead>Error Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))
                : completions?.flatMap((c) => {
                    const isExpanded = expandedId === c.commandId;
                    const rows = [
                      <TableRow
                        key={c.commandId}
                        className={cn(
                          "cursor-pointer transition-colors",
                          isExpanded
                            ? "bg-muted/50"
                            : "hover:bg-muted/30"
                        )}
                        onClick={() => toggleExpanded(c.commandId)}
                      >
                        <TableCell className="w-10 px-3">
                          {isExpanded ? (
                            <HugeiconsIcon
                              icon={ArrowUp01Icon}
                              className="size-4 text-muted-foreground"
                              strokeWidth={2}
                            />
                          ) : (
                            <HugeiconsIcon
                              icon={ArrowDown01Icon}
                              className="size-4 text-muted-foreground"
                              strokeWidth={2}
                            />
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatTimestamp(c.recordTime)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">
                            {truncateId(c.commandId, 8)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {c.error?.categoryId && (
                            <ErrorCategoryBadge
                              category={c.error.categoryId}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {c.error?.resourceInfo ? (
                            <span className="text-xs">
                              {c.error.resourceInfo.resourceType}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              --
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5 overflow-hidden">
                            {c.actAs.map((p) => (
                              <span
                                key={p}
                                className="block truncate font-mono text-xs"
                                title={p}
                              >
                                {formatPartyDisplay(p)}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <p className="truncate text-xs text-muted-foreground">
                            {c.error?.message ?? "Unknown error"}
                          </p>
                        </TableCell>
                      </TableRow>,
                    ];
                    if (isExpanded) {
                      rows.push(
                        <TableRow key={`${c.commandId}-detail`}>
                          <TableCell colSpan={7} className="p-0">
                            <div className="border-t bg-card px-6 py-5">
                              <ErrorDetail completion={c} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    return rows;
                  })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
