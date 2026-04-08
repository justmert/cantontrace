import { useState, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUpDownIcon,
  Search01Icon,
  FilterHorizontalIcon,
  Cancel01Icon,
  Loading03Icon,
  ArrowDataTransferHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { truncateId } from "@/lib/utils";
import type { Reassignment } from "@/lib/types";
import type { ReassignmentFilter } from "../hooks";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  Reassignment["status"],
  { label: string; className: string; animated?: boolean }
> = {
  unassigned: {
    label: "Unassigned",
    className:
      "border-secondary-foreground/50 bg-secondary/10 text-secondary-foreground",
  },
  in_flight: {
    label: "In Flight",
    className:
      "border-accent-foreground/50 bg-accent/10 text-accent-foreground",
    animated: true,
  },
  assigned: {
    label: "Assigned",
    className:
      "border-primary/50 bg-primary/10 text-primary",
  },
  failed: {
    label: "Failed",
    className: "border-destructive/50 bg-destructive/10 text-destructive",
  },
};

function StatusBadge({ status }: { status: Reassignment["status"] }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge
      variant="outline"
      className={cn("flex items-center gap-1 text-xs", config.className)}
    >
      {config.animated && (
        <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-2.5 animate-spin" />
      )}
      {config.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Sortable column header
// ---------------------------------------------------------------------------

type SortField =
  | "contractId"
  | "template"
  | "source"
  | "target"
  | "status"
  | "startedAt"
  | "completedAt"
  | "latency";
type SortDir = "asc" | "desc";

function SortableHead({
  label,
  field,
  currentSort,
  onSort,
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentDir?: SortDir;
  onSort: (field: SortField) => void;
}) {
  const isActive = currentSort === field;
  return (
    <TableHead>
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(field)}
      >
        {label}
        <HugeiconsIcon
          icon={ArrowUpDownIcon}
          strokeWidth={2}
          className={cn(
            "size-3",
            isActive ? "text-foreground" : "text-muted-foreground/50"
          )}
        />
      </button>
    </TableHead>
  );
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <TableRow>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface ReassignmentListProps {
  reassignments: Reassignment[] | undefined;
  isLoading: boolean;
  filter: ReassignmentFilter;
  onFilterChange: (filter: ReassignmentFilter) => void;
  selectedReassignmentId: string | null;
  onSelect: (reassignment: Reassignment) => void;
}

export function ReassignmentList({
  reassignments,
  isLoading,
  filter,
  onFilterChange,
  selectedReassignmentId,
  onSelect,
}: ReassignmentListProps) {
  const [sortField, setSortField] = useState<SortField>("startedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    if (!reassignments) return [];
    const arr = [...reassignments];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "contractId":
          cmp = a.contractId.localeCompare(b.contractId);
          break;
        case "template":
          cmp = a.templateId.entityName.localeCompare(b.templateId.entityName);
          break;
        case "source":
          cmp = a.sourceSynchronizer.localeCompare(b.sourceSynchronizer);
          break;
        case "target":
          cmp = a.targetSynchronizer.localeCompare(b.targetSynchronizer);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "startedAt":
          cmp = (a.unassignedAt ?? "").localeCompare(b.unassignedAt ?? "");
          break;
        case "completedAt":
          cmp = (a.assignedAt ?? "").localeCompare(b.assignedAt ?? "");
          break;
        case "latency":
          cmp = (a.latencyMs ?? 0) - (b.latencyMs ?? 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [reassignments, sortField, sortDir]);

  const hasFilters =
    !!filter.status || !!filter.synchronizer || !!filter.templateName;

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <HugeiconsIcon icon={FilterHorizontalIcon} strokeWidth={2} className="size-4" />
          <span>Filters</span>
          {reassignments && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {reassignments.length} reassignment
              {reassignments.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {/* Status filter */}
          <div className="flex min-w-[150px] flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Status
            </label>
            <Select
              value={filter.status ?? "__all__"}
              onValueChange={(v) =>
                onFilterChange({
                  ...filter,
                  status:
                    v === "__all__"
                      ? undefined
                      : (v as Reassignment["status"]),
                })
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <SelectItem value="in_flight">In Flight</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Synchronizer filter */}
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Synchronizer
            </label>
            <div className="relative">
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-8 font-mono text-xs"
                placeholder="Filter by synchronizer ID..."
                value={filter.synchronizer ?? ""}
                onChange={(e) =>
                  onFilterChange({
                    ...filter,
                    synchronizer: e.target.value || undefined,
                  })
                }
              />
            </div>
          </div>

          {/* Template filter */}
          <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Template
            </label>
            <Input
              className="h-9 text-xs"
              placeholder="Filter by template name..."
              value={filter.templateName ?? ""}
              onChange={(e) =>
                onFilterChange({
                  ...filter,
                  templateName: e.target.value || undefined,
                })
              }
            />
          </div>

          {/* Clear */}
          {hasFilters && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      onFilterChange({
                        contractId: filter.contractId,
                      })
                    }
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear filters</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Table */}
      {!isLoading && sorted.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No reassignment events</EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? "Try adjusting your filters"
                : "Reassignments occur when contracts move between synchronization domains. Your environment may use a single synchronizer."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <SortableHead
                  label="Contract ID"
                  field="contractId"
                  currentSort={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Template"
                  field="template"
                  currentSort={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Source Sync"
                  field="source"
                  currentSort={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Target Sync"
                  field="target"
                  currentSort={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Status"
                  field="status"
                  currentSort={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Started"
                  field="startedAt"
                  currentSort={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Completed"
                  field="completedAt"
                  currentSort={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHead
                  label="Latency"
                  field="latency"
                  currentSort={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))
                : sorted.map((r) => (
                    <TableRow
                      key={r.reassignmentId}
                      className={cn(
                        "cursor-pointer",
                        selectedReassignmentId === r.reassignmentId &&
                          "bg-accent"
                      )}
                      onClick={() => onSelect(r)}
                    >
                      <TableCell>
                        <span className="font-mono text-xs">
                          {truncateId(r.contractId, 10)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {r.templateId.entityName}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {truncateId(r.sourceSynchronizer, 8)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {truncateId(r.targetSynchronizer, 8)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.unassignedAt
                            ? new Date(r.unassignedAt).toLocaleString()
                            : "--"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.assignedAt
                            ? new Date(r.assignedAt).toLocaleString()
                            : "--"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">
                          {r.latencyMs !== undefined
                            ? r.latencyMs < 1000
                              ? `${r.latencyMs}ms`
                              : `${(r.latencyMs / 1000).toFixed(2)}s`
                            : "--"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
