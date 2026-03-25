import { useState, useEffect } from "react";
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
  Bug01Icon,
  Clock01Icon,
  ArrowDown01Icon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { ConnectionDialog } from "@/components/connection-dialog";
import { useConnectionStore } from "@/stores/connection-store";
import { useEventStreamStore } from "@/stores/event-stream-store";
import { formatDistanceToNow } from "date-fns";
import { cn, truncateId, formatTemplateId } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────
interface NavCardProps {
  icon: typeof EyeIcon;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}

// ─── Disconnected Welcome ─────────────────────────────────────────────
function WelcomeView({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center text-center">
        {/* Logo mark */}
        <div className="relative mb-8">
          <div className="flex size-20 items-center justify-center rounded-3xl bg-primary/10 ring-1 ring-primary/20">
            <HugeiconsIcon
              icon={Globe02Icon}
              strokeWidth={1.5}
              className="size-10 text-primary"
            />
          </div>
          <div className="absolute -right-1 -top-1 size-4 rounded-full bg-muted-foreground/30 ring-2 ring-background" />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          CantonTrace
        </h1>
        <p className="mt-2 text-balance text-sm leading-relaxed text-muted-foreground">
          Debug Daml smart contracts on the Canton Network. Connect to a
          participant node to inspect contracts, trace executions, and analyze
          transactions.
        </p>

        <Button
          size="lg"
          className="mt-8 gap-2 px-8"
          onClick={onConnect}
        >
          <HugeiconsIcon icon={Plug01Icon} strokeWidth={2} data-icon="inline-start" />
          Connect to Participant
        </Button>

        <p className="mt-4 text-xs text-muted-foreground/60">
          Or create a local sandbox from the connection dialog
        </p>
      </div>
    </div>
  );
}

// ─── Stat Pill ────────────────────────────────────────────────────────
function StatPill({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-xl font-semibold tabular-nums tracking-tight",
          accent && "text-primary"
        )}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[10px] text-muted-foreground">{sub}</span>
      )}
    </div>
  );
}

// ─── Nav Card ─────────────────────────────────────────────────────────
function NavCard({ icon, title, description, badge, onClick }: NavCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex items-center gap-4 rounded-xl border border-transparent bg-card/50 px-4 py-3.5 text-left ring-1 ring-border/50 transition-all hover:border-primary/20 hover:bg-card hover:ring-primary/30 hover:shadow-sm"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium">{title}</span>
          {badge && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
              {badge}
            </Badge>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">{description}</span>
      </div>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        strokeWidth={2}
        className="size-3.5 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </button>
  );
}

