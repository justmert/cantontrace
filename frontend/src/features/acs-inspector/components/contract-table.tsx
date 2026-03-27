import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUpDownIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  FileCodeIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";
import { truncateId, formatTemplateId } from "@/lib/utils";
import type { ActiveContract } from "@/lib/types";

// ---------------------------------------------------------------------------
// Loading skeleton rows
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <TableRow>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 animate-pulse rounded bg-muted" />
        </TableCell>
      ))}
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Key fields preview
// ---------------------------------------------------------------------------

function KeyFieldsPreview({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const entries = Object.entries(payload).slice(0, 3);
  if (entries.length === 0) {
    return <span className="text-muted-foreground">--</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 overflow-hidden">
      {entries.map(([key, value]) => (
        <span key={key} className="block truncate text-xs">
          <span className="text-muted-foreground">{key}:</span>{" "}
          <span className="font-mono">
            {typeof value === "string"
              ? value.length > 24
                ? value.slice(0, 24) + "..."
                : value
              : JSON.stringify(value)}
          </span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable column header
// ---------------------------------------------------------------------------

type SortField = "template" | "contractId" | "signatories" | "createdAt";
type SortDir = "asc" | "desc";

function SortableHead({
  label,
  field,
  currentSort,
  currentDir: _currentDir,
  onSort,
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const isActive = currentSort === field;
  return (
    <TableHead>
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(field)}
        aria-label={`Sort by ${label}`}
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
// Main table
// ---------------------------------------------------------------------------

export interface ContractTableProps {
  contracts: ActiveContract[];
  isLoading: boolean;
  selectedContractId: string | null;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onSelectContract: (contract: ActiveContract) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
}

export function ContractTable({
  contracts,
  isLoading,
  selectedContractId,
  hasNextPage,
  hasPrevPage,
  onSelectContract,
  onNextPage,
  onPrevPage,
}: ContractTableProps) {
  const [sortField, setSortField] = React.useState<SortField>("createdAt");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sorted = React.useMemo(() => {
    const arr = [...contracts];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "template":
          cmp = formatTemplateId(a.templateId).localeCompare(
            formatTemplateId(b.templateId)
          );
          break;
        case "contractId":
          cmp = a.contractId.localeCompare(b.contractId);
          break;
        case "signatories":
          cmp = (a.signatories[0] ?? "").localeCompare(
            b.signatories[0] ?? ""
          );
          break;
        case "createdAt":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [contracts, sortField, sortDir]);

  // Empty state
  if (!isLoading && contracts.length === 0) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={FileCodeIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No active contracts match your filters</EmptyTitle>
          <EmptyDescription>
            Try adjusting your template, party, or contract ID filters.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-md border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/30">
              <SortableHead
                label="Template"
                field="template"
                currentSort={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Contract ID"
                field="contractId"
                currentSort={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <TableHead>Key Fields</TableHead>
              <SortableHead
                label="Signatories"
                field="signatories"
                currentSort={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Created At"
                field="createdAt"
                currentSort={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))
              : sorted.map((contract) => (
                  <TableRow
                    key={contract.contractId}
                    className={cn(
                      "cursor-pointer",
                      selectedContractId === contract.contractId &&
                        "bg-accent"
                    )}
                    onClick={() => onSelectContract(contract)}
                  >
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {contract.templateId.entityName}
                      </Badge>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {contract.templateId.moduleName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs">
                          {truncateId(contract.contractId, 10)}
                        </span>
                        <CopyButton text={contract.contractId} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <KeyFieldsPreview payload={contract.payload} />
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="flex flex-col gap-0.5">
                        {contract.signatories.map((s) => (
                          <span key={s} className="block truncate font-mono text-xs">
                            {s}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {contract.createdAt}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          {contracts.length > 0 && `Showing ${contracts.length} contracts`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!hasPrevPage}
            onClick={onPrevPage}
            aria-label="Previous page"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!hasNextPage}
            onClick={onNextPage}
            aria-label="Next page"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </div>
      </div>
    </div>
  );
}
