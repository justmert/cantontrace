import { HugeiconsIcon } from "@hugeicons/react";
import {
  LinkSquareIcon,
  ViewIcon,
  TerminalIcon,
  Clock01Icon,
  UserGroupIcon,
  File01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/copy-button";
import { truncateId, formatTemplateId } from "@/lib/utils";
import type { WorkflowTransaction } from "@/lib/types";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface WorkflowDetailProps {
  transaction: WorkflowTransaction | null;
}

export function WorkflowDetail({ transaction }: WorkflowDetailProps) {
  if (!transaction) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Select a transaction in the timeline to view details
      </div>
    );
  }

  const tx = transaction;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Transaction Details</h3>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
            <a href={`/transactions/${tx.updateId}`}>
              <HugeiconsIcon icon={LinkSquareIcon} data-icon="inline-start" strokeWidth={2} />
              View Full Transaction
            </a>
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
            <a href={`/privacy/${tx.updateId}`}>
              <HugeiconsIcon icon={ViewIcon} data-icon="inline-start" strokeWidth={2} />
              View Privacy
            </a>
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
            <a href={`/trace?updateId=${tx.updateId}`}>
              <HugeiconsIcon icon={TerminalIcon} data-icon="inline-start" strokeWidth={2} />
              Trace Execution
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-3 overflow-hidden lg:grid-cols-4">
        {/* Update ID */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Update ID
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <span className="font-mono text-xs">{truncateId(tx.updateId)}</span>
            <CopyButton text={tx.updateId} label="Copy Update ID" />
          </div>
        </div>

        {/* Template */}
        <div className="min-w-0 overflow-hidden">
          <div className="text-xs font-medium text-muted-foreground">
            Template
          </div>
          <div className="mt-0.5 flex items-center gap-1 min-w-0">
            <HugeiconsIcon icon={File01Icon} strokeWidth={2} className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono text-xs" title={formatTemplateId(tx.templateId)}>
              {formatTemplateId(tx.templateId)}
            </span>
          </div>
        </div>

        {/* Choice */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Choice
          </div>
          <div className="mt-0.5">
            {tx.choice ? (
              <Badge variant="outline" className="font-mono text-xs">
                {tx.choice}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">--</span>
            )}
          </div>
        </div>

        {/* Record Time */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Record Time
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-3 text-muted-foreground" />
            <span className="font-mono text-xs">
              {new Date(tx.recordTime).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Offset */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Offset
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <span className="font-mono text-xs">{tx.offset}</span>
            <CopyButton text={tx.offset} label="Copy offset" />
          </div>
        </div>

        {/* Command ID */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Command ID
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            {tx.commandId ? (
              <>
                <span className="font-mono text-xs">
                  {truncateId(tx.commandId)}
                </span>
                <CopyButton text={tx.commandId} label="Copy Command ID" />
              </>
            ) : (
              <span className="text-xs text-muted-foreground">--</span>
            )}
          </div>
        </div>

        {/* Workflow ID */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Workflow ID
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            {tx.workflowId ? (
              <>
                <span className="font-mono text-xs">
                  {truncateId(tx.workflowId)}
                </span>
                <CopyButton text={tx.workflowId} label="Copy Workflow ID" />
              </>
            ) : (
              <span className="text-xs text-muted-foreground">--</span>
            )}
          </div>
        </div>

        {/* Trace Context */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Trace Context
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            {tx.traceContext?.traceParent ? (
              <>
                <span className="font-mono text-xs">
                  {truncateId(tx.traceContext.traceParent, 12)}
                </span>
                <CopyButton
                  text={tx.traceContext.traceParent}
                  label="Copy trace parent"
                />
              </>
            ) : (
              <span className="text-xs text-muted-foreground">--</span>
            )}
          </div>
        </div>
      </div>

      <Separator className="my-3" />

      {/* Acting Parties */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} className="size-3" />
          Acting Parties
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tx.actingParties.map((party) => (
            <Badge key={party} variant="secondary" className="max-w-full font-mono text-xs">
              <span className="truncate">{party}</span>
            </Badge>
          ))}
        </div>
      </div>

      {/* Contracts Created & Consumed */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            Contracts Created ({tx.contractsCreated.length})
          </div>
          {tx.contractsCreated.length > 0 ? (
            <div className="flex flex-col gap-1">
              {tx.contractsCreated.map((cid) => (
                <div key={cid} className="flex items-center gap-1 min-w-0">
                  <div className="size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-0 truncate font-mono text-xs">{truncateId(cid)}</span>
                  <CopyButton text={cid} label="Copy Contract ID" />
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            Contracts Consumed ({tx.contractsConsumed.length})
          </div>
          {tx.contractsConsumed.length > 0 ? (
            <div className="flex flex-col gap-1">
              {tx.contractsConsumed.map((cid) => (
                <div key={cid} className="flex items-center gap-1 min-w-0">
                  <div className="size-1.5 shrink-0 rounded-full bg-destructive" />
                  <span className="min-w-0 truncate font-mono text-xs">{truncateId(cid)}</span>
                  <CopyButton text={cid} label="Copy Contract ID" />
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>
      </div>
    </div>
  );
}
