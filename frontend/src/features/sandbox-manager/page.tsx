import React, { useState, useCallback, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ServerStackIcon,
  Delete02Icon,
  FileZipIcon,
  RotateLeft01Icon,
  Share01Icon,
  Add01Icon,
  PackageIcon,
  Plug01Icon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/copy-button";
import { IdBadge } from "@/components/id-badge";
import { PartyBadge } from "@/components/party-badge";
import { cn, formatTimestamp } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection-store";
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
// Status
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: Sandbox["status"] }) {
  const cls =
    status === "running"
      ? "bg-event-create"
      : status === "provisioning"
        ? "bg-amber-400 animate-pulse"
        : status === "error"
          ? "bg-destructive"
          : "bg-muted-foreground/50";
  return <div className={cn("size-2 shrink-0 rounded-full", cls)} />;
}

function statusLabel(s: Sandbox["status"]): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Sandbox Row
// ---------------------------------------------------------------------------

function SandboxRow({
  sandbox,
  isSelected,
  onSelect,
  onConnect,
  onDelete,
}: {
  sandbox: Sandbox;
  isSelected: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter") onSelect(); }}
      className={cn(
        "flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30 cursor-pointer",
        isSelected && "bg-primary/5"
      )}
    >
      <StatusDot status={sandbox.status} />

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="font-mono text-sm">{sandbox.ledgerApiEndpoint}</span>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
          {statusLabel(sandbox.status)}
        </Badge>
      </div>

      <div className="hidden items-center gap-5 text-[11px] text-muted-foreground md:flex">
        <span>{sandbox.parties.length} parties</span>
        <span>{sandbox.uploadedDars.length} DARs</span>
        <span>{formatTimestamp(sandbox.createdAt, "datetime")}</span>
      </div>

      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={sandbox.status !== "running"}
          onClick={onConnect}
        >
          <HugeiconsIcon icon={Plug01Icon} strokeWidth={2} data-icon="inline-start" />
          Connect
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete();
          }}
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------

