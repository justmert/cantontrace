import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Loading03Icon,
  Plug01Icon,
  ServerStack01Icon,
} from "@hugeicons/core-free-icons";
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
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Create a local Canton sandbox for development and testing. This
                will provision a new sandbox with default configuration.
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
                onClick={handleCreateSandbox}
                disabled={isConnecting}
                className="w-full"
              >
                {isConnecting ? (
                  <>
                    <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin" data-icon="inline-start" />
                    Creating Sandbox...
                  </>
                ) : (
                  "Create Sandbox"
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
