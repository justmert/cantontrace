import React, { useState, useCallback, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ServerStackIcon } from "@hugeicons/core-free-icons";
import { SandboxList } from "./components/sandbox-list";
import { SandboxDetail } from "./components/sandbox-detail";
import { CreateSandbox } from "./components/create-sandbox";
import { useSandboxes } from "./hooks";
import type { Sandbox } from "@/lib/types";

// ---------------------------------------------------------------------------
// Sandbox Manager Page
// ---------------------------------------------------------------------------

export default function SandboxManagerPage() {
  const { data: sandboxes, isLoading, error } = useSandboxes();
  const [selectedSandbox, setSelectedSandbox] = useState<Sandbox | null>(null);
  const pendingSelectId = useRef<string | null>(null);

  const handleSelect = useCallback(
    (sandbox: Sandbox) => {
      setSelectedSandbox(sandbox);
    },
    []
  );

  const handleConnect = useCallback((sandbox: Sandbox) => {
    // In production, this would update global connection state
    console.log("Connecting to sandbox:", sandbox.ledgerApiEndpoint);
  }, []);

  const handleDelete = useCallback(
    (sandbox: Sandbox) => {
      if (selectedSandbox?.id === sandbox.id) {
        setSelectedSandbox(null);
      }
    },
    [selectedSandbox]
  );

  const handleShare = useCallback(async (sandbox: Sandbox) => {
    try {
      const url =
        sandbox.shareUrl ??
        `${window.location.origin}/sandbox/${sandbox.id}`;
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API may be blocked in some contexts; silently ignore.
    }
  }, []);

  const handleCreated = useCallback(
    (sandboxId: string) => {
      // Store the ID so the sync effect auto-selects it once data arrives
      pendingSelectId.current = sandboxId;
      // If the sandbox is already in the list, select it immediately
      const created = sandboxes?.find((s) => s.id === sandboxId);
      if (created) {
        setSelectedSandbox(created);
        pendingSelectId.current = null;
      }
    },
    [sandboxes]
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedSandbox(null);
  }, []);

  // Keep selectedSandbox in sync with latest data from polling,
  // and auto-select a newly created sandbox once it appears
  const selectedId = selectedSandbox?.id ?? null;
  React.useEffect(() => {
    if (!sandboxes) return;

    // If there's a pending selection from creation, try to resolve it
    if (pendingSelectId.current) {
      const pending = sandboxes.find((s) => s.id === pendingSelectId.current);
      if (pending) {
        setSelectedSandbox(pending);
        pendingSelectId.current = null;
        return;
      }
    }

    // Keep the currently selected sandbox in sync with fresh data
    if (selectedId) {
      const updated = sandboxes.find((s) => s.id === selectedId);
      if (updated) {
        setSelectedSandbox(updated);
      }
    }
  }, [sandboxes, selectedId]);

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
          <HugeiconsIcon icon={ServerStackIcon} strokeWidth={2} className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Sandbox Manager
          </h1>
          <p className="text-sm text-muted-foreground">
            Create, manage, and connect to Canton sandbox instances
          </p>
        </div>
      </div>

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

      <div className="grid grid-cols-[1fr_360px] gap-4">
        {/* Left: sandbox list and detail */}
        <div className="flex flex-col gap-4">
          <SandboxList
            sandboxes={sandboxes}
            isLoading={isLoading}
            onSelect={handleSelect}
            onConnect={handleConnect}
            onDelete={handleDelete}
            onShare={handleShare}
          />

          {/* Selected sandbox detail */}
          {selectedSandbox && (
            <SandboxDetail
              sandbox={selectedSandbox}
              onClose={handleCloseDetail}
              onConnect={handleConnect}
            />
          )}
        </div>

        {/* Right: create sandbox */}
        <div>
          <CreateSandbox onCreated={handleCreated} />
        </div>
      </div>
    </div>
  );
}
