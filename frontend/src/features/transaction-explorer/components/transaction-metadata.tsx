import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Tick02Icon,
  LinkForwardIcon,
  EyeIcon,
  Route01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { TransactionDetail } from "@/lib/types";

// ---------------------------------------------------------------------------
// Copyable key-value row
// ---------------------------------------------------------------------------

function MetaRow({
  label,
  value,
  copyable = false,
  mono = false,
  link,
}: {
  label: string;
  value: string | undefined;
  copyable?: boolean;
  mono?: boolean;
  link?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

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
    <div className="flex flex-col gap-0.5 overflow-hidden">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-1.5 min-w-0">
        {link ? (
          <a
            href={link}
            className={cn(
              "min-w-0 truncate text-xs text-primary hover:underline",
              mono && "font-mono"
            )}
            title={value}
          >
            {value}
            <HugeiconsIcon icon={LinkForwardIcon} strokeWidth={2} className="ml-1 inline size-3" />
          </a>
        ) : (
          <span className={cn("min-w-0 break-all text-xs", mono && "font-mono")}>
            {value}
          </span>
        )}
        {copyable && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCopy}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                >
                  {copied ? (
                    <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3 text-primary" />
                  ) : (
                    <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-3 text-muted-foreground" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {copied ? "Copied!" : "Copy"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface TransactionMetadataProps {
  transaction: TransactionDetail;
}

export function TransactionMetadata({
  transaction,
}: TransactionMetadataProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Metadata</h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-4">
          <MetaRow
            label="Update ID"
            value={transaction.updateId}
            copyable
            mono
          />

          <MetaRow
            label="Command ID"
            value={transaction.commandId}
            copyable
            mono
          />

          <MetaRow
            label="Workflow ID"
            value={transaction.workflowId}
            mono
            copyable
            link={
              transaction.workflowId
                ? `/workflows?workflowId=${encodeURIComponent(transaction.workflowId)}`
                : undefined
            }
          />

          <Separator />

          <MetaRow
            label="Record Time"
            value={
              transaction.recordTime
                ? new Date(transaction.recordTime).toLocaleString()
                : undefined
            }
          />

          <MetaRow
            label="Effective At"
            value={
              transaction.effectiveAt
                ? new Date(transaction.effectiveAt).toLocaleString()
                : undefined
            }
          />

          <MetaRow
            label="Offset"
            value={transaction.offset}
            mono
            copyable
          />

          <Separator />

          {/* Trace context */}
          {transaction.traceContext && (
            <>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Trace Context
                </span>
              </div>
              {transaction.traceContext.traceParent && (
                <MetaRow
                  label="trace_parent"
                  value={transaction.traceContext.traceParent}
                  mono
                  copyable
                  link={`/workflows?traceId=${encodeURIComponent(transaction.traceContext.traceParent)}`}
                />
              )}
              {transaction.traceContext.traceState && (
                <MetaRow
                  label="trace_state"
                  value={transaction.traceContext.traceState}
                  mono
                  copyable
                />
              )}
              <Separator />
            </>
          )}

          {/* Quick actions */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Quick Actions
            </span>
            <a
              href={`/privacy/${encodeURIComponent(transaction.updateId)}`}
            >
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
              >
                <HugeiconsIcon icon={EyeIcon} strokeWidth={2} data-icon="inline-start" />
                View Privacy
              </Button>
            </a>
            <a
              href={`/workflows?updateId=${encodeURIComponent(transaction.updateId)}`}
            >
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
              >
                <HugeiconsIcon icon={Route01Icon} strokeWidth={2} data-icon="inline-start" />
                Trace Workflow
              </Button>
            </a>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
