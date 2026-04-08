import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Loading03Icon,
  Plug01Icon,
  ServerStack01Icon,
  Add01Icon,
  Plug02Icon,
} from "@hugeicons/core-free-icons";
import { api } from "@/lib/api";
import type { Sandbox } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useNavigate } from "@tanstack/react-router";
import { useConnectionStore } from "@/stores/connection-store";

interface ConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectionDialog({ open, onOpenChange }: ConnectionDialogProps) {
  const { status, error, connect, createSandbox } = useConnectionStore();
  const [endpoint, setEndpoint] = useState("localhost:6865");
  const [iamUrl, setIamUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isConnecting = status === "connecting";

  const handleConnect = async () => {
    try {
      await connect({
        ledgerApiEndpoint: endpoint,
        iamUrl: iamUrl || undefined,
        clientId: clientId || undefined,
        clientSecret: clientSecret || undefined,
      });
      onOpenChange(false);
    } catch {
      // Error state is managed by the store
    }
  };

  const handleCreateSandbox = async () => {
    try {
      await createSandbox();
      onOpenChange(false);
    } catch {
      // Error state is managed by the store
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Connect to Canton Network</DialogTitle>
          <DialogDescription>
            Connect to a participant node or create a local sandbox for
            development.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="connect" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="connect">
              <HugeiconsIcon icon={Plug01Icon} strokeWidth={2} data-icon="inline-start" />
              Connect
            </TabsTrigger>
            <TabsTrigger value="sandbox">
              <HugeiconsIcon icon={ServerStack01Icon} strokeWidth={2} data-icon="inline-start" />
              Sandbox
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connect" className="pt-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="endpoint">Ledger API Endpoint</FieldLabel>
                <Input
                  id="endpoint"
                  placeholder="localhost:6865"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  disabled={isConnecting}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="iam-url">
                  IAM URL{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </FieldLabel>
                <Input
                  id="iam-url"
                  placeholder="http://keycloak.localhost:8082/realms/AppProvider"
                  value={iamUrl}
                  onChange={(e) => setIamUrl(e.target.value)}
                  disabled={isConnecting}
                />
                {iamUrl && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Client credentials will be auto-discovered from Keycloak.{" "}
                    <button
                      type="button"
                      className="underline hover:text-foreground"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                      {showAdvanced ? "Hide" : "Override"} credentials
                    </button>
                  </p>
                )}
              </Field>

              {iamUrl && showAdvanced && (
                <>
                  <Field>
                    <FieldLabel htmlFor="client-id">
                      Client ID{" "}
                      <span className="text-muted-foreground font-normal">
                        (default: auto-discovered)
                      </span>
                    </FieldLabel>
                    <Input
                      id="client-id"
                      placeholder="app-provider-backend"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      disabled={isConnecting}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="client-secret">
                      Client Secret{" "}
                      <span className="text-muted-foreground font-normal">
                        (default: auto-discovered)
                      </span>
                    </FieldLabel>
                    <Input
                      id="client-secret"
                      type="password"
                      placeholder="Auto-discovered from Keycloak"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      disabled={isConnecting}
                    />
                  </Field>
                </>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {isConnecting && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin" />
                  <span>Connecting and bootstrapping...</span>
                </div>
              )}

              <Button
                onClick={handleConnect}
                disabled={isConnecting || !endpoint.trim()}
                className="w-full"
              >
                {isConnecting ? (
                  <>
                    <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin" data-icon="inline-start" />
                    Connecting...
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            </FieldGroup>
          </TabsContent>

          <TabsContent value="sandbox" className="pt-4">
            <SandboxTabContent
              isConnecting={isConnecting}
              error={error}
              onCreateSandbox={handleCreateSandbox}
              onConnect={async (endpoint: string, sandboxId: string) => {
                try {
                  await connect({ ledgerApiEndpoint: endpoint, sandboxId });
                  onOpenChange(false);
                } catch { /* error handled by store */ }
              }}
              onOpenChange={onOpenChange}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sandbox tab — shows existing sandboxes + create new
// ---------------------------------------------------------------------------

function SandboxTabContent({
  isConnecting,
  error,
  onCreateSandbox,
  onConnect,
  onOpenChange,
}: {
  isConnecting: boolean;
  error: string | null;
  onCreateSandbox: () => void;
  onConnect: (endpoint: string, sandboxId: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: sandboxes } = useQuery({
    queryKey: ["sandboxes"],
    queryFn: async () => {
      const res = await api.getSandboxes();
      return res.data as Sandbox[];
    },
    refetchInterval: 5000,
  });

  const runningSandboxes = (sandboxes ?? []).filter((s) => s.status === "running");
  const hasSandboxes = runningSandboxes.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Existing running sandboxes */}
      {hasSandboxes && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">Running Sandboxes</span>
          <div className="flex flex-col gap-1.5">
            {runningSandboxes.map((sb) => (
              <button
                key={sb.id}
                disabled={isConnecting}
                onClick={() => onConnect(sb.ledgerApiEndpoint, sb.id)}
                className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
              >
                <span className="size-2 shrink-0 rounded-full bg-primary" />
                <div className="flex flex-1 flex-col">
                  <span className="font-mono text-sm font-medium">{sb.ledgerApiEndpoint}</span>
                  <span className="text-xs text-muted-foreground">
                    {sb.parties.length} parties · {sb.uploadedDars.length} DARs
                  </span>
                </div>
                <HugeiconsIcon icon={Plug02Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      {hasSandboxes && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border/50" />
          <span className="text-xs text-muted-foreground/50">or</span>
          <div className="h-px flex-1 bg-border/50" />
        </div>
      )}

      {/* Create new */}
      <p className="text-sm text-muted-foreground">
        {hasSandboxes
          ? "Create another sandbox instance."
          : "Create a local Canton sandbox for development and testing."}
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isConnecting && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin" />
          <span>Provisioning sandbox...</span>
        </div>
      )}

      <Button
        onClick={() => {
          onOpenChange(false);
          // Navigate handled by parent — we just need to get to /sandbox
          window.location.href = "/sandbox";
        }}
        variant="outline"
        className="w-full"
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
        Create New Sandbox
      </Button>
    </div>
  );
}
