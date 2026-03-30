import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ErrorCategory } from "@/lib/types";

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

interface CategoryMeta {
  label: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
}

const CATEGORY_META: Record<ErrorCategory, CategoryMeta> = {
  InvalidIndependentOfSystemState: {
    label: "Invalid Request",
    severity: "medium",
    description:
      "The request is invalid regardless of the ledger state. Fix the request before retrying.",
  },
  AuthInterceptorInvalidAuthenticationCredentials: {
    label: "Auth Failure",
    severity: "critical",
    description:
      "Authentication credentials are invalid or expired. Refresh tokens or check configuration.",
  },
  InvalidGivenCurrentSystemStateOther: {
    label: "Invalid State",
    severity: "medium",
    description:
      "The request is invalid given the current system state. The state may change to make it valid later.",
  },
  InvalidGivenCurrentSystemStateResourceMissing: {
    label: "Resource Missing",
    severity: "high",
    description:
      "A required resource (contract, package, or party) was not found on the ledger.",
  },
  InvalidGivenCurrentSystemStateResourceExists: {
    label: "Resource Exists",
    severity: "medium",
    description:
      "A resource that should not exist already exists. Likely a duplicate key conflict.",
  },
  ContentionOnSharedResources: {
    label: "Contention",
    severity: "high",
    description:
      "Multiple transactions competed for the same contract. The sequencer chose a different transaction.",
  },
  DeadlineExceededRequestStateUnknown: {
    label: "Timeout (Unknown)",
    severity: "critical",
    description:
      "The request timed out and its final state is unknown. The transaction may or may not have been committed.",
  },
  TransientServerFailure: {
    label: "Transient Failure",
    severity: "low",
    description:
      "A temporary server-side failure occurred. Safe to retry with backoff.",
  },
  SystemInternalAssumptionViolated: {
    label: "Internal Error",
    severity: "critical",
    description:
      "An internal system assumption was violated. This typically indicates a bug in the system.",
  },
  MaliciousOrFaultyBehaviour: {
    label: "Malicious/Faulty",
    severity: "critical",
    description:
      "Indicates potentially malicious or faulty behavior by a participant.",
  },
  InternalUnsupportedOperation: {
    label: "Unsupported",
    severity: "low",
    description:
      "The operation is not supported by this version or configuration of the participant.",
  },
};

// ---------------------------------------------------------------------------
// Severity -> Badge variant mapping (uses semantic preset tokens)
// ---------------------------------------------------------------------------

const SEVERITY_VARIANT: Record<
  CategoryMeta["severity"],
  "outline" | "secondary" | "default" | "destructive"
> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ErrorCategoryBadgeProps {
  category: ErrorCategory;
  className?: string;
  showTooltip?: boolean;
}

export function ErrorCategoryBadge({
  category,
  className,
  showTooltip = true,
}: ErrorCategoryBadgeProps) {
  const meta = CATEGORY_META[category] ?? {
    label: category,
    severity: "medium" as const,
    description: "Unknown error category",
  };
  const variant = SEVERITY_VARIANT[meta.severity];

  const badge = (
    <Badge variant={variant} className={cn("text-xs", className)}>
      {meta.label}
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs font-medium">{category}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {meta.description}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { CATEGORY_META, SEVERITY_VARIANT };
export type { CategoryMeta };
