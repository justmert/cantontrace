import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUpDownIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  FileCodeIcon,
  TestTubeIcon,
  AnalysisTextLinkIcon,
  Copy01Icon,
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
import { IdBadge } from "@/components/id-badge";
import { PartyBadge } from "@/components/party-badge";
import { cn, formatTimestamp, formatTemplateId, formatPayloadValue } from "@/lib/utils";
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
// Key fields preview — pill/tag style
// ---------------------------------------------------------------------------

function KeyFieldsPreview({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const entries = Object.entries(payload);
  const visible = entries.slice(0, 3);
  const remaining = entries.length - visible.length;

  if (visible.length === 0) {
    return <span className="text-muted-foreground">--</span>;
  }

  return (
    <div className="flex flex-col gap-0.5 overflow-hidden">
      {visible.map(([key, value]) => {
        const formatted = typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : formatPayloadValue(value);
        const display = formatted.length > 24
          ? formatted.slice(0, 24) + "..."
          : formatted;
        const fullValue = typeof value === "string" ? value : JSON.stringify(value);
        return (
          <div
            key={key}
            className="flex items-baseline gap-1 text-[10px] leading-tight"
            title={`${key}: ${fullValue}`}
          >
            <span className="shrink-0 text-muted-foreground">{key}:</span>
            <span className="truncate font-mono text-foreground">{display}</span>
          </div>
        );
      })}
      {remaining > 0 && (
        <span className="text-[10px] text-muted-foreground">
          +{remaining} more
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row-level quick action buttons (visible on hover)
// ---------------------------------------------------------------------------

function RowActions({ contract }: { contract: ActiveContract }) {
  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(contract.contractId).catch(() => {});
  };

  const simulateUrl = `/debugger?contractId=${encodeURIComponent(contract.contractId)}&template=${encodeURIComponent(`${contract.templateId.moduleName}:${contract.templateId.entityName}`)}`;
  const traceUrl = `/debugger?contractId=${encodeURIComponent(contract.contractId)}&template=${encodeURIComponent(`${contract.templateId.moduleName}:${contract.templateId.entityName}`)}&mode=trace`;

  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={simulateUrl}
              onClick={(e) => e.stopPropagation()}
            >
              <Button variant="ghost" size="icon-xs" aria-label="Simulate">
                <HugeiconsIcon icon={TestTubeIcon} strokeWidth={2} />
              </Button>
            </a>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Simulate</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={traceUrl}
              onClick={(e) => e.stopPropagation()}
            >
              <Button variant="ghost" size="icon-xs" aria-label="Trace">
                <HugeiconsIcon icon={AnalysisTextLinkIcon} strokeWidth={2} />
              </Button>
            </a>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Trace</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" onClick={handleCopyId} aria-label="Copy ID">
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Copy ID</TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
          <TableHeader className="sticky top-0 z-10 bg-background">
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
                      "group/row cursor-pointer even:bg-muted/10",
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
                      <IdBadge id={contract.contractId} truncateLen={10} />
                    </TableCell>
                    <TableCell>
                      <KeyFieldsPreview payload={contract.payload} />
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="flex flex-col gap-0.5">
                        {contract.signatories.map((s) => (
                          <PartyBadge key={s} party={s} variant="compact" />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-between gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default font-mono text-xs text-muted-foreground">
                                {formatTimestamp(contract.createdAt, "relative")}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {new Date(contract.createdAt).toLocaleString()}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <RowActions contract={contract} />
                      </div>
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
