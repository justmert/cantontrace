import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  Plug01Icon,
  Globe02Icon,
  Clock01Icon,
  ArrowUpRight01Icon,
  Copy01Icon,
  Tick02Icon,
  PlusSignIcon,
  MinusSignIcon,
  FlashIcon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectionDialog } from "@/components/connection-dialog";
import { useConnectionStore } from "@/stores/connection-store";
import { useEventStreamStore } from "@/stores/event-stream-store";
import { api } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import {
  cn,
  truncateId,
  formatTemplateId,
  formatPartyId,
  stringToHue,
  formatTimestamp,
} from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

// ─── Disconnected Welcome ─────────────────────────────────────────────
function WelcomeView({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="relative mb-8">
          <div className="flex size-20 items-center justify-center rounded-3xl bg-primary/10 ring-1 ring-primary/20">
            <HugeiconsIcon icon={Globe02Icon} strokeWidth={1.5} className="size-10 text-primary" />
          </div>
          <div className="absolute -right-1 -top-1 size-4 rounded-full bg-muted-foreground/30 ring-2 ring-background" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">CantonTrace</h1>
        <p className="mt-2 text-balance text-sm leading-relaxed text-muted-foreground">
          Debug Daml smart contracts on the Canton Network. Connect to a participant node to inspect contracts, trace executions, and analyze transactions.
        </p>
        <Button size="lg" className="mt-8 gap-2 px-8" onClick={onConnect}>
          <HugeiconsIcon icon={Plug01Icon} strokeWidth={2} data-icon="inline-start" />
          Connect to Participant
        </Button>
        <p className="mt-4 text-xs text-muted-foreground/60">Or create a local sandbox from the connection dialog</p>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  loading,
  onClick,
  children,
}: {
  label: string;
  value: string | number;
  sub?: string;
  loading?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-1 rounded-xl border bg-card/50 px-4 py-3.5 text-left ring-1 ring-border/50 transition-all hover:bg-card hover:ring-primary/20"
    >
      <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
        {label}
      </span>
      <div className="flex items-end justify-between">
        {loading ? (
          <div className="h-7 w-10 animate-pulse rounded bg-muted" />
        ) : (
          <span className="font-mono text-2xl font-semibold tabular-nums leading-none tracking-tight">
            {value}
          </span>
        )}
        {children}
      </div>
      {sub && <span className="text-[10px] text-muted-foreground/60">{sub}</span>}
    </button>
  );
}

// ─── Activity Row ─────────────────────────────────────────────────────
function ActivityRow({
  type,
  firstEventType,
  templateName,
  eventCount,
  time,
  onClick,
}: {
  type: string;
  firstEventType?: string;
  templateName: string;
  eventCount: number;
  time: string;
  onClick: () => void;
}) {
  const dotColor =
    firstEventType === "created" ? "bg-event-create"
    : firstEventType === "archived" ? "bg-event-archive"
    : firstEventType === "exercised" ? "bg-event-exercise"
    : type === "reassignment" ? "bg-event-reassign"
    : "bg-muted-foreground/30";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/30"
    >
      <div className={cn("size-1.5 shrink-0 rounded-full", dotColor)} />
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{templateName || type}</span>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/40">
        {eventCount}e · {time}
      </span>
    </button>
  );
}

