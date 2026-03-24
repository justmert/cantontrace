import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  Database01Icon,
  Package01Icon,
  ArrowRight01Icon,
  Activity01Icon,
  EyeIcon,
  TestTube01Icon,
  Plug01Icon,
  UserMultiple02Icon,
  Globe02Icon,
  FileSearchIcon,
  AlertCircleIcon,
  ShuffleIcon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { ConnectionDialog } from "@/components/connection-dialog";
import { useConnectionStore } from "@/stores/connection-store";
import { useEventStreamStore } from "@/stores/event-stream-store";
import { formatDistanceToNow } from "date-fns";
import { cn, truncateId, formatTemplateId } from "@/lib/utils";

export default function DashboardPage() {
  const { status, bootstrap } = useConnectionStore();
  const events = useEventStreamStore((s) => s.events);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const navigate = useNavigate();

  // ── Disconnected state ──────────────────────────────────────────────
  if (status !== "connected" || !bootstrap) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
              <HugeiconsIcon
                icon={Globe02Icon}
                strokeWidth={2}
                className="size-7 text-primary"
              />
            </div>
            <CardTitle className="text-xl">
              Welcome to CantonTrace
            </CardTitle>
            <CardDescription className="text-balance">
              Your command center for debugging Daml smart contracts on the
              Canton Network. Connect to a participant node or spin up a
              sandbox to get started.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <Button
              size="lg"
              className="w-full max-w-xs"
              onClick={() => setConnectionOpen(true)}
            >
              <HugeiconsIcon
                icon={Plug01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Connect to Canton
            </Button>
            <p className="text-xs text-muted-foreground">
              You can also create a local sandbox from the connection dialog.
            </p>
          </CardContent>
        </Card>
        <ConnectionDialog
          open={connectionOpen}
          onOpenChange={setConnectionOpen}
        />
      </div>
    );
  }

  // ── Connected state ─────────────────────────────────────────────────
  const recentEvents = events.slice(0, 10);

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <HugeiconsIcon
          icon={DashboardSquare01Icon}
          strokeWidth={2}
          className="size-5 text-primary"
        />
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Connected{" "}
            {formatDistanceToNow(new Date(bootstrap.connectedAt), {
              addSuffix: true,
            })}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-6">
          {/* ── Connection status + quick stats row ────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Connection info -- compact */}
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Connection
                </CardTitle>
                <CardAction>
                  <Badge variant="default" className="gap-1.5 text-[10px]">
                    <span className="size-1.5 rounded-full bg-primary-foreground" />
                    Live
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">API</span>
                    <span className="font-mono">{bootstrap.apiVersion}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Offset</span>
                    <span className="font-mono">
                      {truncateId(bootstrap.currentOffset, 12)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Metric: Parties */}
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Parties</CardTitle>
                <CardAction>
                  <HugeiconsIcon
                    icon={UserMultiple02Icon}
                    strokeWidth={2}
                    className="size-4 text-muted-foreground"
                  />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {bootstrap.knownParties.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  known on ledger
                </p>
              </CardContent>
            </Card>

            {/* Metric: Packages */}
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Packages
                </CardTitle>
                <CardAction>
                  <HugeiconsIcon
                    icon={Package01Icon}
                    strokeWidth={2}
                    className="size-4 text-muted-foreground"
                  />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {bootstrap.packages.length}
                </div>
                <p className="text-xs text-muted-foreground">loaded</p>
              </CardContent>
            </Card>

            {/* Metric: Ledger Head */}
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Ledger Head
                </CardTitle>
                <CardAction>
                  <HugeiconsIcon
                    icon={Database01Icon}
                    strokeWidth={2}
                    className="size-4 text-muted-foreground"
                  />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="truncate font-mono text-sm font-semibold">
                  {truncateId(bootstrap.currentOffset, 16)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {bootstrap.pruningOffset
                    ? `pruned before ${truncateId(bootstrap.pruningOffset, 10)}`
                    : "no pruning boundary"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Quick Actions grid ─────────────────────────────── */}
          <div>
            <h2 className="mb-3 text-lg font-semibold">Quick Actions</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <QuickAction
                icon={EyeIcon}
                title="Browse Contracts"
                description="Inspect the active contract set"
                onClick={() => navigate({ to: "/acs" })}
              />
              <QuickAction
                icon={Activity01Icon}
                title="Watch Events"
                description="Real-time ledger event stream"
                onClick={() => navigate({ to: "/events" })}
              />
              <QuickAction
                icon={TestTube01Icon}
                title="Simulate Transaction"
                description="Dry-run a command before submitting"
                onClick={() => navigate({ to: "/simulate" })}
              />
              <QuickAction
                icon={FileSearchIcon}
                title="Explore Templates"
                description="Browse loaded Daml packages"
                onClick={() => navigate({ to: "/templates" })}
              />
              <QuickAction
                icon={AlertCircleIcon}
                title="Error Debugger"
                description="Inspect failed command completions"
                onClick={() => navigate({ to: "/errors" })}
              />
              <QuickAction
                icon={ShuffleIcon}
                title="Workflow Debugger"
                description="Trace correlated transactions"
                onClick={() => navigate({ to: "/workflows" })}
              />
            </div>
          </div>

          {/* ── Recent Activity ─────────────────────────────────── */}
          <div>
            <h2 className="mb-3 text-lg font-semibold">Recent Activity</h2>
            <Card>
              <CardContent className="p-0">
                {recentEvents.length === 0 ? (
                  <Empty className="py-12">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <HugeiconsIcon
                          icon={Activity01Icon}
                          strokeWidth={2}
                        />
                      </EmptyMedia>
                      <EmptyTitle>No events yet</EmptyTitle>
                      <EmptyDescription>
                        Events will appear here as they stream in from the
                        ledger.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <ScrollArea className="h-[320px]">
                    <div className="divide-y">
                      {recentEvents.map((event) => (
                        <div
                          key={event.updateId}
                          className="flex items-center gap-3 px-6 py-3"
                        >
                          <div
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              event.updateType === "transaction"
                                ? "bg-primary"
                                : event.updateType === "reassignment"
                                  ? "bg-chart-2"
                                  : "bg-muted-foreground/40"
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="text-[10px]"
                              >
                                {event.updateType}
                              </Badge>
                              <span className="truncate font-mono text-xs text-muted-foreground">
                                {truncateId(event.updateId)}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {event.events.length}{" "}
                              {event.events.length === 1
                                ? "event"
                                : "events"}
                              {event.events[0] &&
                                "templateId" in event.events[0] && (
                                  <>
                                    {" - "}
                                    <span className="font-mono">
                                      {formatTemplateId(
                                        event.events[0].templateId
                                      )}
                                    </span>
                                  </>
                                )}
                            </div>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatDistanceToNow(
                              new Date(event.recordTime),
                              { addSuffix: true }
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Participant features (if any) ──────────────────── */}
          {bootstrap.featureDescriptors.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold">
                Participant Features
              </h2>
              <Card size="sm">
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {bootstrap.featureDescriptors.map((f) => (
                      <Badge key={f.name} variant="secondary">
                        {f.name}: {f.version}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Quick Action card component ─────────────────────────────────────

function QuickAction({
  icon,
  title,
  description,
  onClick,
}: {
  icon: typeof EyeIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm ring-1 ring-foreground/5 transition-colors",
        "hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        strokeWidth={2}
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}
