import { useState, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PackageIcon,
  Folder01Icon,
  FileCodeIcon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { truncateId } from "@/lib/utils";
import type { PackageSummary, PackageDetail, ModuleDetail } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelectedTemplate {
  packageId: string;
  moduleName: string;
  templateName: string;
}

export interface PackageSidebarProps {
  packages: PackageSummary[];
  packageDetails: Map<string, PackageDetail>;
  isLoading: boolean;
  selected: SelectedTemplate | null;
  onSelectTemplate: (selection: SelectedTemplate) => void;
  onExpandPackage: (packageId: string) => void;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
          <div className="ml-4 h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Package accordion item
// ---------------------------------------------------------------------------

function PackageItem({
  pkg,
  detail,
  selected,
  filter,
  onExpand,
  onSelectTemplate,
}: {
  pkg: PackageSummary;
  detail: PackageDetail | undefined;
  selected: SelectedTemplate | null;
  filter: string;
  onExpand: () => void;
  onSelectTemplate: (selection: SelectedTemplate) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = () => {
    if (!expanded && !detail) {
      onExpand();
    }
    setExpanded(!expanded);
  };

  // Filter modules & templates by search query
  const filteredModules = useMemo(() => {
    if (!detail) return [];
    if (!filter) return detail.modules;
    const q = filter.toLowerCase();
    return detail.modules
      .map((mod) => ({
        ...mod,
        templates: mod.templates.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            mod.name.toLowerCase().includes(q)
        ),
      }))
      .filter((mod) => mod.templates.length > 0);
  }, [detail, filter]);

  return (
    <div>
      <button
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
        onClick={handleToggle}
      >
        {expanded ? (
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <HugeiconsIcon icon={PackageIcon} strokeWidth={2} className="size-3.5 shrink-0 text-primary" />
        <div className="flex flex-1 flex-col overflow-hidden">
          <span className="truncate font-medium">
            {pkg.packageName ?? "Unnamed Package"}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {pkg.packageVersion && (
              <span>v{pkg.packageVersion}</span>
            )}
            <span className="font-mono">{truncateId(pkg.packageId, 6)}</span>
          </span>
        </div>
      </button>

      {expanded && (
        <div className="ml-4 border-l pl-2">
          {!detail ? (
            <div className="flex flex-col gap-1 py-1">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="h-4 w-2/3 animate-pulse rounded bg-muted"
                />
              ))}
            </div>
          ) : filteredModules.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              No matching templates
            </p>
          ) : (
            filteredModules.map((mod) => (
              <ModuleItem
                key={mod.name}
                packageId={pkg.packageId}
                module={mod}
                selected={selected}
                onSelectTemplate={onSelectTemplate}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module sub-item
// ---------------------------------------------------------------------------

function ModuleItem({
  packageId,
  module: mod,
  selected,
  onSelectTemplate,
}: {
  packageId: string;
  module: ModuleDetail;
  selected: SelectedTemplate | null;
  onSelectTemplate: (selection: SelectedTemplate) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const handleModuleClick = () => {
    setExpanded(!expanded);
    // Also select the first template in the module so clicking a module
    // name immediately shows template details in the right panel.
    if (mod.templates.length > 0) {
      onSelectTemplate({
        packageId,
        moduleName: mod.name,
        templateName: mod.templates[0].name,
      });
    }
  };

  return (
    <div>
      <button
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
        onClick={handleModuleClick}
      >
        {expanded ? (
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3 shrink-0 text-muted-foreground" />
        )}
        <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium text-muted-foreground">
          {mod.name}
        </span>
        <Badge variant="secondary" className="ml-auto text-[9px] px-1 py-0">
          {mod.templates.length}
        </Badge>
      </button>

      {expanded && (
        <div className="ml-4">
          {mod.templates.length === 0 && (
            <p className="px-2 py-1 text-[10px] italic text-muted-foreground">
              No templates (types only)
            </p>
          )}
          {mod.templates.map((tmpl) => {
            const isSelected =
              selected?.packageId === packageId &&
              selected?.moduleName === mod.name &&
              selected?.templateName === tmpl.name;
            return (
              <button
                key={tmpl.name}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent",
                  isSelected && "bg-accent font-semibold"
                )}
                onClick={() =>
                  onSelectTemplate({
                    packageId,
                    moduleName: mod.name,
                    templateName: tmpl.name,
                  })
                }
              >
                <HugeiconsIcon icon={FileCodeIcon} strokeWidth={2} className="size-3 shrink-0 text-primary" />
                <span className="truncate">{tmpl.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function PackageSidebar({
  packages,
  packageDetails,
  isLoading,
  selected,
  onSelectTemplate,
  onExpandPackage,
}: PackageSidebarProps) {
  const [filter, setFilter] = useState("");

  const filteredPackages = useMemo(() => {
    if (!filter) return packages;
    const q = filter.toLowerCase();
    return packages.filter(
      (pkg) =>
        (pkg.packageName ?? "").toLowerCase().includes(q) ||
        pkg.packageId.toLowerCase().includes(q)
    );
  }, [packages, filter]);

  return (
    <div>
      {/* Search — sticky at top */}
      <div className="sticky top-0 z-10 border-b bg-background p-3">
        <div className="relative">
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search packages & templates..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Package list */}
      <div className="flex flex-col gap-0.5 p-2">
        {isLoading ? (
          <SidebarSkeleton />
        ) : filteredPackages.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            No packages found
          </p>
        ) : (
          filteredPackages.map((pkg) => (
            <PackageItem
              key={pkg.packageId}
              pkg={pkg}
              detail={packageDetails.get(pkg.packageId)}
              selected={selected}
              filter={filter}
              onExpand={() => onExpandPackage(pkg.packageId)}
              onSelectTemplate={onSelectTemplate}
            />
          ))
        )}
      </div>
    </div>
  );
}
