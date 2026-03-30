import React, { useState, useCallback, useMemo, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { BookOpen01Icon, FileCodeIcon } from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/page-header";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import type { PackageDetail, TemplateDefinition } from "@/lib/types";
import { partitionPackages } from "@/lib/utils";
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

  // Fetch detail for both selected and expanded packages independently
  const selectedPackageId = selected?.packageId ?? null;
  const { data: selectedPackageDetail } = usePackageDetail(selectedPackageId);
  const { data: expandedPackageDetail } = usePackageDetail(
    expandedPackageId !== selectedPackageId ? expandedPackageId : null
  );

  const [detailsMap, setDetailsMap] = useState<Map<string, PackageDetail>>(
    new Map()
  );

  // Store fetched details in the map for both selected and expanded packages
  React.useEffect(() => {
    const updates: Array<[string, PackageDetail]> = [];
    if (selectedPackageDetail && selectedPackageId) {
      updates.push([selectedPackageId, selectedPackageDetail]);
    }
    if (expandedPackageDetail && expandedPackageId) {
      updates.push([expandedPackageId, expandedPackageDetail]);
    }
    if (updates.length === 0) return;

    setDetailsMap((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [pkgId, detail] of updates) {
        if (prev.get(pkgId) === detail) continue;
        const summary = packages?.find((p) => p.packageId === pkgId);
        next.set(pkgId, {
          ...detail,
          packageName: detail.packageName ?? summary?.packageName,
          packageVersion: detail.packageVersion ?? summary?.packageVersion,
        });
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [selectedPackageDetail, selectedPackageId, expandedPackageDetail, expandedPackageId, packages]);

  // Partition packages so we can auto-select the first user template
  const [userPackages] = useMemo(
    () => (packages ? partitionPackages(packages) : [[], []]),
    [packages]
  );

  // Parse URL params: /templates?template=Module:Entity or /templates?package=name&template=Module:Entity
  const urlTarget = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const templateParam = params.get("template"); // e.g., "Main:AliceOnly"
    const packageParam = params.get("package"); // e.g., "cantontrace-test"
    if (!templateParam) return null;
    const parts = templateParam.split(":");
    return {
      moduleName: parts.length >= 2 ? parts[0] : "Main",
      templateName: parts.length >= 2 ? parts[1] : parts[0],
      packageName: packageParam ?? undefined,
    };
  }, []);

  // Auto-select from URL params when packages load
  const [urlHandled, setUrlHandled] = useState(false);

  useEffect(() => {
    if (urlHandled || !urlTarget || !packages || packages.length === 0) return;

    // Find matching package
    let targetPkg = urlTarget.packageName
      ? packages.find((p) => p.packageName === urlTarget.packageName)
      : undefined;

    // If no specific package, find the first user package
    if (!targetPkg) {
      targetPkg = userPackages[0];
    }

    if (targetPkg) {
      setExpandedPackageId(targetPkg.packageId);
      setLoadedPackageIds((prev) => new Set(prev).add(targetPkg!.packageId));
      setSelected({
        packageId: targetPkg.packageId,
        moduleName: urlTarget.moduleName,
        templateName: urlTarget.templateName,
      });
      setUrlHandled(true);
    }
  }, [urlTarget, urlHandled, packages, userPackages]);

  // Auto-load the first user package detail on initial load (only if no URL target)
  const firstUserPackageId = userPackages.length > 0 ? userPackages[0].packageId : null;

  useEffect(() => {
    if (urlTarget) return; // URL target takes priority
    if (firstUserPackageId && !expandedPackageId && !selected) {
      setExpandedPackageId(firstUserPackageId);
      setLoadedPackageIds((prev) => new Set(prev).add(firstUserPackageId));
    }
  }, [firstUserPackageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select the first template from the first user package when detail loads
  useEffect(() => {
    if (selected) return; // user already selected something
    if (!firstUserPackageId) return;
    const detail = detailsMap.get(firstUserPackageId);
    if (!detail) return;
    // Find the first module with at least one template
    for (const mod of detail.modules) {
      if (mod.templates.length > 0) {
        setSelected({
          packageId: firstUserPackageId,
          moduleName: mod.name,
          templateName: mod.templates[0].name,
        });
        return;
      }
    }
  }, [firstUserPackageId, detailsMap, selected]);

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
    <div className="flex h-full flex-col">
      {/* Page header */}
      <PageHeader
        icon={BookOpen01Icon}
        title="Template Explorer"
        subtitle="Browse packages, modules, and template definitions"
        className="shrink-0"
      />

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
