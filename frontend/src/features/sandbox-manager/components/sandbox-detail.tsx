import { useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlugSocketIcon,
  RotateLeft01Icon,
  Delete02Icon,
  Share01Icon,
  Add01Icon,
  UserGroupIcon,
  FileZipIcon,
  PulseRectangle01Icon,
  Cancel01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";
import { truncateId } from "@/lib/utils";
import type { Sandbox } from "@/lib/types";
import { DarUpload } from "./dar-upload";
import { useDeleteSandbox, useUploadDar, useAllocateParty, useResetSandbox } from "../hooks";

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  Sandbox["status"],
  { label: string; className: string }
> = {
  provisioning: {
    label: "Provisioning",
    className:
      "border-secondary-foreground/50 bg-secondary/10 text-secondary-foreground",
  },
  running: {
    label: "Running",
    className:
      "border-primary/50 bg-primary/10 text-primary",
  },
  stopped: {
    label: "Stopped",
    className: "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
  },
  error: {
    label: "Error",
    className: "border-destructive/50 bg-destructive/10 text-destructive",
  },
};

// ---------------------------------------------------------------------------
// Sandbox Detail Component
// ---------------------------------------------------------------------------

export interface SandboxDetailProps {
  sandbox: Sandbox;
  onClose: () => void;
  onConnect: (sandbox: Sandbox) => void;
}

export function SandboxDetail({
  sandbox,
  onClose,
  onConnect,
}: SandboxDetailProps) {
  const [newPartyName, setNewPartyName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [lastUploadedDar, setLastUploadedDar] = useState<string | undefined>();

  const deleteSandbox = useDeleteSandbox();
  const resetSandbox = useResetSandbox();
  const uploadDar = useUploadDar();
  const allocateParty = useAllocateParty();

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

  const handleDelete = useCallback(async () => {
    await deleteSandbox.mutateAsync(sandbox.id);
    setShowDeleteConfirm(false);
    onClose();
  }, [sandbox.id, deleteSandbox, onClose]);

  const handleShare = useCallback(async () => {
    try {
      const url = sandbox.shareUrl ?? `${window.location.origin}/sandbox/${sandbox.id}`;
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API may be blocked in some contexts; silently ignore.
    }
  }, [sandbox]);

  const statusConfig = STATUS_CONFIG[sandbox.status];

  // Extract port from endpoint
  const portMatch = sandbox.ledgerApiEndpoint.match(/:(\d+)/);
  const port = portMatch ? portMatch[1] : "N/A";

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className={cn("text-xs", statusConfig.className)}
          >
            {statusConfig.label}
          </Badge>
          <span className="font-mono text-sm font-medium">
            {truncateId(sandbox.id, 16)}
          </span>
          <CopyButton text={sandbox.id} label="Copy Sandbox ID" />
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>

      <Separator />

      {/* Connection info */}
      <div className="flex flex-col gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-medium">
          <HugeiconsIcon icon={PlugSocketIcon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
          Connection
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-medium text-muted-foreground">
              Ledger API Endpoint
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              <span className="font-mono text-xs text-primary">
                {sandbox.ledgerApiEndpoint}
              </span>
              <CopyButton
                text={sandbox.ledgerApiEndpoint}
                label="Copy endpoint"
              />
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-muted-foreground">
              Port
            </div>
            <div className="mt-0.5 font-mono text-xs">{port}</div>
          </div>
        </div>
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={sandbox.status !== "running"}
          onClick={() => onConnect(sandbox)}
        >
          <HugeiconsIcon icon={PlugSocketIcon} data-icon="inline-start" strokeWidth={2} />
          Connect
        </Button>
      </div>

      <Separator />

      {/* Parties */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-sm font-medium">
            <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
            Parties ({sandbox.parties.length})
          </h4>
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
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={handleAllocateParty}
            disabled={
              !newPartyName.trim() || allocateParty.isPending
            }
          >
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
            Allocate
          </Button>
        </div>
      </div>

      <Separator />

      {/* DARs */}
      <div className="flex flex-col gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-medium">
          <HugeiconsIcon icon={FileZipIcon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
          DARs ({sandbox.uploadedDars.length})
        </h4>
        {sandbox.uploadedDars.length > 0 ? (
          <div className="flex flex-col gap-1">
            {sandbox.uploadedDars.map((dar, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-md border bg-muted/20 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={FileZipIcon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
                  <span className="font-mono text-xs">{truncateId(dar, 16)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    Source extracted
                  </Badge>
                  <CopyButton text={dar} label="Copy package ID" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No DARs uploaded</span>
        )}
        <DarUpload
          onUpload={handleUploadDar}
          isUploading={uploadDar.isPending}
          lastUploadedFileName={lastUploadedDar}
        />
      </div>

      <Separator />

      {/* Profiling */}
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={PulseRectangle01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Profiling:</span>
        {sandbox.profilingEnabled ? (
          <Badge className="bg-primary/15 text-primary text-[10px]">
            Enabled
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            Disabled
          </Badge>
        )}
        {sandbox.profilingEnabled && (
          <span className="text-[10px] text-muted-foreground">
            Performance metrics are being collected
          </span>
        )}
      </div>

      {/* Created timestamp */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-3" />
        Created {new Date(sandbox.createdAt).toLocaleString()}
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setShowResetConfirm(true)}
        >
          <HugeiconsIcon icon={RotateLeft01Icon} data-icon="inline-start" strokeWidth={2} />
          Reset
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs text-destructive hover:text-destructive"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" strokeWidth={2} />
          Delete
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-8 text-xs"
          onClick={handleShare}
        >
          <HugeiconsIcon icon={Share01Icon} data-icon="inline-start" strokeWidth={2} />
          Share
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sandbox</DialogTitle>
            <DialogDescription>
              This will permanently tear down the sandbox and all its data. This
              action cannot be undone.
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
              onClick={handleDelete}
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
                  // Reset endpoint may not exist yet; silently ignore
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
    </div>
  );
}
