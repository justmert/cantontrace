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

/**
 * Extract the human-readable display name from a Canton party ID.
 * Canton party IDs follow the format `displayName::fingerprint`
 * (e.g., `alice::122068eb6f6a6acd...`).
 */
export function formatPartyId(partyId: string, showFingerprint = false): string {
  if (!partyId) return "";
  const sepIndex = partyId.indexOf("::");
  if (sepIndex === -1) return truncateId(partyId, 12);
  const displayName = partyId.slice(0, sepIndex);
  if (!showFingerprint) return displayName;
  const fingerprint = partyId.slice(sepIndex + 2, sepIndex + 6);
  return `${displayName}::${fingerprint}…`;
}

/**
 * Generate a deterministic color hue (0-360) from a string.
 * Used for party avatar colors.
 */
export function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

/**
 * Format a timestamp in various compact modes.
 * - "relative": "2m ago", "1h ago"
 * - "time": "14:32:07"
 * - "datetime": "Apr 6, 14:32"
 */
export function formatTimestamp(
  date: string | Date | number,
  mode: "relative" | "time" | "datetime" = "relative"
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);

  switch (mode) {
    case "relative": {
      const now = Date.now();
      const diffMs = now - d.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 5) return "just now";
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDay = Math.floor(diffHr / 24);
      return `${diffDay}d ago`;
    }
    case "time":
      return d.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    case "datetime":
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }) + ", " + d.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });
  }
}
