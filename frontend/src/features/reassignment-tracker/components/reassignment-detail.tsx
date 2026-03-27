import { HugeiconsIcon } from "@hugeicons/react";
import {
  LinkSquareIcon,
  InformationCircleIcon,
  File01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CopyButton } from "@/components/copy-button";
import { truncateId, formatTemplateId } from "@/lib/utils";
import type { Reassignment } from "@/lib/types";
import { ReassignmentTimeline } from "./reassignment-timeline";

// ---------------------------------------------------------------------------
// Reassignment Detail Component
// ---------------------------------------------------------------------------

export interface ReassignmentDetailProps {
  reassignment: Reassignment | null;
}

export function ReassignmentDetail({ reassignment }: ReassignmentDetailProps) {
  if (!reassignment) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Select a reassignment to view details
      </div>
    );
  }

  const r = reassignment;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Reassignment Details</h3>
        <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
          <a href={`/contracts/${r.contractId}`}>
            <HugeiconsIcon icon={LinkSquareIcon} data-icon="inline-start" strokeWidth={2} />
            View in Contract Lifecycle
          </a>
        </Button>
      </div>

      {/* Timeline visualization */}
      <div className="mb-4">
        <ReassignmentTimeline reassignment={r} />
      </div>

      <Separator className="my-4" />

      {/* Detail grid */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 overflow-hidden lg:grid-cols-3">
        {/* Reassignment ID */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Reassignment ID
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <span className="font-mono text-xs">
              {truncateId(r.reassignmentId)}
            </span>
            <CopyButton text={r.reassignmentId} label="Copy Reassignment ID" />
          </div>
        </div>

        {/* Contract ID */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Contract ID
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <span className="font-mono text-xs">
              {truncateId(r.contractId)}
            </span>
            <CopyButton text={r.contractId} label="Copy Contract ID" />
          </div>
        </div>

        {/* Template */}
        <div className="min-w-0 overflow-hidden">
          <div className="text-xs font-medium text-muted-foreground">
            Template
          </div>
          <div className="mt-0.5 flex items-center gap-1 min-w-0">
            <HugeiconsIcon icon={File01Icon} strokeWidth={2} className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono text-xs" title={formatTemplateId(r.templateId)}>
              {formatTemplateId(r.templateId)}
            </span>
          </div>
        </div>

        {/* Source Synchronizer */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Source Synchronizer
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <span className="font-mono text-xs">
              {truncateId(r.sourceSynchronizer, 12)}
            </span>
            <CopyButton
              text={r.sourceSynchronizer}
              label="Copy Source Synchronizer ID"
            />
          </div>
        </div>

        {/* Target Synchronizer */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Target Synchronizer
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <span className="font-mono text-xs">
              {truncateId(r.targetSynchronizer, 12)}
            </span>
            <CopyButton
              text={r.targetSynchronizer}
              label="Copy Target Synchronizer ID"
            />
          </div>
        </div>

        {/* Latency */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Latency
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-3 text-muted-foreground" />
            <span className="font-mono text-xs">
              {r.latencyMs !== undefined
                ? r.latencyMs < 1000
                  ? `${r.latencyMs}ms`
                  : `${(r.latencyMs / 1000).toFixed(2)}s`
                : "--"}
            </span>
          </div>
        </div>

        {/* Unassigned At */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Unassigned At
          </div>
          <div className="mt-0.5 font-mono text-xs">
            {r.unassignedAt
              ? new Date(r.unassignedAt).toLocaleString()
              : "--"}
          </div>
        </div>

        {/* Assigned At */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Assigned At
          </div>
          <div className="mt-0.5 font-mono text-xs">
            {r.assignedAt
              ? new Date(r.assignedAt).toLocaleString()
              : "--"}
          </div>
        </div>

        {/* Status */}
        <div>
          <div className="text-xs font-medium text-muted-foreground">
            Status
          </div>
          <div className="mt-0.5">
            <StatusBadge status={r.status} />
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      {/* Note about logical synchronizer upgrades */}
      <Alert>
        <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4" />
        <AlertDescription className="text-xs">
          Synchronizer IDs may change during logical upgrades while
          representing the same logical synchronizer. Check your synchronizer
          configuration for ID mappings if values look unfamiliar.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge (inline helper)
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: Reassignment["status"] }) {
  const config: Record<
    Reassignment["status"],
    { label: string; className: string }
  > = {
    unassigned: {
      label: "Unassigned",
      className:
        "border-secondary-foreground/50 bg-secondary/10 text-secondary-foreground",
    },
    in_flight: {
      label: "In Flight",
      className:
        "border-accent-foreground/50 bg-accent/10 text-accent-foreground",
    },
    assigned: {
      label: "Assigned",
      className:
        "border-primary/50 bg-primary/10 text-primary",
    },
    failed: {
      label: "Failed",
      className: "border-destructive/50 bg-destructive/10 text-destructive",
    },
  };

  const c = config[status];
  return (
    <Badge variant="outline" className={`text-[10px] ${c.className}`}>
      {c.label}
    </Badge>
  );
}
