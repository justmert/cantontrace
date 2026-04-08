import React, { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
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
  InformationCircleIcon,
  UserGroupIcon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
// Status helpers
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

function statusBadgeClass(s: Sandbox["status"]): string {
  switch (s) {
    case "running":
      return "border-event-create/50 bg-event-create/10 text-event-create";
    case "provisioning":
      return "border-amber-400/50 bg-amber-400/10 text-amber-600";
    case "stopped":
      return "border-muted-foreground/30 bg-muted/50 text-muted-foreground";
    case "error":
      return "border-destructive/50 bg-destructive/10 text-destructive";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Sidebar Card
// ---------------------------------------------------------------------------

function SidebarRow({
  sandbox,
  isSelected,
  onSelect,
}: {
  sandbox: Sandbox;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted/50"
      )}
    >
      <StatusDot status={sandbox.status} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {sandbox.name || sandbox.ledgerApiEndpoint}
        </span>
        <span className="text-xs text-muted-foreground">
          {sandbox.ledgerApiEndpoint} · {sandbox.parties.length}p · {sandbox.uploadedDars.length}d
        </span>
      </div>
      <Badge
        variant="outline"
        className={cn("shrink-0 text-xs px-1.5 py-0", statusBadgeClass(sandbox.status))}
      >
        {statusLabel(sandbox.status)}
      </Badge>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel — Info Tab
// ---------------------------------------------------------------------------

function InfoTab({
  sandbox,
  onConnect,
  onReset,
  onDelete,
  onShare,
  connectError,
  isConnecting,
  isConnected,
}: {
  sandbox: Sandbox;
  onConnect: () => void;
  onReset: () => void;
  onDelete: () => void;
  onShare: () => void;
  connectError: string | null;
  isConnecting: boolean;
  isConnected: boolean;
}) {
  const portMatch = sandbox.ledgerApiEndpoint.match(/:(\d+)/);
  const port = portMatch ? portMatch[1] : "N/A";

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted-foreground/50 mb-1">Sandbox ID</div>
          <IdBadge id={sandbox.id} truncateLen={20} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground/50 mb-1">Status</div>
          <Badge
            variant="outline"
            className={cn("text-xs", statusBadgeClass(sandbox.status))}
          >
            <StatusDot status={sandbox.status} />
            {statusLabel(sandbox.status)}
          </Badge>
        </div>
        <div>
          <div className="text-xs text-muted-foreground/50 mb-1">Endpoint</div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-primary">
              {sandbox.ledgerApiEndpoint}
            </span>
            <CopyButton text={sandbox.ledgerApiEndpoint} size="xs" />
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground/50 mb-1">Port</div>
          <span className="font-mono text-xs">{port}</span>
        </div>
        <div>
          <div className="text-xs text-muted-foreground/50 mb-1">Created</div>
          <span className="text-xs">
            {formatTimestamp(sandbox.createdAt, "datetime")}
          </span>
        </div>
        <div>
          <div className="text-xs text-muted-foreground/50 mb-1">Profiling</div>
          {sandbox.profilingEnabled ? (
            <Badge className="bg-primary/15 text-primary text-xs">Enabled</Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              Disabled
            </Badge>
          )}
        </div>
      </div>

      {connectError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          <HugeiconsIcon
            icon={AlertCircleIcon}
            strokeWidth={2}
            className="mt-0.5 size-3.5 shrink-0"
          />
          <div>
            <p className="font-medium">Connection failed</p>
            <p className="mt-0.5">{connectError}</p>
          </div>
        </div>
      )}

      <Separator />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={sandbox.status !== "running" || isConnecting || isConnected}
          variant={isConnected ? "secondary" : "default"}
          onClick={onConnect}
        >
          <HugeiconsIcon
            icon={Plug01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {isConnected ? "Connected" : isConnecting ? "Connecting..." : "Connect"}
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onReset}>
          <HugeiconsIcon
            icon={RotateLeft01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Reset
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <HugeiconsIcon
            icon={Delete02Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Delete
        </Button>
        <Button variant="outline" size="sm" className="ml-auto h-8 text-xs" onClick={onShare}>
          <HugeiconsIcon
            icon={Share01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Share
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel — Parties Tab
// ---------------------------------------------------------------------------

function PartiesTab({ sandbox, disabled }: { sandbox: Sandbox; disabled?: boolean }) {
  const connectionStore = useConnectionStore();
  const [newPartyName, setNewPartyName] = useState("");
  const [partyError, setPartyError] = useState<string | null>(null);
  const allocateParty = useAllocateParty();

  const handleAllocateParty = useCallback(async () => {
    const trimmed = newPartyName.trim();
    if (!trimmed) return;
    setPartyError(null);
    try {
      await allocateParty.mutateAsync({
        sandboxId: sandbox.id,
        partyName: trimmed,
      });
      setNewPartyName("");
      // Refresh bootstrap so new party appears across the app
      connectionStore.refreshBootstrap();
    } catch (err) {
      setPartyError(
        err instanceof Error ? err.message : "Failed to allocate party"
      );
    }
  }, [newPartyName, sandbox.id, allocateParty]);

  return (
    <div className="flex flex-col gap-4 p-4">
      {sandbox.parties.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {sandbox.parties.map((p) => (
            <PartyBadge key={p} party={p} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/50">No parties allocated</p>
      )}

      {partyError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          <HugeiconsIcon
            icon={AlertCircleIcon}
            strokeWidth={2}
            className="mt-0.5 size-3.5 shrink-0"
          />
          <span>{partyError}</span>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          className="flex-1 text-xs"
          placeholder="Party name"
          value={newPartyName}
          onChange={(e) => setNewPartyName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAllocateParty();
          }}
        />
        <Button
          variant="outline"
          size="xs"
          onClick={handleAllocateParty}
          disabled={!newPartyName.trim() || allocateParty.isPending || disabled}
        >
          <HugeiconsIcon
            icon={Add01Icon}
            strokeWidth={2}
            data-icon="inline-start"
            className="size-3"
          />
          Add
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel — DARs Tab
// ---------------------------------------------------------------------------

function DarsTab({ sandbox, disabled }: { sandbox: Sandbox; disabled?: boolean }) {
  const connectionStore = useConnectionStore();
  const [lastUploadedDar, setLastUploadedDar] = useState<string | undefined>();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadDar = useUploadDar();

  const handleUploadDar = useCallback(
    async (file: File) => {
      setUploadError(null);
      try {
        await uploadDar.mutateAsync({ sandboxId: sandbox.id, dar: file });
        setLastUploadedDar(file.name);
        // Refresh bootstrap so new packages appear across the app
        connectionStore.refreshBootstrap();
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Failed to upload DAR"
        );
      }
    },
    [sandbox.id, uploadDar]
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      {sandbox.uploadedDars.length > 0 ? (
        <div className="flex flex-col gap-1">
          {sandbox.uploadedDars.map((dar, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded bg-muted/20 px-2 py-1.5"
            >
              <HugeiconsIcon
                icon={FileZipIcon}
                strokeWidth={2}
                className="size-3.5 text-muted-foreground"
              />
              <IdBadge id={dar} truncateLen={24} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/50">No DARs uploaded</p>
      )}

      <DarUpload
        onUpload={handleUploadDar}
        isUploading={uploadDar.isPending}
        lastUploadedFileName={lastUploadedDar}
        uploadError={uploadError}
      />
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null
  );
  const [showResetConfirm, setShowResetConfirm] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const pendingSelectId = useRef<string | null>(null);
  const deleteSandbox = useDeleteSandbox();
  const resetSandbox = useResetSandbox();
  const connectionStore = useConnectionStore();
  const navigate = useNavigate();

  // Auto-select: connected sandbox first, then first available
  useEffect(() => {
    if (!sandboxes || sandboxes.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && sandboxes.some(s => s.id === selectedId)) return;
    const connectedId = connectionStore.config?.sandboxId;
    if (connectedId && sandboxes.some(s => s.id === connectedId)) {
      setSelectedId(connectedId);
    } else {
      setSelectedId(sandboxes[0].id);
    }
  }, [sandboxes, selectedId, connectionStore.config?.sandboxId]);

  const selectedSandbox = sandboxes?.find((s) => s.id === selectedId) ?? null;
  const hasSandboxes = sandboxes && sandboxes.length > 0;

  const handleConnect = useCallback(
    async (sandbox: Sandbox) => {
      setConnectError(null);
      setIsConnecting(true);
      try {
        connectionStore.disconnect();
        // Canton sandbox needs time to initialize all gRPC services after port opens.
        // Retry up to 5 times with increasing delay.
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise((r) => setTimeout(r, attempt === 0 ? 500 : 2000));
          try {
            await connectionStore.connect({
              ledgerApiEndpoint: sandbox.ledgerApiEndpoint,
              sandboxId: sandbox.id,
            });
            navigate({ to: "/" });
            return;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            // If it's a "not initialized" error, Canton is still starting — retry
            if (!lastError.message.includes("not initialized") && !lastError.message.includes("UNAVAILABLE")) {
              break; // Non-retryable error
            }
          }
        }
        setConnectError(lastError?.message ?? "Connection failed after retries.");
      } catch (err) {
        setConnectError(
          err instanceof Error ? err.message : "Connection failed."
        );
      } finally {
        setIsConnecting(false);
      }
    },
    [connectionStore, navigate]
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

  // Auto-select a newly created sandbox once it appears in the list
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
      const url =
        selectedSandbox.shareUrl ??
        `${window.location.origin}/sandbox/${selectedSandbox.id}`;
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API may not be available
    }
  }, [selectedSandbox]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={ServerStackIcon}
        title="Sandbox"
        subtitle="Manage Canton sandbox instances"
      >
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <HugeiconsIcon
            icon={Add01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Create Sandbox
        </Button>
      </PageHeader>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
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
        <div className="flex flex-1 gap-4 overflow-hidden p-4">
          <div className="flex w-72 shrink-0 flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border p-3">
                <Skeleton className="mb-2 h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
          <div className="flex-1 rounded-xl border bg-card/30 p-8">
            <Skeleton className="mx-auto h-4 w-48" />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hasSandboxes && !error && (
        <div className="flex flex-1 items-center justify-center p-4">
          <Empty className="py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={PackageIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>No sandboxes</EmptyTitle>
              <EmptyDescription>
                Create a Canton sandbox to start debugging.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setShowCreateDialog(true)}>
                <HugeiconsIcon
                  icon={Add01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Create Sandbox
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      )}

      {/* Sidebar + Detail layout */}
      {!isLoading && hasSandboxes && (
        <div className="flex flex-1 gap-4 overflow-hidden p-4">
          {/* Left sidebar */}
          <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border bg-card/30">
            <div className="shrink-0 border-b p-2">
              <Button
                size="sm"
                className="w-full"
                onClick={() => setShowCreateDialog(true)}
              >
                <HugeiconsIcon
                  icon={Add01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Create Sandbox
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex flex-col divide-y divide-border/30">
                {sandboxes.map((sb) => (
                  <SidebarRow
                    key={sb.id}
                    sandbox={sb}
                    isSelected={selectedId === sb.id}
                    onSelect={() =>
                      setSelectedId((prev) => (prev === sb.id ? null : sb.id))
                    }
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right detail panel */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border bg-card/30 ring-1 ring-border/30">
            {!selectedSandbox ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
                  <HugeiconsIcon
                    icon={ServerStackIcon}
                    strokeWidth={1.5}
                    className="size-10"
                  />
                  <span className="text-sm">
                    Select a sandbox to view details
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                {/* Header with name + endpoint + actions */}
                <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <StatusDot status={selectedSandbox.status} />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {selectedSandbox.name || `Sandbox ${selectedSandbox.ledgerApiEndpoint}`}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {selectedSandbox.ledgerApiEndpoint}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={selectedSandbox.status !== "running" || isConnecting || (connectionStore.config?.sandboxId === selectedSandbox.id && connectionStore.status === "connected")}
                      variant={(connectionStore.config?.sandboxId === selectedSandbox.id && connectionStore.status === "connected") ? "secondary" : "default"}
                      onClick={() => handleConnect(selectedSandbox)}
                    >
                      <HugeiconsIcon icon={Plug01Icon} strokeWidth={2} data-icon="inline-start" />
                      {(connectionStore.config?.sandboxId === selectedSandbox.id && connectionStore.status === "connected") ? "Connected" : isConnecting ? "Connecting..." : "Connect"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={selectedSandbox.status !== "running"} onClick={() => setShowResetConfirm(selectedSandbox.id)}>Reset</Button>
                    <Button size="sm" variant="outline" className="text-destructive" disabled={selectedSandbox.status === "provisioning"} onClick={() => setShowDeleteConfirm(selectedSandbox.id)}>Delete</Button>
                  </div>
                </div>

                {/* All sections visible, scrollable */}
                <div className="flex-1 overflow-y-auto">
                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-4 border-b border-border/30 px-4 py-4 sm:grid-cols-4">
                    <div>
                      <span className="text-xs text-muted-foreground">Status</span>
                      <div className="mt-1"><Badge variant="outline" className={cn("text-xs", statusBadgeClass(selectedSandbox.status))}><StatusDot status={selectedSandbox.status} />{statusLabel(selectedSandbox.status)}</Badge></div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Port</span>
                      <p className="mt-1 font-mono text-sm">{selectedSandbox.ledgerApiEndpoint.split(":").pop()}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Created</span>
                      <p className="mt-1 text-sm">{formatTimestamp(selectedSandbox.createdAt, "datetime")}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Sandbox ID</span>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{selectedSandbox.id.slice(0, 12)}...</p>
                    </div>
                  </div>

                  {connectError && (
                    <div className="border-b border-border/30 px-4 py-3">
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        {connectError}
                      </div>
                    </div>
                  )}

                  {/* Parties section */}
                  <div className="border-b border-border/30">
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Parties ({selectedSandbox.parties.length})</span>
                    </div>
                    <PartiesTab sandbox={selectedSandbox} disabled={selectedSandbox.status !== "running"} />
                  </div>

                  {/* DARs section */}
                  <div className="border-b border-border/30">
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <HugeiconsIcon icon={FileZipIcon} strokeWidth={2} className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">DARs ({selectedSandbox.uploadedDars.length})</span>
                    </div>
                    <DarsTab sandbox={selectedSandbox} disabled={selectedSandbox.status !== "running"} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Sandbox</DialogTitle>
            <DialogDescription>
              Spin up a local Canton sandbox for debugging and testing.
            </DialogDescription>
          </DialogHeader>
          <CreateSandboxForm
            onCreated={handleCreated}
            onClose={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setShowDeleteConfirm(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Delete Sandbox</DialogTitle>
            <DialogDescription>
              This will permanently tear down this sandbox and all its data.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              {deleteError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteConfirm(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteSandbox.isPending}
              onClick={async () => {
                const id = showDeleteConfirm;
                if (!id) return;
                setDeleteError(null);
                try {
                  await deleteSandbox.mutateAsync(id);
                  // If the deleted sandbox was the one we're connected to, disconnect
                  if (connectionStore.config?.sandboxId === id) {
                    connectionStore.disconnect();
                  }
                  if (selectedId === id) setSelectedId(null);
                  setShowDeleteConfirm(null);
                } catch (err) {
                  setDeleteError(
                    err instanceof Error
                      ? err.message
                      : "Failed to delete sandbox"
                  );
                }
              }}
            >
              {deleteSandbox.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation */}
      <Dialog
        open={!!showResetConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setShowResetConfirm(null);
            setResetError(null);
          }
        }}
      >
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Reset Sandbox</DialogTitle>
            <DialogDescription>
              This will reset to a clean state. DARs and parties are preserved.
            </DialogDescription>
          </DialogHeader>
          {resetError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              {resetError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowResetConfirm(null);
                setResetError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={resetSandbox.isPending}
              onClick={async () => {
                const id = showResetConfirm;
                if (!id) return;
                setResetError(null);
                try {
                  await resetSandbox.mutateAsync(id);
                  setShowResetConfirm(null);
                } catch (err) {
                  setResetError(
                    err instanceof Error
                      ? err.message
                      : "Failed to reset sandbox"
                  );
                }
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
