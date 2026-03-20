import React, { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Tick02Icon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  LinkForwardIcon,
  Clock01Icon,
  TestTubeIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatTemplateId } from "@/lib/utils";
import type { ActiveContract } from "@/lib/types";

// ---------------------------------------------------------------------------
// Copy helper
// ---------------------------------------------------------------------------

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be blocked in some contexts; silently ignore.
    }
  };

  return (
    <div className="flex flex-col gap-1 overflow-hidden">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="min-w-0 break-all font-mono text-xs">{value}</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleCopy}
                aria-label={`Copy ${label}`}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
              >
                {copied ? (
                  <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3 text-primary" />
                ) : (
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-3 text-muted-foreground" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>{copied ? "Copied!" : "Copy"}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

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
      >
        {isString ? `"${value}"` : String(value)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

export interface ContractDetailProps {
  contract: ActiveContract;
  onClose: () => void;
}

export function ContractDetail({ contract, onClose }: ContractDetailProps) {
  const templateStr = formatTemplateId(contract.templateId);

  return (
    <div className="flex h-full flex-col border-l bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Contract Detail</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close contract detail panel"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {/* Contract ID */}
          <CopyableField label="Contract ID" value={contract.contractId} />

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
              <HugeiconsIcon icon={LinkForwardIcon} strokeWidth={2} className="size-3" />
            </a>
            <span className="truncate text-[10px] text-muted-foreground">
              {contract.templateId.moduleName} ({contract.templateId.packageName})
            </span>
          </div>

          <Separator />

          {/* Signatories */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Signatories
            </span>
            <div className="flex flex-wrap gap-1">
              {contract.signatories.map((s) => (
                <Badge key={s} variant="secondary" className="max-w-full font-mono text-[10px]">
                  <span className="truncate">{s}</span>
                </Badge>
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
                  <Badge key={o} variant="outline" className="max-w-full font-mono text-[10px]">
                    <span className="truncate">{o}</span>
                  </Badge>
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
            <a href={`/contracts/${encodeURIComponent(contract.contractId)}`}>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} data-icon="inline-start" />
                View Lifecycle
              </Button>
            </a>
            <a href={`/simulate?contractId=${encodeURIComponent(contract.contractId)}&template=${encodeURIComponent(`${contract.templateId.moduleName}:${contract.templateId.entityName}`)}`}>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <HugeiconsIcon icon={TestTubeIcon} strokeWidth={2} data-icon="inline-start" />
                Use in Simulation
              </Button>
            </a>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
