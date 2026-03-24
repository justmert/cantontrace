import React, { useState, useCallback, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ServerStackIcon,
  PlugSocketIcon,
  Delete02Icon,
  UserGroupIcon,
  FileZipIcon,
  Clock01Icon,
  PulseRectangle01Icon,
  Copy01Icon,
  Tick01Icon,
  RotateLeft01Icon,
  Share01Icon,
  Add01Icon,
  PackageIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn, truncateId } from "@/lib/utils";
import type { Sandbox } from "@/lib/types";
import { CreateSandboxForm } from "./components/create-sandbox";
import { DarUpload } from "./components/dar-upload";
import {
  useSandboxes,
  useDeleteSandbox,
  useResetSandbox,
  useUploadDar,
  useAllocateParty,
} from "./hooks";

// ---------------------------------------------------------------------------
// Status badge (shared)
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  Sandbox["status"],
  { label: string; className: string; icon: React.ReactNode }
> = {
  provisioning: {
    label: "Provisioning",
    className:
      "border-secondary-foreground/50 bg-secondary/10 text-secondary-foreground",
    icon: (
      <HugeiconsIcon
        icon={PulseRectangle01Icon}
        strokeWidth={2}
        className="size-3 animate-pulse"
      />
    ),
  },
  running: {
    label: "Running",
    className: "border-primary/50 bg-primary/10 text-primary",
    icon: <div className="size-2 rounded-full bg-primary animate-pulse" />,
  },
  stopped: {
    label: "Stopped",
    className: "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
    icon: <div className="size-2 rounded-full bg-muted-foreground" />,
  },
  error: {
    label: "Error",
    className: "border-destructive/50 bg-destructive/10 text-destructive",
    icon: <div className="size-2 rounded-full bg-destructive" />,
  },
};