function SandboxDetailPanel({
  sandbox,
  onReset,
  onShare,
}: {
  sandbox: Sandbox;
  onReset: () => void;
  onShare: () => void;
}) {
  const [newPartyName, setNewPartyName] = useState("");
  const [lastUploadedDar, setLastUploadedDar] = useState<string | undefined>();
  const uploadDar = useUploadDar();
  const allocateParty = useAllocateParty();

  const handleAllocateParty = useCallback(async () => {
    const trimmed = newPartyName.trim();
    if (!trimmed) return;
    await allocateParty.mutateAsync({ sandboxId: sandbox.id, partyName: trimmed });
    setNewPartyName("");
  }, [newPartyName, sandbox.id, allocateParty]);

  const handleUploadDar = useCallback(
    async (file: File) => {
      await uploadDar.mutateAsync({ sandboxId: sandbox.id, dar: file });
      setLastUploadedDar(file.name);
    },
    [sandbox.id, uploadDar]
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200 fill-mode-forwards rounded-xl border bg-card/30 ring-1 ring-border/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <StatusDot status={sandbox.status} />
          <span className="text-xs font-medium">{statusLabel(sandbox.status)}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{sandbox.ledgerApiEndpoint}</span>
          {sandbox.profilingEnabled && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">Profiling</Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="xs" onClick={onReset}>
            <HugeiconsIcon icon={RotateLeft01Icon} strokeWidth={2} data-icon="inline-start" className="size-3" />
            Reset
          </Button>
          <Button variant="ghost" size="xs" onClick={onShare}>
            <HugeiconsIcon icon={Share01Icon} strokeWidth={2} data-icon="inline-start" className="size-3" />
            Share
          </Button>
        </div>
      </div>

      {/* Content: 3 columns */}
      <div className="grid gap-px bg-border/20 lg:grid-cols-3">
        {/* Info */}
        <div className="flex flex-col gap-3 bg-background p-4">
          <h4 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">Info</h4>
          <div className="flex flex-col gap-2.5">
            <div>
              <div className="text-[10px] text-muted-foreground/50">Sandbox ID</div>
              <IdBadge id={sandbox.id} truncateLen={20} />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground/50">Endpoint</div>
              <div className="flex items-center gap-1">
                <span className="font-mono text-xs text-primary">{sandbox.ledgerApiEndpoint}</span>
                <CopyButton text={sandbox.ledgerApiEndpoint} size="xs" />
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground/50">Created</div>
              <div className="text-xs">{formatTimestamp(sandbox.createdAt, "datetime")}</div>
            </div>
          </div>
        </div>

        {/* Parties */}
        <div className="flex flex-col gap-3 bg-background p-4">
          <h4 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
            Parties ({sandbox.parties.length})
          </h4>
          {sandbox.parties.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {sandbox.parties.map((p) => <PartyBadge key={p} party={p} />)}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/50">No parties allocated</p>
          )}
          <div className="mt-auto flex gap-2">
            <Input
              className="flex-1 text-xs"
              placeholder="Party name"
              value={newPartyName}
              onChange={(e) => setNewPartyName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAllocateParty(); }}
            />
            <Button
              variant="outline"
              size="xs"
              onClick={handleAllocateParty}
              disabled={!newPartyName.trim() || allocateParty.isPending}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" className="size-3" />
              Add
            </Button>
          </div>
        </div>

        {/* DARs */}
        <div className="flex flex-col gap-3 bg-background p-4">
          <h4 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
            DARs ({sandbox.uploadedDars.length})
          </h4>
          {sandbox.uploadedDars.length > 0 && (
            <div className="flex flex-col gap-1">
              {sandbox.uploadedDars.map((dar, i) => (
                <div key={i} className="flex items-center gap-2 rounded bg-muted/20 px-2 py-1">
                  <HugeiconsIcon icon={FileZipIcon} strokeWidth={2} className="size-3 text-muted-foreground" />
                  <IdBadge id={dar} truncateLen={16} />
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto">
            <DarUpload
              onUpload={handleUploadDar}
              isUploading={uploadDar.isPending}
              lastUploadedFileName={lastUploadedDar}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SandboxManagerPage() {
  const { data: sandboxes, isLoading, error } = useSandboxes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<string | null>(null);
  const pendingSelectId = useRef<string | null>(null);
  const deleteSandbox = useDeleteSandbox();
  const resetSandbox = useResetSandbox();
  const connectionStore = useConnectionStore();

  const selectedSandbox = sandboxes?.find((s) => s.id === selectedId) ?? null;
  const hasSandboxes = sandboxes && sandboxes.length > 0;

  const handleConnect = useCallback(
    async (sandbox: Sandbox) => {
      try {
        // Disconnect first to tear down existing gRPC client
        connectionStore.disconnect();
        // Small delay for backend cleanup
        await new Promise((r) => setTimeout(r, 300));
        await connectionStore.connect({
          ledgerApiEndpoint: sandbox.ledgerApiEndpoint,
          sandboxId: sandbox.id,
        });
      } catch {
        // connection error handled by store
      }
    },
    [connectionStore]
  );

  const handleCreated = useCallback(
    (sandboxId: string) => {
      setShowCreateDialog(false);
      pendingSelectId.current = sandboxId;
      const created = sandboxes?.find((s) => s.id === sandboxId);
      if (created) {
        setSelectedId(sandboxId);
        pendingSelectId.current = null;
      }
    },
    [sandboxes]
  );

  React.useEffect(() => {
    if (!sandboxes || !pendingSelectId.current) return;
    const pending = sandboxes.find((s) => s.id === pendingSelectId.current);
    if (pending) {
      setSelectedId(pending.id);
      pendingSelectId.current = null;
    }
  }, [sandboxes]);

  const handleShare = useCallback(async () => {
    if (!selectedSandbox) return;
    try {
      const url = selectedSandbox.shareUrl ?? `${window.location.origin}/sandbox/${selectedSandbox.id}`;
      await navigator.clipboard.writeText(url);
    } catch {}
  }, [selectedSandbox]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={ServerStackIcon} title="Sandbox" subtitle="Manage Canton sandbox instances">
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          Create Sandbox
        </Button>
      </PageHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">Failed to load sandboxes</p>
            <p className="mt-1 text-xs">{error instanceof Error ? error.message : "An unexpected error occurred"}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="rounded-xl border bg-card/30 ring-1 ring-border/30">
            <div className="flex flex-col divide-y divide-border/20">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <Skeleton className="size-2 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                  <div className="flex-1" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !hasSandboxes && (
          <Empty className="py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={PackageIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>No sandboxes</EmptyTitle>
              <EmptyDescription>Create a Canton sandbox to start debugging.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setShowCreateDialog(true)}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                Create Sandbox
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {/* Sandbox list */}
        {!isLoading && hasSandboxes && (
          <div className="rounded-xl border bg-card/30 ring-1 ring-border/30">
            <div className="flex items-center border-b border-border/30 px-4 py-2.5">
              <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                Sandboxes ({sandboxes.length})
              </h2>
            </div>
            <div className="flex flex-col divide-y divide-border/20">
              {sandboxes.map((sb) => (
                <SandboxRow
                  key={sb.id}
                  sandbox={sb}
                  isSelected={selectedId === sb.id}
                  onSelect={() => setSelectedId(selectedId === sb.id ? null : sb.id)}
                  onConnect={() => handleConnect(sb)}
                  onDelete={async () => {
                    try {
                      await deleteSandbox.mutateAsync(sb.id);
                      if (selectedId === sb.id) setSelectedId(null);
                    } catch (err) {
                      console.error("Delete failed:", err);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Detail */}
        {selectedSandbox && (
          <SandboxDetailPanel
            sandbox={selectedSandbox}
            onReset={() => setShowResetConfirm(selectedSandbox.id)}
            onShare={handleShare}
          />
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Sandbox</DialogTitle>
            <DialogDescription>Spin up a local Canton sandbox for debugging and testing.</DialogDescription>
          </DialogHeader>
          <CreateSandboxForm onCreated={handleCreated} />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={(open) => { if (!open) setShowDeleteConfirm(null); }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Delete Sandbox</DialogTitle>
            <DialogDescription>This will permanently tear down this sandbox and all its data.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteSandbox.isPending}
              onClick={async () => {
                const id = showDeleteConfirm;
                if (!id) return;
                try {
                  await deleteSandbox.mutateAsync(id);
                  if (selectedId === id) setSelectedId(null);
                } catch (err) {
                  console.error("Failed to delete sandbox:", err);
                }
                setShowDeleteConfirm(null);
              }}
            >
              {deleteSandbox.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation */}
      <Dialog open={!!showResetConfirm} onOpenChange={(open) => { if (!open) setShowResetConfirm(null); }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Reset Sandbox</DialogTitle>
            <DialogDescription>This will reset to a clean state. DARs and parties are preserved.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(null)}>Cancel</Button>
            <Button
              disabled={resetSandbox.isPending}
              onClick={async () => {
                const id = showResetConfirm;
                if (!id) return;
                try { await resetSandbox.mutateAsync(id); } catch {}
                setShowResetConfirm(null);
              }}
            >
              {resetSandbox.isPending ? "Resetting..." : "Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
