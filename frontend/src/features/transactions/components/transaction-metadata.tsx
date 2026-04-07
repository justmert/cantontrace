import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Tick02Icon,
  LinkForwardIcon,
  InformationCircleIcon,
  BugIcon,
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
import { IdBadge } from "@/components/id-badge";
import { CopyButton } from "@/components/copy-button";
import { cn, formatTemplateId } from "@/lib/utils";
import type { TransactionDetail, ExercisedEvent } from "@/lib/types";

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
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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

/**
 * Build a "Trace in Debugger" URL from the root exercise event (if any).
 */
function buildDebuggerUrl(transaction: TransactionDetail): string | null {
  const rootExercise = transaction.rootEventIds
    .map((id) => transaction.eventsById[id])
    .find((e) => e?.eventType === "exercised") as ExercisedEvent | undefined;

  if (!rootExercise) return null;

  const params = new URLSearchParams();
  params.set("contractId", rootExercise.contractId);
  params.set("template", formatTemplateId(rootExercise.templateId));
  if (rootExercise.choice) params.set("choice", rootExercise.choice);
  if (rootExercise.templateId.packageName) params.set("package", rootExercise.templateId.packageName);
  if (rootExercise.actingParties?.length) {
    params.set("actAs", rootExercise.actingParties.join(","));
    params.set("readAs", rootExercise.actingParties.join(","));
  }
  return `/debugger?${params.toString()}`;
}

export function TransactionMetadata({
  transaction,
}: TransactionMetadataProps) {
  const debuggerUrl = buildDebuggerUrl(transaction);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Metadata</h3>
        {debuggerUrl && (
          <a href={debuggerUrl} className="ml-auto">
            <Button variant="outline" size="sm">
              <HugeiconsIcon icon={BugIcon} strokeWidth={2} data-icon="inline-start" />
              Trace in Debugger
            </Button>
          </a>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-4">
          {/* 2-column grid for short ID values */}
          <div className="grid grid-cols-2 gap-3">
            {transaction.updateId && (
              <div className="flex flex-col gap-0.5 overflow-hidden">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Update ID
                </span>
                <div className="flex items-center gap-1">
                  <IdBadge id={transaction.updateId} truncateLen={14} />
                  <CopyButton text={transaction.updateId} />
                </div>
              </div>
            )}

            {transaction.commandId && (
              <div className="flex flex-col gap-0.5 overflow-hidden">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Command ID
                </span>
                <div className="flex items-center gap-1">
                  <IdBadge id={transaction.commandId} truncateLen={14} />
                  <CopyButton text={transaction.commandId} />
                </div>
              </div>
            )}
          </div>

          {/* Workflow ID — full width */}
          <MetaRow
            label="Workflow ID"
            value={transaction.workflowId}
            mono
            copyable
            link={undefined}
          />

          <Separator />

          {/* 2-column grid for timestamps */}
          <div className="grid grid-cols-2 gap-3">
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
          </div>

          <MetaRow
            label="Offset"
            value={transaction.offset}
            mono
            copyable
          />

          <Separator />

          {/* Trace context — full width */}
          {transaction.traceContext && (
            <>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Trace Context
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {transaction.traceContext.traceParent && (
                  <div className="col-span-2 flex flex-col gap-0.5 overflow-hidden">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      trace_parent
                    </span>
                    <div className="flex items-center gap-1">
                      <IdBadge
                        id={transaction.traceContext.traceParent}
                        truncateLen={14}
                      />
                      <CopyButton text={transaction.traceContext.traceParent} />
                    </div>
                  </div>
                )}
                {transaction.traceContext.traceState && (
                  <div className="col-span-2">
                    <MetaRow
                      label="trace_state"
                      value={transaction.traceContext.traceState}
                      mono
                      copyable
                    />
                  </div>
                )}
              </div>
              <Separator />
            </>
          )}

        </div>
      </ScrollArea>
    </div>
  );
}