// ─── Activity Row ─────────────────────────────────────────────────────
function ActivityRow({
  type,
  templateName,
  updateId,
  eventCount,
  time,
  onClick,
}: {
  type: string;
  templateName: string;
  updateId: string;
  eventCount: number;
  time: string;
  onClick: () => void;
}) {
  const typeColor =
    type === "transaction"
      ? "bg-primary/80"
      : type === "reassignment"
        ? "bg-chart-2"
        : "bg-muted-foreground/30";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50"
    >
      <div className={cn("size-1.5 shrink-0 rounded-full", typeColor)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-xs font-medium">
            {templateName || type}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/50">
            {truncateId(updateId, 8)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] tabular-nums text-muted-foreground/60">
          {eventCount}e
        </span>
        <span className="text-[10px] text-muted-foreground/40">{time}</span>
      </div>
    </button>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────
export default function DashboardPage() {
  const { status, bootstrap } = useConnectionStore();
  const events = useEventStreamStore((s) => s.events);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const navigate = useNavigate();

  if (status !== "connected" || !bootstrap) {
    return (
      <>
        <WelcomeView onConnect={() => setConnectionOpen(true)} />
        <ConnectionDialog
          open={connectionOpen}
          onOpenChange={setConnectionOpen}
        />
      </>
    );
  }

  const recentEvents = events.slice(0, 12);
  const knownParties = bootstrap.knownParties ?? [];
  const userRights = bootstrap.userRights ?? [];
  const hasAuth = userRights.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
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

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-6">
          {/* ── Status Bar ─────────────────────────────────────── */}
          <div className="flex items-end justify-between rounded-2xl border bg-card/50 px-6 py-5 ring-1 ring-border/50">
            <div className="flex items-center gap-10">
              <StatPill
                label="API Version"
                value={bootstrap.apiVersion}
                accent
              />
              <Separator orientation="vertical" className="h-10" />
              <StatPill
                label="Parties"
                value={knownParties.length}
                sub={hasAuth ? `${userRights.length} rights` : "sandbox mode"}
              />
              <Separator orientation="vertical" className="h-10" />
              <StatPill
                label="Packages"
                value={bootstrap.packages.length}
              />
              <Separator orientation="vertical" className="h-10" />
              <StatPill
                label="Ledger Offset"
                value={bootstrap.currentOffset}
                sub={
                  bootstrap.pruningOffset && bootstrap.pruningOffset !== "0"
                    ? `pruned < ${bootstrap.pruningOffset}`
                    : undefined
                }
              />
            </div>
            <Badge
              variant="outline"
              className="gap-1.5 border-primary/30 text-primary"
            >
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40" />
                <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
              </span>
              Connected
            </Badge>
          </div>

          {/* ── Two-column layout ──────────────────────────────── */}
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
            {/* Left: Navigation */}
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                  Inspect
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  <NavCard
                    icon={EyeIcon}
                    title="Active Contracts"
                    description="Browse & filter the ACS"
                    onClick={() => navigate({ to: "/acs" })}
                  />
                  <NavCard
                    icon={FileSearchIcon}
                    title="Templates"
                    description="Package & template definitions"
                    badge={`${bootstrap.packages.length}`}
                    onClick={() => navigate({ to: "/templates" })}
                  />
                  <NavCard
                    icon={Activity01Icon}
                    title="Event Stream"
                    description="Real-time ledger events"
                    onClick={() => navigate({ to: "/events" })}
                  />
                  <NavCard
                    icon={Database01Icon}
                    title="Transactions"
                    description="Tree view & state diff"
                    onClick={() => navigate({ to: "/transactions" })}
                  />
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                  Debug
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  <NavCard
                    icon={Bug01Icon}
                    title="Execution Trace"
                    description="Step-through Daml debugger"
                    onClick={() => navigate({ to: "/trace" })}
                  />
                  <NavCard
                    icon={TestTube01Icon}
                    title="Simulator"
                    description="Preflight transaction testing"
                    onClick={() => navigate({ to: "/simulate" })}
                  />
                  <NavCard
                    icon={AlertCircleIcon}
                    title="Error Debugger"
                    description="Failed command analysis"
                    onClick={() => navigate({ to: "/errors" })}
                  />
                  <NavCard
                    icon={ShuffleIcon}
                    title="Workflows"
                    description="Cross-transaction tracing"
                    onClick={() => navigate({ to: "/workflows" })}
                  />
                </div>
              </div>

              {/* Feature Tags */}
              {bootstrap.featureDescriptors.length > 0 && (
                <div className="mt-1">
                  <h2 className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                    Participant Capabilities
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    {bootstrap.featureDescriptors.map((f) => (
                      <span
                        key={f.name}
                        className="inline-flex rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground ring-1 ring-border/50"
                      >
                        {f.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Activity Feed */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                  Recent Activity
                </h2>
                {recentEvents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/events" })}
                    className="text-[10px] text-muted-foreground/50 transition-colors hover:text-primary"
                  >
                    View all →
                  </button>
                )}
              </div>

              <div className="mt-2 flex flex-1 flex-col rounded-xl border bg-card/30 ring-1 ring-border/30">
                {recentEvents.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                    <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
                      <HugeiconsIcon
                        icon={Clock01Icon}
                        strokeWidth={1.5}
                        className="size-5 text-muted-foreground/50"
                      />
                    </div>
                    <p className="text-xs font-medium text-muted-foreground/60">
                      No events yet
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground/40">
                      Activity appears as transactions stream in
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col divide-y divide-border/30 p-1">
                    {recentEvents.map((event, i) => {
                      const firstEvent = (event.events ?? [])[0];
                      const templateName =
                        firstEvent && "templateId" in firstEvent
                          ? formatTemplateId(firstEvent.templateId)
                          : "";

                      return (
                        <ActivityRow
                          key={`${event.updateId}-${i}`}
                          type={event.updateType}
                          templateName={templateName}
                          updateId={event.updateId}
                          eventCount={(event.events ?? []).length}
                          time={
                            event.recordTime
                              ? formatDistanceToNow(
                                  new Date(event.recordTime),
                                  { addSuffix: true }
                                )
                              : ""
                          }
                          onClick={() =>
                            navigate({
                              to: "/transactions/$updateId",
                              params: { updateId: event.updateId },
                            })
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
