import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { PackageSummary } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Truncate a hex ID string for display, showing the first `len` characters
 * followed by an ellipsis.
 */
export function truncateId(id: string, len = 8): string {
  if (!id) return "";
  if (id.length <= len) return id;
  return id.slice(0, len) + "...";
}

/**
 * Format a Daml template ID into a human-readable short form like
 * "Module.Name:Template".
 *
 * Accepts either the structured `TemplateId` object
 * (`{ packageName, moduleName, entityName }`) or the legacy colon-delimited
 * string form (`"packageId:moduleName:entityName"`).
 */
export function formatTemplateId(
  templateId: string | { moduleName: string; entityName: string; packageName?: string },
): string {
  if (!templateId) return "";

  // Structured TemplateId object
  if (typeof templateId === "object") {
    return `${templateId.moduleName}:${templateId.entityName}`;
  }

  // Legacy colon-delimited string
  const parts = templateId.split(":");
  if (parts.length >= 3) {
    return `${parts[1]}:${parts[2]}`;
  }
  if (parts.length === 2) {
    return templateId;
  }
  return templateId;
}

// ---------------------------------------------------------------------------
// System / library package detection
// ---------------------------------------------------------------------------

/**
 * Known prefixes for Daml system and library packages that ship with the
 * runtime and never contain user-defined templates.
 */
const SYSTEM_PACKAGE_PREFIXES = [
  "daml-prim",
  "daml-stdlib",
  "daml-script",
  "daml-3",
  "daml-x",
  "ghc-stdlib",
  "canton-builtin",
  "canton-internal",
];

/**
 * Returns `true` when the package is a system / library package that has no
 * user-defined templates.
 */
export function isSystemPackage(pkg: PackageSummary): boolean {
  const name = (pkg.packageName ?? "").toLowerCase();
  return SYSTEM_PACKAGE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Split a list of packages into `[userPackages, systemPackages]`.
 * User packages are those that are likely to contain templates the user wrote.
 */
export function partitionPackages(
  packages: PackageSummary[]
): [user: PackageSummary[], system: PackageSummary[]] {
  const user: PackageSummary[] = [];
  const system: PackageSummary[] = [];
  for (const pkg of packages) {
    if (isSystemPackage(pkg)) {
      system.push(pkg);
    } else {
      user.push(pkg);
    }
  }
  return [user, system];
}
