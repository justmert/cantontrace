import { HugeiconsIcon } from "@hugeicons/react";
import { ShieldEnergyIcon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyButton } from "@/components/copy-button";
import { truncateId } from "@/lib/utils";
import type { DisclosedBoundary } from "@/lib/types";

// ---------------------------------------------------------------------------
// Disclosed Contract Marker
// ---------------------------------------------------------------------------

export interface DisclosedContractMarkerProps {
  boundary: DisclosedBoundary;
}

export function DisclosedContractMarker({
  boundary,
}: DisclosedContractMarkerProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-secondary-foreground/50 bg-secondary/5 px-2 py-1">
            <HugeiconsIcon icon={ShieldEnergyIcon} strokeWidth={2} className="size-3.5 text-secondary-foreground" />
            <span className="text-xs font-medium text-secondary-foreground">
              Disclosed
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium">Disclosed Contract Access</p>
            <p className="text-xs text-muted-foreground">
              This contract was accessed via explicit disclosure &mdash;{" "}
              <span className="font-mono font-medium">{boundary.accessedBy}</span>{" "}
              is not a stakeholder but accessed it through an attached disclosed
              contract.
            </p>

            <div className="flex flex-col gap-1 border-t pt-2">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">
                  Contract:
                </span>
                <span className="font-mono text-xs">
                  {truncateId(boundary.contractId)}
                </span>
                <CopyButton text={boundary.contractId} />
              </div>
              <div className="flex items-center gap-1 min-w-0">
                <span className="shrink-0 text-xs text-muted-foreground">
                  Accessed by:
                </span>
                <span className="min-w-0 truncate font-mono text-xs" title={boundary.accessedBy}>
                  {boundary.accessedBy}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">
                  Reason:
                </span>
                <span className="text-xs">{boundary.reason}</span>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Compact inline marker variant
// ---------------------------------------------------------------------------

export function DisclosedBadge() {
  return (
    <Badge
      variant="outline"
      className="border-dashed border-secondary-foreground/50 text-xs text-secondary-foreground"
    >
      <HugeiconsIcon icon={ShieldEnergyIcon} data-icon="inline-start" strokeWidth={2} />
      Disclosed
    </Badge>
  );
}
