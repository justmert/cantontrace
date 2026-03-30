import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  Database01Icon,
  Package01Icon,
  Activity01Icon,
  GitBranchIcon,
  Bug01Icon,
  ServerStack01Icon,
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
import { CommandPalette } from "@/components/command-palette";
import { useConnectionStore } from "@/stores/connection-store";

interface NavItem {
  title: string;
  href: string;
  icon: IconSvgElement;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Explore",
    items: [
      { title: "Dashboard", href: "/", icon: DashboardSquare01Icon },
      { title: "Contracts", href: "/contracts", icon: Database01Icon },
      { title: "Templates", href: "/templates", icon: Package01Icon },
      { title: "Events", href: "/events", icon: Activity01Icon },
      { title: "Transactions", href: "/transactions", icon: GitBranchIcon },
    ],
  },
  {
    label: "Debug",
    items: [
      { title: "Debugger", href: "/debugger", icon: Bug01Icon },
    ],
  },
  {
    label: "Manage",
    items: [
      { title: "Sandbox", href: "/sandbox", icon: ServerStack01Icon },
    ],
  },
];

const bottomNavItems: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings02Icon },
];

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { status, bootstrap, config } = useConnectionStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

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
            {navGroups.map((group) => (
              <div key={group.label}>
                {collapsed ? (
                  <div className="mx-3 my-2">
                    <Separator />
                  </div>
                ) : (
                  <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50 px-3 pt-4 pb-1">
                    {group.label}
                  </div>
                )}
                {group.items.map((item) => {
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
              </div>
            ))}
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
            <button
              onClick={() => setCommandOpen(true)}
              className="hidden sm:flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <span>Search...</span>
              <kbd className="pointer-events-none rounded border border-border/50 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                ⌘K
              </kbd>
            </button>

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
          <div className="flex-1 animate-in fade-in slide-in-from-bottom-1 duration-200 fill-mode-forwards">
            <Outlet />
          </div>
        </main>
      </div>

      <ConnectionDialog open={connectionOpen} onOpenChange={setConnectionOpen} />
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onConnect={() => setConnectionOpen(true)}
      />
    </div>
  );
}
