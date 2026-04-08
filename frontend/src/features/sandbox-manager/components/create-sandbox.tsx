import { useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useCreateSandbox } from "../hooks";

export interface CreateSandboxFormProps {
  onCreated?: (sandboxId: string) => void;
  onClose?: () => void;
}

export function CreateSandboxForm({ onCreated, onClose }: CreateSandboxFormProps) {
  const [sandboxName, setSandboxName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const createSandbox = useCreateSandbox();

  const handleCreate = useCallback(async () => {
    try {
      setErrorMessage(null);
      setIsCreating(true);
      const sandbox = await createSandbox.mutateAsync({
        name: sandboxName.trim() || undefined,
      });

      onCreated?.(sandbox.id);
      onClose?.();
      setSandboxName("");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to create sandbox"
      );
    } finally {
      setIsCreating(false);
    }
  }, [createSandbox, sandboxName, onCreated, onClose]);

  return (
    <FieldGroup>
      <Field>
        <FieldLabel className="text-xs">Name</FieldLabel>
        <Input
          placeholder="My Sandbox"
          value={sandboxName}
          onChange={(e) => setSandboxName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          disabled={isCreating}
          className="h-8"
        />
      </Field>

      {errorMessage && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          {errorMessage}
        </div>
      )}

      <Button
        className="w-full"
        onClick={handleCreate}
        disabled={isCreating}
      >
        {isCreating ? (
          <>
            <HugeiconsIcon icon={Loading03Icon} data-icon="inline-start" strokeWidth={2} className="animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
            Create Sandbox
          </>
        )}
      </Button>
    </FieldGroup>
  );
}

export const CreateSandbox = CreateSandboxForm;