// ─── Party Row ────────────────────────────────────────────────────────
function PartyRow({ party }: { party: string }) {
  const name = formatPartyId(party);
  const hue = stringToHue(name);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5">
      <span
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold uppercase leading-none"
        style={{ backgroundColor: `oklch(0.75 0.1 ${hue})`, color: `oklch(0.25 0.05 ${hue})` }}
      >
        {name.charAt(0)}
      </span>
      <span className="flex-1 truncate text-xs font-medium">{name}</span>
      <span className="hidden max-w-[140px] truncate font-mono text-[10px] text-muted-foreground/40 sm:block">
        {truncateId(party, 20)}
      </span>
      <button
        type="button"
        className="shrink-0 text-muted-foreground/30 transition-colors hover:text-foreground"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(party);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
      >
        <HugeiconsIcon
          icon={copied ? Tick02Icon : Copy01Icon}
          strokeWidth={2}
          className={cn("size-3", copied && "text-primary")}
        />
      </button>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────
export default function DashboardPage() {
  const { status, bootstrap, config } = useConnectionStore();
  const events = useEventStreamStore((s) => s.events);
  const streamStatus = useEventStreamStore((s) => s.connectionStatus);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const navigate = useNavigate();

  // Fetch active contracts for count
  const { data: acsData, isLoading: acsLoading } = useQuery({
    queryKey: ["dashboard", "acs-count"],
    queryFn: async () => {
      const res = await api.getACS({ pageSize: 200 });
      return res.data;
    },
    enabled: status === "connected",
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Fetch failed completions count
  const { data: failedCompletions } = useQuery({
    queryKey: ["dashboard", "failed-completions"],
    queryFn: async () => {
      const res = await api.getCompletions({ status: "failed", pageSize: 5 });
      return res.data ?? [];
    },
    enabled: status === "connected",
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Compute event type breakdown from accumulated events
  const eventBreakdown = useMemo(() => {
    let creates = 0, archives = 0, exercises = 0, other = 0;
    for (const update of events) {
      for (const evt of update.events ?? []) {
        const t = (evt as { eventType?: string }).eventType;
        if (t === "created") creates++;
        else if (t === "archived") archives++;
        else if (t === "exercised") exercises++;
        else other++;
      }
    }
    return { creates, archives, exercises, other, total: creates + archives + exercises + other };
  }, [events]);

  // Top templates by activity
  const topTemplates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const update of events) {
      for (const evt of update.events ?? []) {
        if ("templateId" in evt) {
          const name = formatTemplateId((evt as { templateId: string }).templateId);
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [events]);

  if (status !== "connected" || !bootstrap) {
    return (
      <>
        <WelcomeView onConnect={() => setConnectionOpen(true)} />
        <ConnectionDialog open={connectionOpen} onOpenChange={setConnectionOpen} />
      </>
    );
  }

  const recentEvents = events.slice(0, 20);
  const knownParties = bootstrap.knownParties ?? [];
  const userRights = bootstrap.userRights ?? [];
  const hasAuth = userRights.length > 0;
  const endpoint = config?.ledgerApiEndpoint ?? "—";
  const isStreaming = streamStatus === "connected";

  const contractCount = acsData?.contracts?.length ?? "—";
  const failedCount = failedCompletions?.length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={DashboardSquare01Icon}
        title="Dashboard"
        subtitle={`Connected ${formatDistanceToNow(new Date(bootstrap.connectedAt), { addSuffix: true })}`}
      >
        <Badge variant="outline" className="gap-1.5 border-primary/30 text-primary">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40" />
            <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
          </span>
          Connected
        </Badge>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-5">
          {/* ── Row 1: 4 Stat cards ───────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Active Contracts"
              value={contractCount}
              loading={acsLoading}
              sub="On ledger now"
              onClick={() => navigate({ to: "/contracts" })}
            />
            <StatCard
              label="Events"
              value={events.length}
              sub={isStreaming ? "Streaming live" : "Stream paused"}
              onClick={() => navigate({ to: "/events" })}
            >
              {isStreaming && (
                <span className="relative flex size-2 mb-1">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-event-create opacity-50" />
                  <span className="relative inline-flex size-2 rounded-full bg-event-create" />
                </span>
              )}
            </StatCard>
            <StatCard
              label="Packages"
              value={bootstrap.packages.length}
              sub="Deployed"
              onClick={() => navigate({ to: "/templates" })}
            />
            <StatCard
              label="Parties"
              value={knownParties.length}
              sub={hasAuth ? `${userRights.length} rights` : "sandbox"}
            >
              <div className="flex -space-x-1 mb-0.5">
                {knownParties.slice(0, 4).map((p) => {
                  const name = formatPartyId(p);
                  const hue = stringToHue(name);
                  return (
                    <span
                      key={p}
                      className="inline-flex size-4 items-center justify-center rounded-full text-[7px] font-bold uppercase ring-1 ring-background"
                      style={{ backgroundColor: `oklch(0.75 0.1 ${hue})`, color: `oklch(0.25 0.05 ${hue})` }}
                    >
                      {name.charAt(0)}
                    </span>
                  );
                })}
                {knownParties.length > 4 && (
                  <span className="inline-flex size-4 items-center justify-center rounded-full bg-muted text-[7px] font-medium text-muted-foreground ring-1 ring-background">
                    +{knownParties.length - 4}
                  </span>
                )}
              </div>
            </StatCard>
          </div>

          {/* ── Row 2: Two-column — Activity + Sidebar ─────── */}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            {/* Left: Activity Feed */}
            <div className="flex flex-col rounded-xl border bg-card/30 ring-1 ring-border/30">
              <div className="flex items-center justify-between border-b border-border/30 px-4 py-2.5">
                <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                  Recent Activity
                </h2>
                <div className="flex items-center gap-3">
                  {events.length > 0 && (
                    <span className="text-[10px] tabular-nums text-muted-foreground/40">{events.length} total</span>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/events" })}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground/50 transition-colors hover:text-primary"
                  >
                    View all
                    <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} className="size-2.5" />
                  </button>
                </div>
              </div>

              {recentEvents.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
                    <HugeiconsIcon icon={Clock01Icon} strokeWidth={1.5} className="size-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground/60">No events yet</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/40">Activity appears as transactions stream in</p>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border/20">
                  {recentEvents.map((event, i) => {
                    const firstEvent = (event.events ?? [])[0];
                    const templateName = firstEvent && "templateId" in firstEvent ? formatTemplateId(firstEvent.templateId) : "";
                    const firstEventType = firstEvent && "eventType" in firstEvent ? (firstEvent as { eventType: string }).eventType : undefined;
                    return (
                      <ActivityRow
                        key={`${event.updateId}-${i}`}
                        type={event.updateType}
                        firstEventType={firstEventType}
                        templateName={templateName}
                        eventCount={(event.events ?? []).length}
                        time={event.recordTime ? formatTimestamp(event.recordTime, "relative") : ""}
                        onClick={() => navigate({ to: "/transactions/$updateId", params: { updateId: event.updateId } })}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right sidebar: stacked panels */}
            <div className="flex flex-col gap-4">
              {/* Event Breakdown */}
              <div className="rounded-xl border bg-card/30 ring-1 ring-border/30">
                <div className="border-b border-border/30 px-4 py-2.5">
                  <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Event Breakdown</h2>
                </div>
                <div className="flex flex-col gap-2 px-4 py-3">
                  {eventBreakdown.total === 0 ? (
                    <p className="py-2 text-center text-[10px] text-muted-foreground/40">No events yet</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3 text-event-create" />
                          <span className="text-xs">Created</span>
                        </div>
                        <span className="font-mono text-xs tabular-nums">{eventBreakdown.creates}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="size-3 text-event-archive" />
                          <span className="text-xs">Archived</span>
                        </div>
                        <span className="font-mono text-xs tabular-nums">{eventBreakdown.archives}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HugeiconsIcon icon={FlashIcon} strokeWidth={2} className="size-3 text-event-exercise" />
                          <span className="text-xs">Exercised</span>
                        </div>
                        <span className="font-mono text-xs tabular-nums">{eventBreakdown.exercises}</span>
                      </div>
                      {failedCount > 0 && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} className="size-3 text-destructive" />
                            <span className="text-xs text-destructive">Errors</span>
                          </div>
                          <span className="font-mono text-xs tabular-nums text-destructive">{failedCount}</span>
                        </div>
                      )}
                      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted/30">
                        {eventBreakdown.creates > 0 && (
                          <div className="bg-event-create" style={{ width: `${(eventBreakdown.creates / eventBreakdown.total) * 100}%` }} />
                        )}
                        {eventBreakdown.archives > 0 && (
                          <div className="bg-event-archive" style={{ width: `${(eventBreakdown.archives / eventBreakdown.total) * 100}%` }} />
                        )}
                        {eventBreakdown.exercises > 0 && (
                          <div className="bg-event-exercise" style={{ width: `${(eventBreakdown.exercises / eventBreakdown.total) * 100}%` }} />
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Active Templates */}
              <div className="rounded-xl border bg-card/30 ring-1 ring-border/30">
                <div className="border-b border-border/30 px-4 py-2.5">
                  <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Active Templates</h2>
                </div>
                <div className="flex flex-col divide-y divide-border/20">
                  {topTemplates.length === 0 ? (
                    <p className="px-4 py-3 text-center text-[10px] text-muted-foreground/40">No activity yet</p>
                  ) : (
                    topTemplates.map(([name, count]) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => navigate({ to: "/templates" })}
                        className="flex items-center justify-between px-4 py-2 text-left transition-colors hover:bg-muted/30"
                      >
                        <span className="truncate font-mono text-xs">{name}</span>
                        <Badge variant="secondary" className="ml-2 shrink-0 px-1.5 py-0 text-[9px] tabular-nums">{count}</Badge>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Connection */}
              <div className="rounded-xl border bg-card/30 ring-1 ring-border/30">
                <div className="border-b border-border/30 px-4 py-2.5">
                  <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Connection</h2>
                </div>
                <div className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground/50">Endpoint</span>
                    <span className="max-w-[180px] truncate font-mono text-[11px] text-foreground/80">{endpoint}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground/50">API</span>
                    <span className="font-mono text-[11px] text-primary">{bootstrap.apiVersion}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground/50">Offset</span>
                    <span className="font-mono text-[11px] tabular-nums">{bootstrap.currentOffset}</span>
                  </div>
                  {bootstrap.pruningOffset && bootstrap.pruningOffset !== "0" && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground/50">Pruned</span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">&lt; {bootstrap.pruningOffset}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground/50">Stream</span>
                    <span className={cn("text-[11px]", isStreaming ? "text-event-create" : "text-muted-foreground")}>
                      {isStreaming ? "Live" : "Disconnected"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Parties */}
              {knownParties.length > 0 && (
                <div className="rounded-xl border bg-card/30 ring-1 ring-border/30">
                  <div className="border-b border-border/30 px-4 py-2.5">
                    <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Parties ({knownParties.length})</h2>
                  </div>
                  <div className="flex flex-col divide-y divide-border/20 py-1">
                    {knownParties.map((p) => (
                      <PartyRow key={p} party={p} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
