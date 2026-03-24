import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Moon01Icon,
  Sun01Icon,
  ComputerIcon,
  Plug01Icon,
  Plug02Icon,
  User02Icon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldGroup,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ConnectionDialog } from "@/components/connection-dialog";
import { useConnectionStore } from "@/stores/connection-store";
import { cn, truncateId } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

const DEFAULT_PARTY_KEY = "cantontrace-default-party";

function getInitialDefaultParty(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(DEFAULT_PARTY_KEY) ?? "";
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [defaultParty, setDefaultParty] = useState(getInitialDefaultParty);
  const { status, config, bootstrap, disconnect } = useConnectionStore();

  // Persist default party selection
  useEffect(() => {
    if (defaultParty) {
      localStorage.setItem(DEFAULT_PARTY_KEY, defaultParty);
    } else {
      localStorage.removeItem(DEFAULT_PARTY_KEY);
    }
  }, [defaultParty]);

  // Derive available parties from user rights
  const availableParties =
    bootstrap?.userRights
      .filter(
        (r): r is { type: "CanActAs"; party: string } =>
          r.type === "CanActAs"
      )
      .map((r) => r.party) ?? [];

  // Merge in knownParties for broader coverage
  const allParties = [
    ...new Set([...availableParties, ...(bootstrap?.knownParties ?? [])]),
  ];

  const themeOptions: { value: Theme; label: string; icon: IconSvgElement }[] =
    [
      { value: "light", label: "Light", icon: Sun01Icon },
      { value: "dark", label: "Dark", icon: Moon01Icon },
      { value: "system", label: "System", icon: ComputerIcon },
    ];

  const statusColor =
    status === "connected"
      ? "bg-chart-1"
      : status === "connecting"
        ? "bg-chart-3"
        : status === "error"
          ? "bg-destructive"
          : "bg-muted-foreground/40";

  return (
    <div className="flex h-full flex-col">
      {/* Page header -- standard pattern */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <HugeiconsIcon
          icon={Settings02Icon}
          strokeWidth={2}
          className="size-5 text-primary"
        />
        <div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-xs text-muted-foreground">
            Manage your CantonTrace preferences and connections
          </p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-6">
          {/* ---- Appearance ---- */}
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize the look and feel of the application.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel id="theme-label">Theme</FieldLabel>
                  <div
                    className="flex gap-2"
                    role="group"
                    aria-labelledby="theme-label"
                  >
                    {themeOptions.map((opt) => (
                      <Button
                        key={opt.value}
                        variant={theme === opt.value ? "default" : "outline"}
                        size="sm"
                        aria-pressed={theme === opt.value}
                        onClick={() => setTheme(opt.value)}
                      >
                        <HugeiconsIcon
                          icon={opt.icon}
                          strokeWidth={2}
                          data-icon="inline-start"
                        />
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          {/* ---- Connection Management ---- */}
          <Card>
            <CardHeader>
              <CardTitle>Connection</CardTitle>
              <CardDescription>
                Manage your connection to the Canton participant node.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                {/* Status & controls */}
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn("size-3 rounded-full", statusColor)}
                      />
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {status === "disconnected"
                            ? "Not connected"
                            : status}
                        </p>
                        {config && (
                          <p className="font-mono text-xs text-muted-foreground">
                            {config.ledgerApiEndpoint}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {status === "connected" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={disconnect}
                        >
                          <HugeiconsIcon
                            icon={Plug02Icon}
                            strokeWidth={2}
                            data-icon="inline-start"
                          />
                          Disconnect
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConnectionOpen(true)}
                        >
                          <HugeiconsIcon
                            icon={Plug01Icon}
                            strokeWidth={2}
                            data-icon="inline-start"
                          />
                          Connect
                        </Button>
                      )}
                    </div>
                  </div>
                </Field>

                {/* Bootstrap details */}
                {bootstrap && (
                  <>
                    <Separator />
                    <Field>
                      <FieldLabel>Connection Details</FieldLabel>
                      <div className="flex flex-col gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            API Version
                          </span>
                          <span className="font-mono">
                            {bootstrap.apiVersion}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Packages
                          </span>
                          <span>{bootstrap.packages.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            User Rights
                          </span>
                          <span>{bootstrap.userRights.length}</span>
                        </div>
                        {config?.sandboxId && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Sandbox ID
                            </span>
                            <span className="font-mono text-xs">
                              {truncateId(config.sandboxId)}
                            </span>
                          </div>
                        )}
                      </div>
                    </Field>
                  </>
                )}

                {/* Active rights */}
                {bootstrap && bootstrap.userRights.length > 0 && (
                  <>
                    <Separator />
                    <Field>
                      <FieldLabel>Active Rights</FieldLabel>
                      <div className="flex flex-wrap gap-2">
                        {bootstrap.userRights.map((right, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="text-xs"
                          >
                            {right.type}
                            {"party" in right && (
                              <span className="ml-1 font-mono opacity-70">
                                {right.party}
                              </span>
                            )}
                          </Badge>
                        ))}
                      </div>
                    </Field>
                  </>
                )}

                {/* Default party selector */}
                {bootstrap && allParties.length > 0 && (
                  <>
                    <Separator />
                    <Field>
                      <FieldLabel>
                        <HugeiconsIcon
                          icon={User02Icon}
                          strokeWidth={2}
                          className="size-4"
                        />
                        Default Party
                      </FieldLabel>
                      <NativeSelect
                        value={defaultParty}
                        onChange={(e) => setDefaultParty(e.target.value)}
                      >
                        <NativeSelectOption value="">
                          None
                        </NativeSelectOption>
                        {allParties.map((party) => (
                          <NativeSelectOption key={party} value={party}>
                            {party}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <FieldDescription>
                        Pre-selects this party in filters across all tools.
                      </FieldDescription>
                    </Field>
                  </>
                )}
              </FieldGroup>
            </CardContent>
          </Card>

          <ConnectionDialog
            open={connectionOpen}
            onOpenChange={setConnectionOpen}
          />
        </div>
      </div>
    </div>
  );
}
