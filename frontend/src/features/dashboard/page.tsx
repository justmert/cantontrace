import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Database01Icon,
  Package01Icon,
  Shield01Icon,
  ArrowRight01Icon,
  Activity01Icon,
  EyeIcon,
  TestTube01Icon,
  Plug01Icon,
  UserMultiple02Icon,
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
import { Separator } from "@/components/ui/separator";
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

  if (status !== "connected" || !bootstrap) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <HugeiconsIcon icon={Plug01Icon} strokeWidth={2} className="size-6 text-muted-foreground" />
            </div>
            <CardTitle>Welcome to CantonTrace</CardTitle>
            <CardDescription>
              Connect to a Canton participant node or create a sandbox to start
              debugging Daml smart contracts.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => setConnectionOpen(true)}>
              <HugeiconsIcon icon={Plug01Icon} strokeWidth={2} data-icon="inline-start" />
              Connect
            </Button>
          </CardContent>
        </Card>
        <ConnectionDialog
          open={connectionOpen}
          onOpenChange={setConnectionOpen}
        />
      </div>
    );
  }

  const recentEvents = events.slice(0, 10);
  const parties = bootstrap.userRights
    .filter(
      (r): r is { type: "CanActAs"; party: string } => r.type === "CanActAs"
    )
    .map((r) => r.party);

  return (
    <div className="flex-1 p-6">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Connected since{" "}
            {formatDistanceToNow(new Date(bootstrap.connectedAt), {
              addSuffix: true,
            })}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Connection Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Connection Info
              </CardTitle>
              <CardAction>
                <HugeiconsIcon icon={Database01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">API Version</span>
                  <span className="font-mono">{bootstrap.apiVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Offset</span>
                  <span className="font-mono text-xs">
                    {truncateId(bootstrap.currentOffset, 12)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pruning Boundary</span>
                  <span className="font-mono text-xs">
                    {bootstrap.pruningOffset
                      ? truncateId(bootstrap.pruningOffset, 12)
                      : "None"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Known Parties */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Known Parties
              </CardTitle>
              <CardAction>
                <HugeiconsIcon icon={UserMultiple02Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {bootstrap.knownParties.length}
              </div>
              <p className="text-xs text-muted-foreground">
                {bootstrap.knownParties.length === 1
                  ? "party on ledger"
                  : "parties on ledger"}
              </p>
              <div className="mt-3 flex flex-col gap-1">
                {bootstrap.knownParties.slice(0, 4).map((party) => (
                  <div
                    key={party}
                    className="flex items-center gap-2 text-xs"
                  >
                    <div className="size-1.5 rounded-full bg-chart-2" />
                    <span className="truncate font-mono">{party}</span>
                  </div>
                ))}
                {bootstrap.knownParties.length > 4 && (
                  <p className="text-xs text-muted-foreground">
                    +{bootstrap.knownParties.length - 4} more
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Packages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Packages</CardTitle>
              <CardAction>
                <HugeiconsIcon icon={Package01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {bootstrap.packages.length}
              </div>
              <p className="text-xs text-muted-foreground">
                {bootstrap.packages.length === 1
                  ? "package loaded"
                  : "packages loaded"}
              </p>
              <div className="mt-3 flex flex-col gap-1">
                {bootstrap.packages.slice(0, 3).map((pkg) => (
                  <div
                    key={pkg.packageId}
                    className="flex items-center gap-2 text-xs"
                  >
                    <div className="size-1.5 rounded-full bg-primary" />
                    <span className="truncate font-mono">
                      {pkg.packageName || truncateId(pkg.packageId)}
                    </span>
                    {pkg.packageVersion && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        {pkg.packageVersion}
                      </Badge>
                    )}
                  </div>
                ))}
                {bootstrap.packages.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{bootstrap.packages.length - 3} more
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* User Rights */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">User Rights</CardTitle>
              <CardAction>
                <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {bootstrap.userRights.length}
              </div>
              <p className="text-xs text-muted-foreground">
                {bootstrap.userRights.length === 1
                  ? "right assigned"
                  : "rights assigned"}
              </p>
              <div className="mt-3 flex flex-col gap-1">
                {bootstrap.userRights.slice(0, 4).map((right, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge
                      variant={
                        right.type === "ParticipantAdmin"
                          ? "default"
                          : "secondary"
                      }
                      className="text-[10px] px-1.5 py-0"
                    >
                      {right.type}
                    </Badge>
                    {"party" in right && (
                      <span className="truncate font-mono text-muted-foreground">
                        {right.party}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="mb-3 text-lg font-semibold">Quick Actions</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 py-3"
              onClick={() => navigate({ to: "/acs" })}
            >
              <HugeiconsIcon icon={EyeIcon} strokeWidth={2} data-icon="inline-start" />
              <div className="flex-1 text-left">
                <div className="font-medium">Browse Contracts</div>
                <div className="text-xs text-muted-foreground">
                  Inspect active contract set
                </div>
              </div>
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 py-3"
              onClick={() => navigate({ to: "/events" })}
            >
              <HugeiconsIcon icon={Activity01Icon} strokeWidth={2} data-icon="inline-start" />
              <div className="flex-1 text-left">
                <div className="font-medium">Watch Events</div>
                <div className="text-xs text-muted-foreground">
                  Real-time event stream
                </div>
              </div>
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 py-3"
              onClick={() => navigate({ to: "/simulate" })}
            >
              <HugeiconsIcon icon={TestTube01Icon} strokeWidth={2} data-icon="inline-start" />
              <div className="flex-1 text-left">
                <div className="font-medium">New Simulation</div>
                <div className="text-xs text-muted-foreground">
                  Dry-run a transaction
                </div>
              </div>
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
            </Button>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="mb-3 text-lg font-semibold">Recent Activity</h2>
          <Card>
            <CardContent className="p-0">
              {recentEvents.length === 0 ? (
                <Empty className="py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <HugeiconsIcon icon={Activity01Icon} strokeWidth={2} />
                    </EmptyMedia>
                    <EmptyTitle>No events yet</EmptyTitle>
                    <EmptyDescription>
                      Events will appear here as they stream in
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="divide-y">
                    {recentEvents.map((event) => (
                      <div
                        key={event.updateId}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <div
                          className={cn(
                            "size-2 rounded-full",
                            event.updateType === "transaction"
                              ? "bg-primary"
                              : event.updateType === "reassignment"
                                ? "bg-chart-2"
                                : "bg-muted-foreground/40"
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              {event.updateType}
                            </Badge>
                            <span className="truncate font-mono text-xs text-muted-foreground">
                              {truncateId(event.updateId)}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {event.events.length}{" "}
                            {event.events.length === 1 ? "event" : "events"}
                            {event.events[0] &&
                              "templateId" in event.events[0] && (
                                <>
                                  {" - "}
                                  <span className="font-mono">
                                    {formatTemplateId(event.events[0].templateId)}
                                  </span>
                                </>
                              )}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(event.recordTime), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Feature Descriptors */}
        {bootstrap.featureDescriptors.length > 0 && (
          <div>
            <h2 className="mb-3 text-lg font-semibold">
              Participant Features
            </h2>
            <Card>
              <CardContent className="p-4">
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

        {parties.length > 0 && (
          <div>
            <Separator className="mb-4" />
            <p className="text-xs text-muted-foreground">
              Acting as:{" "}
              {parties.map((p) => (
                <span key={p} className="truncate font-mono">
                  {p}
                </span>
              ))}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
