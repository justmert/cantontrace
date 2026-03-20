import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MinusSignIcon,
  PlusSignIcon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  Copy01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { truncateId } from "@/lib/utils";
import type { StateDiff, ActiveContract } from "@/lib/types";

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be blocked in some contexts; silently ignore.
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex size-4 items-center justify-center rounded hover:bg-muted"
    >
      {copied ? (
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-2.5 text-primary" />
      ) : (
        <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-2.5 text-muted-foreground" />
      )}
    </button>
  );
}

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
              className="shrink-0 text-[9px]"
            >
              {contract.templateId.entityName}
            </Badge>
            <span className="truncate font-mono text-[10px] text-muted-foreground">
              {truncateId(contract.contractId, 8)}
            </span>
            <CopyBtn text={contract.contractId} />
          </div>

          {/* Key field preview */}
          {keyFields.length > 0 && (
            <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 overflow-hidden">
              {keyFields.map(([key, value]) => (
                <span key={key} className="block max-w-full truncate text-[10px]">
                  <span className="text-muted-foreground">{key}:</span>{" "}
                  <span className="font-mono">
                    {typeof value === "string"
                      ? value.length > 20
                        ? value.slice(0, 20) + "..."
                        : value
                      : JSON.stringify(value)}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Empty payload notice for consumed contracts */}
          {isInput && emptyPayload && (
            <p className="text-[10px] italic text-muted-foreground">
              Payload not available for consumed contracts
            </p>
          )}

          {/* Expand payload */}
          {!emptyPayload && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
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
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-2 font-mono text-[9px] leading-relaxed text-foreground">
              {JSON.stringify(contract.payload, null, 2)}
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
  return (
    <div className="flex h-full flex-col">
      {/* Summary */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">State Diff</h3>
        <span className="text-xs text-muted-foreground">
          {stateDiff.netChange}
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex max-w-full flex-col gap-4 overflow-hidden p-4">
          {/* Inputs (consumed) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">
                Inputs (Consumed)
              </span>
              <Badge variant="secondary" className="text-[9px]">
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
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">
                Outputs (Created)
              </span>
              <Badge variant="secondary" className="text-[9px]">
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