function StatusBadge({ status }: { status: Sandbox["status"] }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        "flex items-center gap-1.5 text-[10px]",
        config.className
      )}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silently ignore
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCopy}
            className="inline-flex size-6 items-center justify-center rounded hover:bg-muted"
            aria-label={label ?? "Copy to clipboard"}
          >
            {copied ? (
              <HugeiconsIcon
                icon={Tick01Icon}
                strokeWidth={2}
                className="size-3.5 text-primary"
              />
            ) : (
              <HugeiconsIcon
                icon={Copy01Icon}
                strokeWidth={2}
                className="size-3.5 text-muted-foreground"
              />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {copied ? "Copied!" : label ?? "Copy"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Sandbox Card (expanded, full-width style)
// ---------------------------------------------------------------------------

interface SandboxCardProps {
  sandbox: Sandbox;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onConnect: (sandbox: Sandbox) => void;
  onDelete: (sandbox: Sandbox) => void;
}

function SandboxCard({
  sandbox,
  isExpanded,
  onToggleExpand,
  onConnect,
  onDelete,
}: SandboxCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [newPartyName, setNewPartyName] = useState("");
  const [lastUploadedDar, setLastUploadedDar] = useState<string | undefined>();
  const deleteSandbox = useDeleteSandbox();
  const resetSandbox = useResetSandbox();
  const uploadDar = useUploadDar();
  const allocateParty = useAllocateParty();

  const handleConfirmDelete = useCallback(async () => {
    await deleteSandbox.mutateAsync(sandbox.id);
    onDelete(sandbox);
    setShowDeleteConfirm(false);
  }, [deleteSandbox, onDelete, sandbox]);

  const handleAllocateParty = useCallback(async () => {
    const trimmed = newPartyName.trim();
    if (!trimmed) return;
    await allocateParty.mutateAsync({
      sandboxId: sandbox.id,
      partyName: trimmed,
    });
    setNewPartyName("");
  }, [newPartyName, sandbox.id, allocateParty]);

  const handleUploadDar = useCallback(
    async (file: File) => {
      await uploadDar.mutateAsync({ sandboxId: sandbox.id, dar: file });
      setLastUploadedDar(file.name);
    },
    [sandbox.id, uploadDar]
  );

  const handleShare = useCallback(async () => {
    try {
      const url =
        sandbox.shareUrl ??
        `${window.location.origin}/sandbox/${sandbox.id}`;
      await navigator.clipboard.writeText(url);
    } catch {
      // silently ignore
    }
  }, [sandbox]);

  return (
    <TooltipProvider>
      <Card size="sm">
        {/* Card header row */}
        <CardHeader
          className="cursor-pointer"
          onClick={() => onToggleExpand(sandbox.id)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusBadge status={sandbox.status} />
              {sandbox.profilingEnabled && (
                <Badge variant="outline" className="text-[10px]">
                  <HugeiconsIcon
                    icon={PulseRectangle01Icon}
                    data-icon="inline-start"
                    strokeWidth={2}
                  />
                  Profiling
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent
          className="cursor-pointer"
          onClick={() => onToggleExpand(sandbox.id)}
        >
          <div className="flex flex-col gap-2">
            {/* Endpoint */}
            <div>
              <div className="text-[10px] font-medium text-muted-foreground">
                Ledger API
              </div>
              <div className="flex items-center gap-1">
                <span className="font-mono text-xs text-primary">
                  {sandbox.ledgerApiEndpoint}
                </span>
                <CopyButton
                  text={sandbox.ledgerApiEndpoint}
                  label="Copy endpoint"
                />
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <HugeiconsIcon
                      icon={UserGroupIcon}
                      strokeWidth={2}
                      className="size-3"
                    />
                    <span>{sandbox.parties.length} parties</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {sandbox.parties.length > 0
                    ? sandbox.parties.join(", ")
                    : "No parties allocated"}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <HugeiconsIcon
                      icon={FileZipIcon}
                      strokeWidth={2}
                      className="size-3"
                    />
                    <span>{sandbox.uploadedDars.length} DARs</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {sandbox.uploadedDars.length} DARs uploaded
                </TooltipContent>
              </Tooltip>

              <div className="flex items-center gap-1">
                <HugeiconsIcon
                  icon={Clock01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
                <span>
                  {new Date(sandbox.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Actions row */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs"
                disabled={sandbox.status !== "running"}
                onClick={(e) => {
                  e.stopPropagation();
                  onConnect(sandbox);
                }}
              >
                <HugeiconsIcon
                  icon={PlugSocketIcon}
                  data-icon="inline-start"
                  strokeWidth={2}
                />
                Connect
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
              >
                <HugeiconsIcon
                  icon={Delete02Icon}
                  data-icon="inline-start"
                  strokeWidth={2}
                />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>

        {/* Expanded detail section */}
        {isExpanded && (
          <>
            <Separator className="mx-6" />
            <CardContent className="flex flex-col gap-4">
              {/* Sandbox ID */}
              <div>
                <div className="text-[10px] font-medium text-muted-foreground">
                  Sandbox ID
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs">
                    {sandbox.id}
                  </span>
                  <CopyButton text={sandbox.id} label="Copy Sandbox ID" />
                </div>
              </div>

              {/* Parties */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <HugeiconsIcon
                    icon={UserGroupIcon}
                    strokeWidth={2}
                    className="size-3.5 text-muted-foreground"
                  />
                  Parties ({sandbox.parties.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sandbox.parties.length > 0 ? (
                    sandbox.parties.map((party) => (
                      <Badge
                        key={party}
                        variant="secondary"
                        className="max-w-full font-mono text-xs"
                      >
                        <span className="truncate">{party}</span>
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No parties allocated
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    className="flex-1 text-xs"
                    placeholder="Party name"
                    value={newPartyName}
                    onChange={(e) => setNewPartyName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAllocateParty();
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAllocateParty();
                    }}
                    disabled={
                      !newPartyName.trim() || allocateParty.isPending
                    }
                  >
                    <HugeiconsIcon
                      icon={Add01Icon}
                      data-icon="inline-start"
                      strokeWidth={2}
                    />
                    Allocate
                  </Button>
                </div>
              </div>

              {/* DARs */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <HugeiconsIcon
                    icon={FileZipIcon}
                    strokeWidth={2}
                    className="size-3.5 text-muted-foreground"
                  />
                  DARs ({sandbox.uploadedDars.length})
                </div>
                {sandbox.uploadedDars.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {sandbox.uploadedDars.map((dar, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-md border bg-muted/20 px-2.5 py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <HugeiconsIcon
                            icon={FileZipIcon}
                            strokeWidth={2}
                            className="size-3.5 text-muted-foreground"
                          />
                          <span className="font-mono text-xs">
                            {truncateId(dar, 16)}
                          </span>
                        </div>
                        <CopyButton text={dar} label="Copy package ID" />
                      </div>
                    ))}
                  </div>
                )}
                <div onClick={(e) => e.stopPropagation()}>
                  <DarUpload
                    onUpload={handleUploadDar}
                    isUploading={uploadDar.isPending}
                    lastUploadedFileName={lastUploadedDar}
                  />
                </div>
              </div>

              {/* Bottom actions */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowResetConfirm(true);
                  }}
                >
                  <HugeiconsIcon
                    icon={RotateLeft01Icon}
                    data-icon="inline-start"
                    strokeWidth={2}
                  />
                  Reset
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShare();
                  }}
                >
                  <HugeiconsIcon
                    icon={Share01Icon}
                    data-icon="inline-start"
                    strokeWidth={2}
                  />
                  Share
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sandbox</DialogTitle>
            <DialogDescription>
              This will permanently tear down sandbox{" "}
              <span className="font-mono">
                {truncateId(sandbox.id, 12)}
              </span>{" "}
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

      {/* Reset confirmation dialog */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Sandbox</DialogTitle>
            <DialogDescription>
              This will reset the sandbox to a clean state, removing all
              transactions and contract state. Uploaded DARs and parties will be
              preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResetConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  await resetSandbox.mutateAsync(sandbox.id);
                } catch {
                  // silently ignore
                }
                setShowResetConfirm(false);
              }}
              disabled={resetSandbox.isPending}
            >
              {resetSandbox.isPending ? "Resetting..." : "Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Sandbox Card Skeleton
// ---------------------------------------------------------------------------

function SandboxCardSkeleton() {
  return (
    <Card size="sm">
      <CardHeader>
        <Skeleton className="h-5 w-24" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-24" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SandboxManagerPage() {
  const { data: sandboxes, isLoading, error } = useSandboxes();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pendingSelectId = useRef<string | null>(null);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleConnect = useCallback((sandbox: Sandbox) => {
    console.log("Connecting to sandbox:", sandbox.ledgerApiEndpoint);
  }, []);

  const handleDelete = useCallback(
    (sandbox: Sandbox) => {
      if (expandedId === sandbox.id) {
        setExpandedId(null);
      }
    },
    [expandedId]
  );

  const handleCreated = useCallback(
    (sandboxId: string) => {
      pendingSelectId.current = sandboxId;
      const created = sandboxes?.find((s) => s.id === sandboxId);
      if (created) {
        setExpandedId(sandboxId);
        pendingSelectId.current = null;
      }
    },
    [sandboxes]
  );

  // Auto-expand newly created sandbox once it appears in the list
  React.useEffect(() => {
    if (!sandboxes || !pendingSelectId.current) return;
    const pending = sandboxes.find((s) => s.id === pendingSelectId.current);
    if (pending) {
      setExpandedId(pending.id);
      pendingSelectId.current = null;
    }
  }, [sandboxes]);

  const hasSandboxes = sandboxes && sandboxes.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Page header -- standard pattern */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <HugeiconsIcon
          icon={ServerStackIcon}
          strokeWidth={2}
          className="size-5 text-primary"
        />
        <div>
          <h1 className="text-lg font-semibold">Sandbox Manager</h1>
          <p className="text-xs text-muted-foreground">
            Create, manage, and connect to Canton sandbox instances
          </p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-4">
          {/* Error state */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              <p className="font-medium">Failed to load sandboxes</p>
              <p className="mt-1 text-xs">
                {error instanceof Error
                  ? error.message
                  : "An unexpected error occurred"}
              </p>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SandboxCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Empty state: show create form as hero */}
          {!isLoading && !hasSandboxes && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={PackageIcon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>Create your first sandbox</EmptyTitle>
                <EmptyDescription>
                  Spin up a local Canton sandbox for debugging and testing Daml
                  applications.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <CreateSandboxForm onCreated={handleCreated} />
              </EmptyContent>
            </Empty>
          )}

          {/* Sandbox list + create form when sandboxes exist */}
          {!isLoading && hasSandboxes && (
            <>
              {/* Sandbox grid */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {sandboxes.map((sandbox) => (
                  <SandboxCard
                    key={sandbox.id}
                    sandbox={sandbox}
                    isExpanded={expandedId === sandbox.id}
                    onToggleExpand={handleToggleExpand}
                    onConnect={handleConnect}
                    onDelete={handleDelete}
                  />
                ))}
              </div>

              {/* Create form at the bottom */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <HugeiconsIcon
                      icon={Add01Icon}
                      strokeWidth={2}
                      className="size-4"
                    />
                    Create New Sandbox
                  </CardTitle>
                  <CardDescription>
                    Spin up a local Canton sandbox for debugging and testing
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CreateSandboxForm onCreated={handleCreated} />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
