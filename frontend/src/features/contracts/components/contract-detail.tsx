import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  ArrowDown01Icon,
  LinkForwardIcon,
  TestTubeIcon,
  Cancel01Icon,
  Search01Icon,
  AnalysisTextLinkIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { IdBadge } from "@/components/id-badge";
import { CopyButton } from "@/components/copy-button";
import { PartyBadge } from "@/components/party-badge";
import { cn, formatTemplateId, formatPartyDisplay, formatNumeric } from "@/lib/utils";
import type { ActiveContract } from "@/lib/types";
import { useContractLifecycle } from "@/features/contracts/hooks";
import { LifecycleTimeline } from "./lifecycle-timeline";

// ---------------------------------------------------------------------------
// JSON tree viewer
// ---------------------------------------------------------------------------

function JsonNode({
  keyName,
  value,
  depth = 0,
}: {
  keyName?: string;
  value: unknown;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (value === null || value === undefined) {
    return (
      <div className="flex items-baseline gap-1" style={{ paddingLeft: depth * 16 }}>
        {keyName !== undefined && (
          <span className="text-xs text-muted-foreground">{keyName}:</span>
        )}
        <span className="font-mono text-xs text-muted-foreground/60">null</span>
      </div>
    );
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        <button
          className="flex items-center gap-1 text-xs hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3 text-muted-foreground" />
          ) : (
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3 text-muted-foreground" />
          )}
          {keyName !== undefined && (
            <span className="text-muted-foreground">{keyName}:</span>
          )}
          <span className="text-muted-foreground/60">
            {"{"}
            {!expanded && `${entries.length} fields`}
            {!expanded && "}"}
          </span>
        </button>
        {expanded && (
          <>
            {entries.map(([k, v]) => (
              <JsonNode key={k} keyName={k} value={v} depth={depth + 1} />
            ))}
            <div
              className="text-xs text-muted-foreground/60"
              style={{ paddingLeft: (depth + 1) * 16 }}
            >
              {"}"}
            </div>
          </>
        )}
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        <button
          className="flex items-center gap-1 text-xs hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3 text-muted-foreground" />
          ) : (
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3 text-muted-foreground" />
          )}
          {keyName !== undefined && (
            <span className="text-muted-foreground">{keyName}:</span>
          )}
          <span className="text-muted-foreground/60">
            {"["}
            {!expanded && `${value.length} items`}
            {!expanded && "]"}
          </span>
        </button>
        {expanded && (
          <>
            {value.map((item, i) => (
              <JsonNode key={i} keyName={String(i)} value={item} depth={depth + 1} />
            ))}
            <div
              className="text-xs text-muted-foreground/60"
              style={{ paddingLeft: (depth + 1) * 16 }}
            >
              {"]"}
            </div>
          </>
        )}
      </div>
    );
  }

  // Primitive
  const isString = typeof value === "string";
  const isBool = typeof value === "boolean";
  const isNumber = typeof value === "number";

  // Format party IDs and numeric values for display
  const isPartyId = isString && (value as string).includes("::");
  const isNumericStr = isString && /^-?\d+\.\d{4,}$/.test(value as string);
  let displayValue: string;
  if (isPartyId) {
    displayValue = `"${formatPartyDisplay(value as string)}"`;
  } else if (isNumericStr) {
    displayValue = `"${formatNumeric(value as string)}"`;
  } else if (isString) {
    displayValue = `"${value}"`;
  } else {
    displayValue = String(value);
  }

  return (
    <div className="flex items-baseline gap-1" style={{ paddingLeft: depth * 16 }}>
      {keyName !== undefined && (
        <span className="text-xs text-muted-foreground">{keyName}:</span>
      )}
      <span
        className={cn(
          "font-mono text-xs",
          isString && "text-primary",
          isBool && "text-accent-foreground",
          isNumber && "text-muted-foreground"
        )}
        title={isPartyId ? (value as string) : undefined}
      >
        {displayValue}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lifecycle tab content
// ---------------------------------------------------------------------------

function LifecycleTab({ contractId }: { contractId: string }) {
  const navigate = useNavigate();
  const {
    data: lifecycle,
    isPending,
    isError,
    error,
  } = useContractLifecycle(contractId || null);

  const handleNavigateTransaction = (updateId: string) => {
    if (updateId) {
      navigate({ to: "/transactions/$updateId", params: { updateId } });
    }
  };

  const handleNavigateContract = (id: string) => {
    // Navigate to the same unified contracts page with a different contractId
    navigate({ to: "/contracts/$contractId", params: { contractId: id } });
  };

  const handleNavigateOffset = (offset: string) => {
    // Navigate to the transactions page filtered by offset
    window.location.href = `/transactions?offset=${encodeURIComponent(offset)}`;
  };

  if (isPending && contractId) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-20 flex-1 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
          <span className="text-sm font-semibold text-destructive">!</span>
        </div>
        <p className="text-sm font-medium">Failed to load lifecycle</p>
        <p className="text-xs text-muted-foreground">
          {(error as Error)?.message ??
            "The contract may not exist or may have been pruned."}
        </p>
      </div>
    );
  }

  if (!lifecycle) return null;

  return (
    <div className="p-4">
      <LifecycleTimeline
        lifecycle={lifecycle}
        onNavigateTransaction={handleNavigateTransaction}
        onNavigateContract={handleNavigateContract}
        onNavigateOffset={handleNavigateOffset}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel with tabs
// ---------------------------------------------------------------------------

export interface ContractDetailProps {
  contract: ActiveContract;
  onClose: () => void;
  /** Which tab to show initially ("details" | "lifecycle"). Defaults to "details". */
  defaultTab?: "details" | "lifecycle";
}

export function ContractDetail({
  contract,
  onClose,
  defaultTab = "details",
}: ContractDetailProps) {
  const navigate = useNavigate();
  const [activeDetailTab, setActiveDetailTab] = useState(defaultTab);
  const templateStr = formatTemplateId(contract.templateId);

  // Fetch lifecycle to determine archived status
  const { data: lifecycle } = useContractLifecycle(
    contract.contractId || null
  );
  const isArchived = !!lifecycle?.archival;

  return (
    <div className="flex h-full flex-col border-l bg-card animate-in slide-in-from-right-4 duration-200 fill-mode-forwards">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Contract Detail</h3>
          {lifecycle && (
            <Badge
              variant={isArchived ? "destructive" : "default"}
              className="text-xs px-1.5 py-0"
            >
              {isArchived ? "Archived" : "Active"}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close contract detail panel"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab} className="flex flex-1 flex-col overflow-hidden gap-0">
        <TabsList variant="line" className="w-full shrink-0 border-b px-4">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
        </TabsList>

        {/* Details tab */}
        <TabsContent value="details" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-4">
              {/* Contract ID */}
              <div className="flex flex-col gap-1 overflow-hidden">
                <span className="text-xs font-medium text-muted-foreground">
                  Contract ID
                </span>
                <div className="flex items-center gap-1">
                  <IdBadge id={contract.contractId} truncateLen={16} />
                  <CopyButton text={contract.contractId} label="Copy Contract ID" size="xs" />
                </div>
              </div>

              {/* Template */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Template
                </span>
                <a
                  href={`/templates?template=${encodeURIComponent(templateStr)}`}
                  className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                >
                  {contract.templateId.entityName}
                  <HugeiconsIcon
                    icon={LinkForwardIcon}
                    strokeWidth={2}
                    className="size-3"
                  />
                </a>
                <span className="truncate text-xs text-muted-foreground">
                  {contract.templateId.moduleName}
                </span>
              </div>

              {/* Package */}
              {contract.templateId.packageName && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Package
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {contract.templateId.packageName}
                  </span>
                </div>
              )}

              <Separator />

              {/* Signatories */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Signatories
                </span>
                <div className="flex flex-wrap gap-1">
                  {contract.signatories.map((s) => (
                    <PartyBadge key={s} party={s} />
                  ))}
                </div>
              </div>

              {/* Observers */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Observers
                </span>
                {contract.observers.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {contract.observers.map((o) => (
                      <PartyBadge key={o} party={o} />
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
              </div>

              {/* Contract Key */}
              {contract.contractKey && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Contract Key
                    </span>
                    <div className="rounded-md bg-muted/50 p-2">
                      <JsonNode value={contract.contractKey} />
                    </div>
                  </div>
                </>
              )}

              {/* Creation Offset */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Creation Offset
                </span>
                <span className="font-mono text-xs">{contract.createdAt}</span>
              </div>

              <Separator />

              {/* Payload */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Payload
                </span>
                <div className="rounded-md border bg-muted/30 p-3">
                  <JsonNode value={contract.payload} />
                </div>
              </div>

              <Separator />

              {/* Action buttons */}
              <div className="flex flex-col gap-2">
                <a
                  href={`/debugger?contractId=${encodeURIComponent(contract.contractId)}&template=${encodeURIComponent(`${contract.templateId.moduleName}:${contract.templateId.entityName}`)}&package=${encodeURIComponent(contract.templateId.packageName ?? "")}&actAs=${encodeURIComponent([...contract.signatories, ...contract.observers].join(","))}&readAs=${encodeURIComponent([...contract.signatories, ...contract.observers].join(","))}`}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                  >
                    <HugeiconsIcon
                      icon={TestTubeIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Use in Simulation
                  </Button>
                </a>

                <a
                  href={`/debugger?contractId=${encodeURIComponent(contract.contractId)}&template=${encodeURIComponent(`${contract.templateId.moduleName}:${contract.templateId.entityName}`)}&package=${encodeURIComponent(contract.templateId.packageName ?? "")}&actAs=${encodeURIComponent([...contract.signatories, ...contract.observers].join(","))}&readAs=${encodeURIComponent([...contract.signatories, ...contract.observers].join(","))}&mode=trace`}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                  >
                    <HugeiconsIcon
                      icon={AnalysisTextLinkIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Trace Exercise
                  </Button>
                </a>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setActiveDetailTab("lifecycle")}
                >
                  <HugeiconsIcon
                    icon={Search01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  View Full Lifecycle
                </Button>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Lifecycle tab */}
        <TabsContent value="lifecycle" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <LifecycleTab contractId={contract.contractId} />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
