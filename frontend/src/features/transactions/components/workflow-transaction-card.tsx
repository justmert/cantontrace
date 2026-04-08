import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { truncateId } from "@/lib/utils";
import type { WorkflowTransaction } from "@/lib/types";

// ---------------------------------------------------------------------------
// Event type border colors (semantic)
// ---------------------------------------------------------------------------

function getBorderColor(tx: WorkflowTransaction): string {
  if (tx.choice) {
    return "border-l-secondary-foreground";
  }
  if (tx.contractsCreated.length > 0 && tx.contractsConsumed.length === 0) {
    return "border-l-primary";
  }
  if (tx.contractsConsumed.length > 0 && tx.contractsCreated.length === 0) {
    return "border-l-destructive";
  }
  return "border-l-accent-foreground";
}

// ---------------------------------------------------------------------------
// Custom ReactFlow node for workflow transactions
// ---------------------------------------------------------------------------

export interface WorkflowTransactionNodeData {
  transaction: WorkflowTransaction;
  isSelected: boolean;
  onClick: (updateId: string) => void;
  [key: string]: unknown;
}

export type TransactionCardNode = Node<WorkflowTransactionNodeData, "transactionCard">;

export function WorkflowTransactionCard({
  data,
}: NodeProps<TransactionCardNode>) {
  const { transaction: tx, isSelected, onClick } = data;

  const timeStr = new Date(tx.recordTime).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });

  return (
    <TooltipProvider>
      <div
        className={cn(
          "min-w-[200px] max-w-[260px] cursor-pointer rounded-md border border-l-4 bg-card p-3 shadow-sm transition-all hover:shadow-md",
          getBorderColor(tx),
          isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background"
        )}
        role="button"
        tabIndex={0}
        aria-label={`Transaction ${tx.templateId.entityName}${tx.choice ? ` - ${tx.choice}` : ""}`}
        onClick={() => onClick(tx.updateId)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick(tx.updateId);
          }
        }}
      >
        {/* Template & Choice */}
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {tx.templateId.entityName}
            </div>
            {tx.choice && (
              <div className="truncate text-xs text-secondary-foreground">
                {tx.choice}
              </div>
            )}
          </div>
        </div>

        {/* Acting Parties */}
        <div className="mb-1.5 flex flex-wrap gap-1">
          {tx.actingParties.slice(0, 2).map((party) => (
            <Tooltip key={party}>
              <TooltipTrigger asChild>
                <span>
                  <Badge
                    variant="secondary"
                    className="max-w-[100px] truncate text-xs"
                  >
                    {party}
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-mono text-xs">{party}</span>
              </TooltipContent>
            </Tooltip>
          ))}
          {tx.actingParties.length > 2 && (
            <Badge variant="secondary" className="text-xs">
              +{tx.actingParties.length - 2}
            </Badge>
          )}
        </div>

        {/* Contract counts */}
        <div className="mb-1 flex items-center gap-2">
          {tx.contractsCreated.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Badge className="bg-primary/15 text-primary hover:bg-primary/25 text-xs">
                    +{tx.contractsCreated.length} created
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex flex-col gap-0.5">
                  {tx.contractsCreated.map((cid) => (
                    <div key={cid} className="font-mono text-xs">
                      {truncateId(cid)}
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          {tx.contractsConsumed.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/25 text-xs">
                    -{tx.contractsConsumed.length} consumed
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex flex-col gap-0.5">
                  {tx.contractsConsumed.map((cid) => (
                    <div key={cid} className="font-mono text-xs">
                      {truncateId(cid)}
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Timestamp */}
        <div className="text-xs font-mono text-muted-foreground">
          {timeStr}
        </div>

        {/* Handles for ReactFlow edges */}
        <Handle
          type="target"
          position={Position.Left}
          className="!size-2.5 !border-2 !border-background !bg-muted-foreground"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!size-2.5 !border-2 !border-background !bg-muted-foreground"
        />
      </div>
    </TooltipProvider>
  );
}
