import React, { useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlugSocketIcon,
  Delete02Icon,
  Share01Icon,
  UserGroupIcon,
  FileZipIcon,
  Clock01Icon,
  PulseRectangle01Icon,
  PackageIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { truncateId } from "@/lib/utils";
import type { Sandbox } from "@/lib/types";
import { useDeleteSandbox } from "../hooks";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  Sandbox["status"],
  { label: string; className: string; icon: React.ReactNode }
> = {
  provisioning: {
    label: "Provisioning",
    className:
      "border-secondary-foreground/50 bg-secondary/10 text-secondary-foreground",
    icon: <HugeiconsIcon icon={PulseRectangle01Icon} strokeWidth={2} className="size-3 animate-pulse" />,
  },
  running: {
    label: "Running",
    className:
      "border-primary/50 bg-primary/10 text-primary",
    icon: <div className="size-2 rounded-full bg-primary animate-pulse" />,
  },
  stopped: {
    label: "Stopped",
    className:
      "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
    icon: <div className="size-2 rounded-full bg-muted-foreground" />,
  },
  error: {
    label: "Error",
    className:
      "border-destructive/50 bg-destructive/10 text-destructive",
    icon: <div className="size-2 rounded-full bg-destructive" />,
  },
};

function StatusBadge({ status }: { status: Sandbox["status"] }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge
      variant="outline"
      className={cn("flex items-center gap-1.5 text-[10px]", config.className)}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Sandbox Card
// ---------------------------------------------------------------------------

interface SandboxCardProps {
  sandbox: Sandbox;
  onSelect: (sandbox: Sandbox) => void;
  onConnect: (sandbox: Sandbox) => void;
  onDelete: (sandbox: Sandbox) => void;
  onShare: (sandbox: Sandbox) => void;
}

function SandboxCard({
  sandbox,
  onSelect,
  onConnect,
  onDelete,
  onShare,
}: SandboxCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteSandbox = useDeleteSandbox();

  const handleConfirmDelete = useCallback(async () => {
    await deleteSandbox.mutateAsync(sandbox.id);
    onDelete(sandbox);
    setShowDeleteConfirm(false);
  }, [deleteSandbox, onDelete, sandbox]);

  return (
    <TooltipProvider>
      <Card
        className="cursor-pointer transition-shadow hover:shadow-md"
        onClick={() => onSelect(sandbox)}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <StatusBadge status={sandbox.status} />
            {sandbox.profilingEnabled && (
              <Badge variant="outline" className="text-[10px]">
                <HugeiconsIcon icon={PulseRectangle01Icon} data-icon="inline-start" strokeWidth={2} />
                Profiling
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-2 pb-3">
          {/* Sandbox ID */}
          <div>
            <div className="text-[10px] font-medium text-muted-foreground">
              Sandbox ID
            </div>
            <div className="font-mono text-xs">
              {truncateId(sandbox.id, 12)}
            </div>
          </div>

          {/* Ledger API */}
          <div>
            <div className="text-[10px] font-medium text-muted-foreground">
              Ledger API
            </div>
            <div className="font-mono text-xs text-primary">
              {sandbox.ledgerApiEndpoint}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} className="size-3" />
                  <span>{sandbox.parties.length}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {sandbox.parties.length} parties allocated
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={FileZipIcon} strokeWidth={2} className="size-3" />
                  <span>{sandbox.uploadedDars.length}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {sandbox.uploadedDars.length} DARs uploaded
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-3" />
                  <span>
                    {new Date(sandbox.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Created {new Date(sandbox.createdAt).toLocaleString()}
              </TooltipContent>
            </Tooltip>
          </div>
        </CardContent>

        <CardFooter className="gap-1.5 border-t pt-3">
          <Button
            variant="default"
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={sandbox.status !== "running"}
            onClick={(e) => {
              e.stopPropagation();
              onConnect(sandbox);
            }}
          >
            <HugeiconsIcon icon={PlugSocketIcon} data-icon="inline-start" strokeWidth={2} />
            Connect
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Share sandbox URL"
                onClick={(e) => {
                  e.stopPropagation();
                  onShare(sandbox);
                }}
              >
                <HugeiconsIcon icon={Share01Icon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Share sandbox URL</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                aria-label="Delete sandbox"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete sandbox</TooltipContent>
          </Tooltip>
        </CardFooter>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sandbox</DialogTitle>
            <DialogDescription>
              This will permanently tear down sandbox{" "}
              <span className="font-mono">{truncateId(sandbox.id, 12)}</span>{" "}
              and all its data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteSandbox.isPending}
            >
              {deleteSandbox.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function SandboxCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-24" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pb-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </CardContent>
      <CardFooter className="border-t pt-3">
        <Skeleton className="h-7 w-full" />
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface SandboxListProps {
  sandboxes: Sandbox[] | undefined;
  isLoading: boolean;
  onSelect: (sandbox: Sandbox) => void;
  onConnect: (sandbox: Sandbox) => void;
  onDelete: (sandbox: Sandbox) => void;
  onShare: (sandbox: Sandbox) => void;
}

export function SandboxList({
  sandboxes,
  isLoading,
  onSelect,
  onConnect,
  onDelete,
  onShare,
}: SandboxListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SandboxCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!sandboxes || sandboxes.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={PackageIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No sandboxes</EmptyTitle>
          <EmptyDescription>Create one to start debugging!</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {sandboxes.map((sandbox) => (
        <SandboxCard
          key={sandbox.id}
          sandbox={sandbox}
          onSelect={onSelect}
          onConnect={onConnect}
          onDelete={onDelete}
          onShare={onShare}
        />
      ))}
    </div>
  );
}
