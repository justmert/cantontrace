import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Clock01Icon,
  LinkSquare01Icon,
  GitBranchIcon,
  FileXIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { truncateId } from "@/lib/utils";
import type { ContentionTimeline as ContentionTimelineType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Transaction card
// ---------------------------------------------------------------------------

interface TxCardProps {
  label: string;
  updateId: string;
  timestamp: string;
  variant: "yours" | "competing";
  onNavigateTransaction?: (updateId: string) => void;
}

function TxCard({
  label,
  updateId,
  timestamp,
  variant,
  onNavigateTransaction,
}: TxCardProps) {
  const isYours = variant === "yours";
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-2 rounded-lg border p-4",
        isYours
          ? "border-primary/30 bg-primary/5"
          : "border-accent-foreground/20 bg-accent/30"
      )}
    >
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            isYours
              ? "border-primary/50 text-primary"
              : "border-accent-foreground/30 text-accent-foreground"
          )}
        >
          {label}
        </Badge>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Update ID
        </span>
        <span className="font-mono text-xs">{truncateId(updateId, 12)}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Timestamp
        </span>
        <span className="font-mono text-xs">{formatTimestamp(timestamp)}</span>
      </div>
      {onNavigateTransaction && (
        <Button
          size="sm"
          variant="outline"
          className="mt-1 w-full text-xs"
          onClick={() => onNavigateTransaction(updateId)}
        >
          <HugeiconsIcon icon={LinkSquare01Icon} data-icon="inline-start" strokeWidth={2} />
          View in Transaction Explorer
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  } catch {
    return ts;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface ContentionTimelineProps {
  contention: ContentionTimelineType;
  onNavigateContract?: (contractId: string) => void;
  onNavigateTransaction?: (updateId: string) => void;
}

export function ContentionTimeline({
  contention,
  onNavigateContract,
  onNavigateTransaction,
}: ContentionTimelineProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Visual timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <HugeiconsIcon icon={GitBranchIcon} className="size-4" strokeWidth={2} />
            Contention Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Horizontal timeline visualization */}
          <div className="relative flex items-center justify-between px-4 py-8">
            {/* Connecting line */}
            <div className="absolute left-16 right-16 top-1/2 h-0.5 -translate-y-1/2 bg-border" />

            {/* Your transaction */}
            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className="flex size-10 items-center justify-center rounded-full border-2 border-primary bg-primary/10">
                <HugeiconsIcon icon={Clock01Icon} className="size-4 text-primary" strokeWidth={2} />
              </div>
              <span className="text-xs font-medium text-primary">
                Your Tx
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatTimestamp(contention.yourTransaction.timestamp)}
              </span>
            </div>

            {/* Arrow to sequencer */}
            <div className="relative z-10 flex flex-col items-center gap-2">
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-5 text-muted-foreground" strokeWidth={2} />
            </div>

            {/* Contested contract (center) */}
            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className="flex size-12 items-center justify-center rounded-lg border-2 border-destructive bg-destructive/10">
                <HugeiconsIcon icon={FileXIcon} className="size-5 text-destructive" strokeWidth={2} />
              </div>
              <span className="text-xs font-medium">Contested Contract</span>
              <button
                className="font-mono text-[10px] text-primary underline hover:text-primary/80"
                onClick={() =>
                  onNavigateContract?.(contention.contestedContractId)
                }
              >
                {truncateId(contention.contestedContractId, 8)}
              </button>
            </div>

            {/* Arrow from competing */}
            <div className="relative z-10 flex flex-col items-center gap-2">
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-5 rotate-180 text-muted-foreground" strokeWidth={2} />
            </div>

            {/* Competing transaction */}
            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className="flex size-10 items-center justify-center rounded-full border-2 border-accent-foreground/50 bg-accent/50">
                <HugeiconsIcon icon={Clock01Icon} className="size-4 text-accent-foreground" strokeWidth={2} />
              </div>
              <span className="text-xs font-medium text-accent-foreground">
                Competing Tx
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatTimestamp(contention.competingTransaction.timestamp)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Side-by-side transaction cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TxCard
          label="Your Transaction"
          updateId={contention.yourTransaction.updateId}
          timestamp={contention.yourTransaction.timestamp}
          variant="yours"
          onNavigateTransaction={onNavigateTransaction}
        />
        <TxCard
          label="Competing Transaction"
          updateId={contention.competingTransaction.updateId}
          timestamp={contention.competingTransaction.timestamp}
          variant="competing"
          onNavigateTransaction={onNavigateTransaction}
        />
      </div>

      {/* Explanation text */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your transaction attempted to consume contract{" "}
          <button
            className="font-mono text-primary underline hover:text-primary/80"
            onClick={() =>
              onNavigateContract?.(contention.contestedContractId)
            }
          >
            {truncateId(contention.contestedContractId, 10)}
          </button>{" "}
          but transaction{" "}
          <button
            className="font-mono text-accent-foreground underline hover:text-accent-foreground/80"
            onClick={() =>
              onNavigateTransaction?.(
                contention.competingTransaction.updateId
              )
            }
          >
            {truncateId(contention.competingTransaction.updateId, 10)}
          </button>{" "}
          consumed it first at{" "}
          <span className="font-mono">
            {formatTimestamp(contention.contestedAt)}
          </span>
          .
        </p>
      </div>
    </div>
  );
}
