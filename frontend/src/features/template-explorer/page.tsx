import React, { useState, useCallback, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { BookOpen01Icon, FileCodeIcon } from "@hugeicons/core-free-icons";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import type { PackageDetail, TemplateDefinition } from "@/lib/types";
import { usePackages, usePackageDetail } from "./hooks";
import {
  PackageSidebar,
  type SelectedTemplate,
} from "./components/package-sidebar";
import { TemplateDetail } from "./components/template-detail";

export default function TemplateExplorerPage() {
  const { data: packages, isLoading: packagesLoading } = usePackages();

  const [loadedPackageIds, setLoadedPackageIds] = useState<Set<string>>(
    new Set()
  );
  const [expandedPackageId, setExpandedPackageId] = useState<string | null>(
    null
  );
  const [selected, setSelected] = useState<SelectedTemplate | null>(null);

  const activePackageId = selected?.packageId ?? expandedPackageId;
  const { data: activePackageDetail } = usePackageDetail(activePackageId);

  const [detailsMap, setDetailsMap] = useState<Map<string, PackageDetail>>(
    new Map()
  );

  React.useEffect(() => {
    if (activePackageDetail && activePackageId) {
      setDetailsMap((prev) => {
        if (prev.get(activePackageId) === activePackageDetail) return prev;
        const summary = packages?.find((p) => p.packageId === activePackageId);
        const merged: PackageDetail = {
          ...activePackageDetail,
          packageName:
            activePackageDetail.packageName ?? summary?.packageName,
          packageVersion:
            activePackageDetail.packageVersion ?? summary?.packageVersion,
        };
        const next = new Map(prev);
        next.set(activePackageId, merged);
        return next;
      });
    }
  }, [activePackageDetail, activePackageId, packages]);

  const handleExpandPackage = useCallback((packageId: string) => {
    setExpandedPackageId(packageId);
    setLoadedPackageIds((prev) => new Set(prev).add(packageId));
  }, []);

  const handleSelectTemplate = useCallback(
    (sel: SelectedTemplate) => {
      setSelected(sel);
      if (!loadedPackageIds.has(sel.packageId)) {
        handleExpandPackage(sel.packageId);
      }
    },
    [loadedPackageIds, handleExpandPackage]
  );

  const resolvedTemplate: {
    template: TemplateDefinition;
    packageDetail: PackageDetail;
    moduleName: string;
  } | null = useMemo(() => {
    if (!selected) return null;
    const pkgDetail = detailsMap.get(selected.packageId);
    if (!pkgDetail) return null;
    const mod = pkgDetail.modules.find(
      (m) => m.name === selected.moduleName
    );
    if (!mod) return null;
    const tmpl = mod.templates.find(
      (t) => t.name === selected.templateName
    );
    if (!tmpl) return null;
    return {
      template: tmpl,
      packageDetail: pkgDetail,
      moduleName: mod.name,
    };
  }, [selected, detailsMap]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Page header */}
      <div className="flex shrink-0 items-center gap-3 border-b px-6 py-4">
        <HugeiconsIcon icon={BookOpen01Icon} strokeWidth={2} className="size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Template Explorer</h1>
          <p className="truncate text-xs text-muted-foreground">
            Browse packages, modules, and template definitions
          </p>
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar — fixed width, scrolls independently */}
        <div className="w-72 shrink-0 overflow-y-auto border-r">
          <PackageSidebar
            packages={packages ?? []}
            packageDetails={detailsMap}
            isLoading={packagesLoading}
            selected={selected}
            onSelectTemplate={handleSelectTemplate}
            onExpandPackage={handleExpandPackage}
          />
        </div>

        {/* Content — fills remaining space */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {resolvedTemplate ? (
            <TemplateDetail
              template={resolvedTemplate.template}
              packageDetail={resolvedTemplate.packageDetail}
              moduleName={resolvedTemplate.moduleName}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Empty>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={FileCodeIcon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>Select a template to inspect</EmptyTitle>
                  <EmptyDescription>
                    Expand a package in the sidebar and click on a template
                    to view its fields, choices, key, and source code.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
