import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  Database01Icon,
  Package01Icon,
  Activity01Icon,
  GitBranchIcon,
  Alert02Icon,
  Clock01Icon,
  CpuIcon,
  TestTube01Icon,
  Flowchart01Icon,
  EyeIcon,
  ServerStack01Icon,
  ArrowLeftRightIcon,
  Settings02Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Plug01Icon,
  Plug02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConnectionDialog } from "@/components/connection-dialog";
import { useConnectionStore } from "@/stores/connection-store";

interface NavItem {
  title: string;
  href: string;
  icon: IconSvgElement;
}

const mainNavItems: NavItem[] = [
  { title: "Dashboard", href: "/", icon: DashboardSquare01Icon },
  { title: "ACS Inspector", href: "/acs", icon: Database01Icon },
  { title: "Template Explorer", href: "/templates", icon: Package01Icon },
  { title: "Event Stream", href: "/events", icon: Activity01Icon },
  { title: "Transaction Explorer", href: "/transactions", icon: GitBranchIcon },
  { title: "Error Debugger", href: "/errors", icon: Alert02Icon },
  { title: "Contract Lifecycle", href: "/contracts", icon: Clock01Icon },
  { title: "Execution Trace", href: "/trace", icon: CpuIcon },
  { title: "Simulator", href: "/simulate", icon: TestTube01Icon },
  { title: "Workflow Debugger", href: "/workflows", icon: Flowchart01Icon },
  { title: "Privacy Visualizer", href: "/privacy", icon: EyeIcon },
  { title: "Sandbox Manager", href: "/sandbox", icon: ServerStack01Icon },
  { title: "Reassignment Tracker", href: "/reassignments", icon: ArrowLeftRightIcon },
];

const bottomNavItems: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings02Icon },
];

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { status, bootstrap, config } = useConnectionStore();

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname.startsWith(href);
  };

  const statusColor =
    status === "connected"
      ? "bg-green-500"
      : status === "connecting"
        ? "bg-yellow-500"
        : status === "error"
          ? "bg-red-500"
          : "bg-muted-foreground/40";

  const statusText =
    status === "connected"
      ? `Connected to ${bootstrap?.apiVersion ?? "..."}`
      : status === "connecting"
        ? "Connecting..."
        : status === "error"
          ? "Error"
          : "Disconnected";

  const participantParties =
    bootstrap?.userRights
      .filter(
        (r): r is { type: "CanActAs"; party: string } => r.type === "CanActAs"
      )
      .map((r) => r.party) ?? [];

  const knownParties = bootstrap?.knownParties ?? [];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo area */}
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          {!collapsed ? (
            <button
              onClick={() => navigate({ to: "/" })}
              className="flex items-center gap-2"
            >
              <div className="flex size-7 items-center justify-center rounded bg-sidebar-primary">
                <span className="text-xs font-bold text-sidebar-primary-foreground">
                  CT
                </span>
              </div>
              <span className="font-semibold tracking-tight">CantonTrace</span>
            </button>
          ) : (
            <button
              onClick={() => navigate({ to: "/" })}
              className="mx-auto"
            >
              <div className="flex size-7 items-center justify-center rounded bg-sidebar-primary">
                <span className="text-xs font-bold text-sidebar-primary-foreground">
                  CT
                </span>
              </div>
            </button>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="flex flex-col gap-1 px-2">
            {mainNavItems.map((item) => {
              const active = isActive(item.href);

              if (collapsed) {
                return (
                  <Tooltip key={item.href} delayDuration={0}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => navigate({ to: item.href })}
                        className={cn(
                          "flex w-full items-center justify-center rounded-md p-2 transition-colors",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.title}</TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <button
                  key={item.href}
                  onClick={() => navigate({ to: item.href })}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-4 shrink-0" />
                  <span className="truncate">{item.title}</span>
                </button>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Bottom nav */}
        <div className="border-t border-sidebar-border px-2 py-2">
          {bottomNavItems.map((item) => {
            const active = isActive(item.href);

            if (collapsed) {
              return (
                <Tooltip key={item.href} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => navigate({ to: item.href })}
                      className={cn(
                        "flex w-full items-center justify-center rounded-md p-2 transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.title}</TooltipContent>
                </Tooltip>
              );
            }

            return (
              <button
                key={item.href}
                onClick={() => navigate({ to: item.href })}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-4 shrink-0" />
                <span className="truncate">{item.title}</span>
              </button>
            );
          })}

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="mt-1 flex w-full items-center justify-center rounded-md p-2 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <HugeiconsIcon
              icon={collapsed ? ArrowRight01Icon : ArrowLeft01Icon}
              strokeWidth={2}
              className="size-4"
            />
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b bg-card px-4">
          <div className="flex items-center gap-4">
            {/* Connection status */}
            <button
              onClick={() => setConnectionOpen(true)}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent"
            >
              <div className={cn("size-2.5 rounded-full", statusColor)} />
              <span className="text-muted-foreground">{statusText}</span>
            </button>

            {config && status === "connected" && (
              <>
                <Separator orientation="vertical" className="h-5" />
                <span className="text-xs text-muted-foreground font-mono">
                  {config.ledgerApiEndpoint}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {participantParties.length > 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Party:</span>
                <span className="font-mono rounded bg-muted px-1.5 py-0.5">
                  {participantParties[0]}
                </span>
                {participantParties.length > 1 && (
                  <span className="text-muted-foreground/60">
                    +{participantParties.length - 1}
                  </span>
                )}
              </div>
            ) : status === "connected" && knownParties.length > 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono rounded bg-muted px-1.5 py-0.5">
                  {knownParties.length} {knownParties.length === 1 ? "party" : "parties"}
                </span>
              </div>
            ) : null}

            {status === "connected" ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConnectionOpen(true)}
              >
                <HugeiconsIcon icon={Plug02Icon} strokeWidth={2} />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConnectionOpen(true)}
              >
                <HugeiconsIcon icon={Plug01Icon} strokeWidth={2} data-icon="inline-start" />
                Connect
              </Button>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <ConnectionDialog open={connectionOpen} onOpenChange={setConnectionOpen} />
    </div>
  );
}
