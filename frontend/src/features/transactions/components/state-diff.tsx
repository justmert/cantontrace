import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MinusSignIcon,
  PlusSignIcon,
  ArrowRight01Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { IdBadge } from "@/components/id-badge";

import { formatPayloadValue, formatJsonForDisplay } from "@/lib/utils";
import type { StateDiff, ActiveContract } from "@/lib/types";

// ---------------------------------------------------------------------------
// Contract card
// ---------------------------------------------------------------------------

function isEmptyPayload(payload: Record<string, unknown>): boolean {
  return !payload || Object.keys(payload).length === 0;
}

function ContractCard({
  contract,
  variant,
}: {
  contract: ActiveContract;
  variant: "input" | "output";
}) {
  const [expanded, setExpanded] = useState(false);
  const isInput = variant === "input";
  const emptyPayload = isEmptyPayload(contract.payload);

  // Extract first 3 key fields for preview
  const keyFields = emptyPayload
    ? []
    : Object.entries(contract.payload).slice(0, 3);

  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0 rounded-full bg-muted p-0.5 text-muted-foreground">
          {isInput ? (
            <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="size-3" />
          ) : (
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Badge
              variant={isInput ? "secondary" : "outline"}
              className="shrink-0 text-xs"
            >
              {contract.templateId.entityName}
            </Badge>
            <IdBadge id={contract.contractId} truncateLen={8} href={`/contracts/${encodeURIComponent(contract.contractId)}`} />
          </div>

          {/* Key field preview */}
          {keyFields.length > 0 && (
            <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 overflow-hidden">
              {keyFields.map(([key, value]) => {
                const formatted = typeof value === "object" && value !== null
                  ? JSON.stringify(value)
                  : formatPayloadValue(value);
                const display = formatted.length > 20
                  ? formatted.slice(0, 20) + "..."
                  : formatted;
                const fullValue = typeof value === "string" ? value : JSON.stringify(value);
                return (
                  <span key={key} className="block max-w-full truncate text-xs" title={`${key}: ${fullValue}`}>
                    <span className="text-muted-foreground">{key}:</span>{" "}
                    <span className="font-mono">{display}</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* Empty payload notice for consumed contracts */}
          {isInput && emptyPayload && (
            <p className="text-xs italic text-muted-foreground">
              Payload not available for consumed contracts
            </p>
          )}

          {/* Expand payload */}
          {!emptyPayload && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? (
                <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3" />
              ) : (
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3" />
              )}
              Full payload
            </button>
          )}

          {expanded && !emptyPayload && (
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-2 font-mono text-xs leading-relaxed text-foreground">
              {formatJsonForDisplay(contract.payload)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State diff component
// ---------------------------------------------------------------------------

export interface StateDiffProps {
  stateDiff: StateDiff;
}

export function StateDiffPanel({ stateDiff }: StateDiffProps) {
  const created = stateDiff.outputs.length;
  const consumed = stateDiff.inputs.length;
  const net = created - consumed;
  const netLabel = net > 0 ? `+${net}` : net === 0 ? "0" : `${net}`;

  return (
    <div className="flex h-full flex-col">
      {/* Summary */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">State Diff</h3>
        <Badge variant="outline" className="text-xs font-mono">
          <span className="text-event-create">+{created}</span>
          <span className="text-muted-foreground mx-1">created,</span>
          <span className="text-event-archive">-{consumed}</span>
          <span className="text-muted-foreground mx-1">consumed</span>
          <span className="text-muted-foreground mx-1">=</span>
          <span>net {netLabel}</span>
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex max-w-full flex-col gap-4 overflow-hidden p-4">
          {/* Inputs (consumed) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="size-3.5 text-event-archive" />
              <span className="text-xs font-medium text-event-archive">
                Inputs (Consumed)
              </span>
              <Badge variant="secondary" className="text-xs">
                {stateDiff.inputs.length}
              </Badge>
            </div>
            {stateDiff.inputs.length === 0 ? (
              <p className="pl-5 text-xs text-muted-foreground">
                No contracts consumed
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {stateDiff.inputs.map((c) => (
                  <ContractCard
                    key={c.contractId}
                    contract={c}
                    variant="input"
                  />
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Outputs (created) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3.5 text-event-create" />
              <span className="text-xs font-medium text-event-create">
                Outputs (Created)
              </span>
              <Badge variant="secondary" className="text-xs">
                {stateDiff.outputs.length}
              </Badge>
            </div>
            {stateDiff.outputs.length === 0 ? (
              <p className="pl-5 text-xs text-muted-foreground">
                No contracts created
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {stateDiff.outputs.map((c) => (
                  <ContractCard
                    key={c.contractId}
                    contract={c}
                    variant="output"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
