import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRightIcon, Clock01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Reassignment } from "@/lib/types";

// ---------------------------------------------------------------------------
// Status config (semantic colors)
// ---------------------------------------------------------------------------

const STATUS_NODE_STYLES: Record<
  Reassignment["status"],
  { bg: string; border: string; text: string }
> = {
  unassigned: {
    bg: "bg-secondary/10",
    border: "border-secondary-foreground",
    text: "text-secondary-foreground",
  },
  in_flight: {
    bg: "bg-accent/10",
    border: "border-accent-foreground",
    text: "text-accent-foreground",
  },
  assigned: {
    bg: "bg-primary/10",
    border: "border-primary",
    text: "text-primary",
  },
  failed: {
    bg: "bg-destructive/10",
    border: "border-destructive",
    text: "text-destructive",
  },
};

// ---------------------------------------------------------------------------
// Reassignment Timeline Component
// ---------------------------------------------------------------------------

export interface ReassignmentTimelineProps {
  reassignment: Reassignment;
}

export function ReassignmentTimeline({
  reassignment,
}: ReassignmentTimelineProps) {
  const r = reassignment;

  const isInFlight = r.status === "in_flight";
  const isCompleted = r.status === "assigned";
  const isFailed = r.status === "failed";

  const sourceStyle = STATUS_NODE_STYLES[r.status === "unassigned" ? "unassigned" : "assigned"];
  const flightStyle = STATUS_NODE_STYLES[isInFlight ? "in_flight" : r.status === "assigned" ? "assigned" : "unassigned"];
  const targetStyle = STATUS_NODE_STYLES[isCompleted ? "assigned" : isFailed ? "failed" : "unassigned"];

  // Compute duration if both timestamps exist
  let durationStr = "--";
  if (r.latencyMs !== undefined) {
    if (r.latencyMs < 1000) {
      durationStr = `${r.latencyMs}ms`;
    } else {
      durationStr = `${(r.latencyMs / 1000).toFixed(2)}s`;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Timeline visualization */}
      <div className="flex items-center gap-0">
        {/* Source Synchronizer node */}
        <div
          className={cn(
            "flex min-w-[160px] flex-col items-center gap-1.5 rounded-lg border-2 p-3",
            sourceStyle.bg,
            sourceStyle.border
          )}
        >
          <span className={cn("text-xs font-medium", sourceStyle.text)}>
            Source Synchronizer
          </span>
          <span className="max-w-[140px] truncate font-mono text-xs text-muted-foreground">
            {r.sourceSynchronizer}
          </span>
          {r.unassignedAt && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-2.5" />
              <span>
                {new Date(r.unassignedAt).toLocaleTimeString()}
              </span>
            </div>
          )}
          {r.status === "unassigned" && (
            <Badge variant="outline" className="text-xs border-secondary-foreground/50 text-secondary-foreground">
              Unassigned
            </Badge>
          )}
        </div>

        {/* Arrow from source */}
        <div className="flex flex-col items-center px-1">
          <HugeiconsIcon
            icon={ArrowRightIcon}
            strokeWidth={2}
            className={cn(
              "size-4",
              r.unassignedAt
                ? "text-muted-foreground"
                : "text-muted-foreground/30"
            )}
          />
        </div>

        {/* In Flight node */}
        <div
          className={cn(
            "flex min-w-[120px] flex-col items-center gap-1.5 rounded-lg border-2 p-3",
            flightStyle.bg,
            isInFlight ? "border-accent-foreground" : "border-muted-foreground/20"
          )}
        >
          <span
            className={cn(
              "text-xs font-medium",
              isInFlight
                ? "text-accent-foreground"
                : "text-muted-foreground"
            )}
          >
            In Flight
          </span>
          {isInFlight ? (
            <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin text-accent-foreground" />
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              {durationStr}
            </span>
          )}
        </div>

        {/* Arrow to target */}
        <div className="flex flex-col items-center px-1">
          <HugeiconsIcon
            icon={ArrowRightIcon}
            strokeWidth={2}
            className={cn(
              "size-4",
              isCompleted
                ? "text-muted-foreground"
                : "text-muted-foreground/30",
              isInFlight && "animate-pulse text-accent-foreground"
            )}
          />
        </div>

        {/* Target Synchronizer node */}
        <div
          className={cn(
            "flex min-w-[160px] flex-col items-center gap-1.5 rounded-lg border-2 p-3",
            isCompleted
              ? cn(targetStyle.bg, targetStyle.border)
              : isFailed
                ? cn(targetStyle.bg, targetStyle.border)
                : "border-muted-foreground/20 bg-muted/20"
          )}
        >
          <span
            className={cn(
              "text-xs font-medium",
              isCompleted
                ? targetStyle.text
                : isFailed
                  ? targetStyle.text
                  : "text-muted-foreground"
            )}
          >
            Target Synchronizer
          </span>
          <span className="max-w-[140px] truncate font-mono text-xs text-muted-foreground">
            {r.targetSynchronizer}
          </span>
          {r.assignedAt && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-2.5" />
              <span>
                {new Date(r.assignedAt).toLocaleTimeString()}
              </span>
            </div>
          )}
          {isCompleted && (
            <Badge variant="outline" className="text-xs border-primary/50 text-primary">
              Assigned
            </Badge>
          )}
          {isFailed && (
            <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">
              Failed
            </Badge>
          )}
        </div>
      </div>

      {/* Duration measurement */}
      {r.latencyMs !== undefined && (
        <div className="flex justify-center">
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
            <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-3" />
            <span>
              Latency: <span className="font-mono font-medium">{durationStr}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
