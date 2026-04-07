"use client";

import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  Database01Icon,
  Package01Icon,
  Activity01Icon,
  GitBranchIcon,
  Bug01Icon,
  ServerStack01Icon,
  Settings02Icon,
  Plug01Icon,
  PaintBoardIcon,
} from "@hugeicons/core-free-icons";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

const NAVIGATION_ITEMS = [
  { name: "Dashboard", icon: DashboardSquare01Icon, path: "/" },
  { name: "Contracts", icon: Database01Icon, path: "/contracts" },
  { name: "Templates", icon: Package01Icon, path: "/templates" },
  { name: "Events", icon: Activity01Icon, path: "/events" },
  { name: "Transactions", icon: GitBranchIcon, path: "/transactions" },
  { name: "Debugger", icon: Bug01Icon, path: "/debugger" },
  { name: "Sandbox", icon: ServerStack01Icon, path: "/sandbox" },
  { name: "Settings", icon: Settings02Icon, path: "/settings" },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect?: () => void;
}

export function CommandPalette({ open, onOpenChange, onConnect }: CommandPaletteProps) {
  const navigate = useNavigate();
  const handleSelect = useCallback(
    (path: string) => {
      onOpenChange(false);
      navigate({ to: path });
    },
    [navigate, onOpenChange]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages, actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigate">
          {NAVIGATION_ITEMS.map((item) => (
            <CommandItem
              key={item.path}
              value={item.name}
              onSelect={() => handleSelect(item.path)}
            >
              <HugeiconsIcon icon={item.icon} strokeWidth={1.5} className="size-4 text-muted-foreground" />
              {item.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem
            value="Connect to participant"
            onSelect={() => {
              onOpenChange(false);
              onConnect?.();
            }}
          >
            <HugeiconsIcon icon={Plug01Icon} strokeWidth={1.5} className="size-4 text-muted-foreground" />
            Connect to participant
          </CommandItem>
          <CommandItem
            value="Toggle theme"
            onSelect={() => {
              onOpenChange(false);
              document.documentElement.classList.toggle("dark");
            }}
          >
            <HugeiconsIcon icon={PaintBoardIcon} strokeWidth={1.5} className="size-4 text-muted-foreground" />
            Toggle theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
