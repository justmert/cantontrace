import { useState, useMemo, useEffect, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { cn, partitionPackages } from "@/lib/utils";
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
// Helper: count total templates in a package detail
// ---------------------------------------------------------------------------

function countTemplates(detail: PackageDetail | undefined): number {
  if (!detail) return -1; // unknown
  return detail.modules.reduce((sum, mod) => sum + mod.templates.length, 0);
}

// ---------------------------------------------------------------------------
// Package accordion item
// ---------------------------------------------------------------------------

function PackageItem({
  pkg,
  detail,
  selected,
  filter,
  forceExpanded,
  onExpand,
  onSelectTemplate,
}: {
  pkg: PackageSummary;
  detail: PackageDetail | undefined;
  selected: SelectedTemplate | null;
  filter: string;
  forceExpanded: boolean;
  onExpand: () => void;
  onSelectTemplate: (selection: SelectedTemplate) => void;
}) {
  // Auto-expand if a template in this package is selected
  const hasSelectedChild = selected?.packageId === pkg.packageId;
  const [manualExpanded, setManualExpanded] = useState(hasSelectedChild);

  // Auto-expand when selection changes to a template in this package
  useEffect(() => {
    if (hasSelectedChild && !manualExpanded) {
      setManualExpanded(true);
    }
  }, [hasSelectedChild]); // eslint-disable-line react-hooks/exhaustive-deps

  // When searching, force-expand overrides manual state
  const expanded = filter ? forceExpanded : manualExpanded;

  const handleToggle = () => {
    if (filter) return; // during search, expand is controlled
    if (!manualExpanded && !detail) {
      onExpand();
    }
    setManualExpanded(!manualExpanded);
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
                filter={filter}
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
// Compact system package row (zero templates)
// ---------------------------------------------------------------------------

function SystemPackageCompactItem({ pkg }: { pkg: PackageSummary }) {
  return (
    <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground/60">
      <HugeiconsIcon icon={PackageIcon} strokeWidth={2} className="size-3.5 shrink-0 text-muted-foreground/40" />
      <span className="truncate text-xs">
        {pkg.packageName ?? "Unnamed Package"}
      </span>
      <Badge variant="secondary" className="ml-auto text-[9px] px-1 py-0 text-muted-foreground/40">
        0 templates
      </Badge>
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
  filter,
  onSelectTemplate,
}: {
  packageId: string;
  module: ModuleDetail;
  selected: SelectedTemplate | null;
  filter: string;
  onSelectTemplate: (selection: SelectedTemplate) => void;
}) {
  const [manualExpanded, setManualExpanded] = useState(true);

  // When searching, always expand modules with matching templates
  const expanded = filter ? true : manualExpanded;

  const handleModuleClick = () => {
    if (!filter) {
      setManualExpanded(!manualExpanded);
    }
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
  const [showSystem, setShowSystem] = useState(true);

  // Partition packages into user vs system
  const [userPackages, systemPackages] = useMemo(
    () => partitionPackages(packages),
    [packages]
  );

  // Filter packages by search query
  const filteredUserPackages = useMemo(() => {
    if (!filter) return userPackages;
    const q = filter.toLowerCase();
    return userPackages.filter((pkg) => {
      // Include if package name/id matches
      if (
        (pkg.packageName ?? "").toLowerCase().includes(q) ||
        pkg.packageId.toLowerCase().includes(q)
      ) return true;
      // Include if any template in the package matches
      const detail = packageDetails.get(pkg.packageId);
      if (detail) {
        return detail.modules.some((mod) =>
          mod.name.toLowerCase().includes(q) ||
          mod.templates.some((t) => t.name.toLowerCase().includes(q))
        );
      }
      return false;
    });
  }, [userPackages, filter, packageDetails]);

  const filteredSystemPackages = useMemo(() => {
    if (!filter) return systemPackages;
    const q = filter.toLowerCase();
    return systemPackages.filter((pkg) => {
      if (
        (pkg.packageName ?? "").toLowerCase().includes(q) ||
        pkg.packageId.toLowerCase().includes(q)
      ) return true;
      const detail = packageDetails.get(pkg.packageId);
      if (detail) {
        return detail.modules.some((mod) =>
          mod.name.toLowerCase().includes(q) ||
          mod.templates.some((t) => t.name.toLowerCase().includes(q))
        );
      }
      return false;
    });
  }, [systemPackages, filter, packageDetails]);

  // Compute which packages have matching templates (for auto-expand during search)
  const packagesWithMatches = useMemo(() => {
    if (!filter) return new Set<string>();
    const q = filter.toLowerCase();
    const matches = new Set<string>();
    for (const pkg of packages) {
      const detail = packageDetails.get(pkg.packageId);
      if (!detail) continue;
      const hasMatch = detail.modules.some((mod) =>
        mod.templates.some(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            mod.name.toLowerCase().includes(q)
        )
      );
      if (hasMatch) matches.add(pkg.packageId);
    }
    return matches;
  }, [packages, packageDetails, filter]);

  // Auto-expand system packages section when search matches system packages
  const prevFilterRef = useRef(filter);
  useEffect(() => {
    if (filter && !prevFilterRef.current) {
      // Search just started — auto-expand system section if it has matches
      if (filteredSystemPackages.length > 0) {
        setShowSystem(true);
      }
    } else if (!filter && prevFilterRef.current) {
      // Search cleared — collapse system section
      setShowSystem(false);
    }
    prevFilterRef.current = filter;
  }, [filter, filteredSystemPackages.length]);

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
      <div className="flex flex-col gap-0.5">
        {isLoading ? (
          <SidebarSkeleton />
        ) : filteredUserPackages.length === 0 && filteredSystemPackages.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            No packages found
          </p>
        ) : (
          <>
            {/* User packages - shown first, expanded */}
            {filteredUserPackages.length > 0 && (
              <div className="mb-2">
                <div className="px-3 pb-1 pt-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                  Your Packages
                </div>
                <div className="flex flex-col gap-0.5 px-2">
                  {filteredUserPackages.map((pkg) => (
                    <PackageItem
                      key={pkg.packageId}
                      pkg={pkg}
                      detail={packageDetails.get(pkg.packageId)}
                      selected={selected}
                      filter={filter}
                      forceExpanded={packagesWithMatches.has(pkg.packageId)}
                      onExpand={() => onExpandPackage(pkg.packageId)}
                      onSelectTemplate={onSelectTemplate}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* System packages - collapsed by default */}
            {filteredSystemPackages.length > 0 && (
              <div className="border-t border-border/30 pt-2">
                <button
                  onClick={() => setShowSystem(!showSystem)}
                  className="flex w-full items-center gap-1.5 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
                >
                  <HugeiconsIcon icon={ArrowRight01Icon} className={cn("size-3 transition-transform", showSystem && "rotate-90")} strokeWidth={2} />
                  System Packages ({filteredSystemPackages.length})
                </button>
                {showSystem && (
                  <div className="flex flex-col gap-0.5 px-2">
                    {filteredSystemPackages.map((pkg) => (
                      <PackageItem
                        key={pkg.packageId}
                        pkg={pkg}
                        detail={packageDetails.get(pkg.packageId)}
                        selected={selected}
                        filter={filter}
                        forceExpanded={packagesWithMatches.has(pkg.packageId)}
                        onExpand={() => onExpandPackage(pkg.packageId)}
                        onSelectTemplate={onSelectTemplate}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
