import React, { useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Cancel01Icon,
  Loading03Icon,
  CheckmarkCircle02Icon,
  CircleIcon,
  ServerStackIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { DarUpload } from "./dar-upload";
import { useCreateSandbox, useUploadDar } from "../hooks";

// ---------------------------------------------------------------------------
// Provisioning steps
// ---------------------------------------------------------------------------

type ProvisioningStep =
  | "idle"
  | "creating"
  | "starting_node"
  | "uploading_dar"
  | "allocating_parties"
  | "ready"
  | "error";

const STEP_LABELS: Record<ProvisioningStep, string> = {
  idle: "",
  creating: "Creating sandbox instance...",
  starting_node: "Starting Canton node...",
  uploading_dar: "Uploading DAR...",
  allocating_parties: "Allocating parties...",
  ready: "Ready!",
  error: "Error occurred",
};

const STEP_ORDER: ProvisioningStep[] = [
  "creating",
  "starting_node",
  "uploading_dar",
  "allocating_parties",
  "ready",
];

function ProvisioningProgress({
  currentStep,
  hasDar,
  hasParties,
}: {
  currentStep: ProvisioningStep;
  hasDar: boolean;
  hasParties: boolean;
}) {
  const activeSteps = STEP_ORDER.filter((s) => {
    if (s === "uploading_dar" && !hasDar) return false;
    if (s === "allocating_parties" && !hasParties) return false;
    return true;
  });

  const currentIdx = activeSteps.indexOf(currentStep);

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-4">
      {activeSteps.map((step, idx) => {
        const isCompleted = idx < currentIdx || currentStep === "ready";
        const isActive = step === currentStep && currentStep !== "ready";

        return (
          <div
            key={step}
            className={cn(
              "flex items-center gap-2.5 text-sm transition-all",
              isCompleted && "text-primary",
              isActive && "text-foreground font-medium",
              !isCompleted && !isActive && "text-muted-foreground"
            )}
          >
            {isCompleted ? (
              <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4" />
            ) : isActive ? (
              <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin text-primary" />
            ) : (
              <HugeiconsIcon icon={CircleIcon} strokeWidth={2} className="size-4" />
            )}
            <span>{STEP_LABELS[step]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Sandbox Component
// ---------------------------------------------------------------------------

export interface CreateSandboxProps {
  onCreated?: (sandboxId: string) => void;
}

export function CreateSandbox({ onCreated }: CreateSandboxProps) {
  const [partyInput, setPartyInput] = useState("");
  const [parties, setParties] = useState<string[]>([]);
  const [enableProfiling, setEnableProfiling] = useState(false);
  const [darFile, setDarFile] = useState<File | null>(null);
  const [provisioningStep, setProvisioningStep] =
    useState<ProvisioningStep>("idle");
  const [autoConnect, setAutoConnect] = useState(true);

  const createSandbox = useCreateSandbox();
  const uploadDar = useUploadDar();

  const handleAddParty = useCallback(() => {
    const trimmed = partyInput.trim();
    if (trimmed && !parties.includes(trimmed)) {
      setParties((prev) => [...prev, trimmed]);
      setPartyInput("");
    }
  }, [partyInput, parties]);

  const handleRemoveParty = useCallback((party: string) => {
    setParties((prev) => prev.filter((p) => p !== party));
  }, []);

  const handlePartyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddParty();
    } else if (e.key === "," || e.key === "Tab") {
      e.preventDefault();
      handleAddParty();
    }
  };

  const handleDarSelect = useCallback((file: File) => {
    setDarFile(file);
  }, []);

  const handleCreate = useCallback(async () => {
    try {
      // Step 1: Create sandbox (parties are included in the create request
      // and allocated by the backend during provisioning)
      setProvisioningStep("creating");
      const sandbox = await createSandbox.mutateAsync({
        parties: parties.length > 0 ? parties : undefined,
        enableProfiling,
      });

      // Step 2: Starting node (the backend handles node startup
      // asynchronously; status updates come via polling)
      setProvisioningStep("starting_node");

      // Step 3: Upload DAR if provided (requires the sandbox to be
      // running, but the backend queues it during provisioning)
      if (darFile) {
        setProvisioningStep("uploading_dar");
        await uploadDar.mutateAsync({
          sandboxId: sandbox.id,
          dar: darFile,
        });
      }

      // Parties are already registered via the create request body,
      // so we skip separate allocation here. Additional parties can
      // be allocated later from the sandbox detail panel.

      // Done
      setProvisioningStep("ready");
      onCreated?.(sandbox.id);

      // Reset form after brief delay
      setTimeout(() => {
        setProvisioningStep("idle");
        setParties([]);
        setDarFile(null);
        setEnableProfiling(false);
      }, 2000);
    } catch {
      setProvisioningStep("error");
      setTimeout(() => setProvisioningStep("idle"), 3000);
    }
  }, [
    createSandbox,
    uploadDar,
    parties,
    enableProfiling,
    darFile,
    onCreated,
  ]);

  const isProvisioning =
    provisioningStep !== "idle" && provisioningStep !== "error";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HugeiconsIcon icon={ServerStackIcon} strokeWidth={2} className="size-4" />
          Create Sandbox
        </CardTitle>
        <CardDescription>
          Spin up a local Canton sandbox for debugging and testing
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {/* DAR upload */}
          <Field>
            <FieldLabel className="text-xs">DAR File (optional)</FieldLabel>
            <DarUpload
              onUpload={handleDarSelect}
              isUploading={provisioningStep === "uploading_dar"}
            />
          </Field>

          {/* Party names */}
          <Field>
            <FieldLabel className="text-xs">Party Names</FieldLabel>
            <div className="flex gap-2">
              <Input
                className="flex-1 text-xs"
                placeholder="Enter party name, press Enter or comma to add"
                value={partyInput}
                onChange={(e) => setPartyInput(e.target.value)}
                onKeyDown={handlePartyKeyDown}
                disabled={isProvisioning}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddParty}
                disabled={!partyInput.trim() || isProvisioning}
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-3.5" />
              </Button>
            </div>
            {parties.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {parties.map((party) => (
                  <Badge
                    key={party}
                    variant="secondary"
                    className="flex items-center gap-1 font-mono text-xs"
                  >
                    {party}
                    <button
                      onClick={() => handleRemoveParty(party)}
                      className="ml-0.5 rounded-full hover:bg-muted"
                      disabled={isProvisioning}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </Field>

          {/* Profiling toggle */}
          <Field orientation="horizontal">
            <div className="flex flex-col gap-0.5">
              <FieldLabel className="text-xs font-medium">Enable Profiling</FieldLabel>
              <FieldDescription>
                May require Enterprise Edition
              </FieldDescription>
            </div>
            <Switch
              checked={enableProfiling}
              onCheckedChange={setEnableProfiling}
              disabled={isProvisioning}
            />
          </Field>

          {/* Auto-connect toggle */}
          <Field orientation="horizontal">
            <div className="flex flex-col gap-0.5">
              <FieldLabel className="text-xs font-medium">Auto-Connect</FieldLabel>
              <FieldDescription>
                Set as active connection when ready
              </FieldDescription>
            </div>
            <Switch
              checked={autoConnect}
              onCheckedChange={setAutoConnect}
              disabled={isProvisioning}
            />
          </Field>

          {/* Provisioning progress */}
          {provisioningStep !== "idle" && (
            <ProvisioningProgress
              currentStep={provisioningStep}
              hasDar={!!darFile}
              hasParties={parties.length > 0}
            />
          )}

          {/* Error state */}
          {provisioningStep === "error" && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              Failed to create sandbox. Please try again.
            </div>
          )}

          {/* Create button */}
          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={isProvisioning}
          >
            {isProvisioning ? (
              <>
                <HugeiconsIcon icon={Loading03Icon} data-icon="inline-start" strokeWidth={2} className="animate-spin" />
                Provisioning...
              </>
            ) : (
              <>
                <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
                Create Sandbox
              </>
            )}
          </Button>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
