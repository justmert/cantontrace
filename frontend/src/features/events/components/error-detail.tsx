import { useState, useEffect, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert01Icon,
  Copy01Icon,
  Tick02Icon,
  LinkSquare01Icon,
  Refresh01Icon,
  Clock01Icon,
  Shield01Icon,
  InformationCircleIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { truncateId } from "@/lib/utils";
import type { CommandCompletion } from "@/lib/types";
import { ErrorCategoryBadge } from "./error-category-badge";
import { useErrorExplanation } from "../hooks";

// ---------------------------------------------------------------------------
// Copy button helper
// ---------------------------------------------------------------------------

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be blocked in some contexts; silently ignore.
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex flex-col gap-0.5 overflow-hidden">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="truncate font-mono text-xs">{value}</span>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCopy}
              className="inline-flex size-7 flex-shrink-0 items-center justify-center rounded hover:bg-muted"
            >
              {copied ? (
                <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-secondary-foreground" strokeWidth={2} />
              ) : (
                <HugeiconsIcon icon={Copy01Icon} className="size-3.5 text-muted-foreground" strokeWidth={2} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>{copied ? "Copied!" : "Copy to clipboard"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Retry countdown
// ---------------------------------------------------------------------------

function RetryCountdown({
  delaySeconds,
  onRetry,
}: {
  delaySeconds: number;
  onRetry: () => void;
}) {
  const [remaining, setRemaining] = useState(delaySeconds);
  const [autoRetry, setAutoRetry] = useState(false);

  useEffect(() => {
    setRemaining(delaySeconds);
  }, [delaySeconds]);

  useEffect(() => {
    if (remaining <= 0) {
      if (autoRetry) onRetry();
      return;
    }
    const timer = setTimeout(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [remaining, autoRetry, onRetry]);

  return (
    <div className="flex items-center gap-4 rounded-lg border border-accent bg-accent/30 p-4">
      <HugeiconsIcon icon={Clock01Icon} className="size-5 flex-shrink-0 text-accent-foreground" strokeWidth={2} />
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-medium">
          {remaining > 0
            ? `Retry available in ${remaining}s`
            : "Ready to retry"}
        </span>
        <div className="flex items-center gap-2">
          <Switch
            id="auto-retry"
            checked={autoRetry}
            onCheckedChange={setAutoRetry}
          />
          <Label htmlFor="auto-retry" className="text-xs text-muted-foreground">
            Auto-retry when countdown completes
          </Label>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={remaining > 0}
        onClick={onRetry}
      >
        <HugeiconsIcon icon={Refresh01Icon} data-icon="inline-start" strokeWidth={2} />
        Retry
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable section
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        className="flex w-full items-center gap-2 py-2 text-sm font-semibold hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-4" strokeWidth={2} />
        ) : (
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" strokeWidth={2} />
        )}
        {title}
      </button>
      {open && <div className="pb-2 pl-6">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main error detail component
// ---------------------------------------------------------------------------

export interface ErrorDetailProps {
  completion: CommandCompletion;
  onNavigateContract?: (contractId: string) => void;
  onNavigateTemplate?: (templateId: string) => void;
  onNavigateTransaction?: (updateId: string) => void;
}

export function ErrorDetail({
  completion,
  onNavigateContract,
  onNavigateTemplate,
  // onNavigateTransaction is accepted for future use (e.g., linking to related transactions)
  onNavigateTransaction: _onNavigateTransaction,
}: ErrorDetailProps) {
  const error = completion.error;
  const {
    data: explanation,
    isLoading: explanationLoading,
  } = useErrorExplanation(error?.errorCodeId);

  const handleRetry = useCallback(() => {
    // In a real app, this would re-submit the command
    console.log("Retry command:", completion.commandId);
  }, [completion.commandId]);

  if (!error) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">No error details available for this completion.</p>
      </div>
    );
  }

  const isPermissionDenied =
    error.grpcStatusCode === "PERMISSION_DENIED" ||
    error.categoryId === "AuthInterceptorInvalidAuthenticationCredentials";

  const isDeadlineUnknown =
    error.categoryId === "DeadlineExceededRequestStateUnknown";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <ErrorCategoryBadge category={error.categoryId} />
            <span className="font-mono text-sm text-muted-foreground">
              {error.errorCodeId}
            </span>
          </div>
          <h2 className="text-lg font-semibold leading-tight">{error.message}</h2>
        </div>
      </div>

      {/* PERMISSION_DENIED banner */}
      {isPermissionDenied && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <HugeiconsIcon icon={Shield01Icon} className="mt-0.5 size-5 flex-shrink-0 text-destructive" strokeWidth={2} />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-destructive">
              Security Note
            </span>
            <p className="text-xs text-destructive/80">
              Detailed error information has been stripped from the API response
              for security reasons. Check the participant node's server-side logs
              for full details.
            </p>
          </div>
        </div>
      )}

      {/* Deadline unknown banner */}
      {isDeadlineUnknown && (
        <div className="flex items-start gap-3 rounded-lg border border-muted-foreground/20 bg-muted/50 p-4">
          <HugeiconsIcon icon={Alert01Icon} className="mt-0.5 size-5 flex-shrink-0 text-muted-foreground" strokeWidth={2} />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">
              Warning: Unknown Transaction State
            </span>
            <p className="text-xs text-muted-foreground">
              The outcome of this transaction is unknown. It may or may not have
              been committed. Check the transaction's status before retrying.
            </p>
          </div>
        </div>
      )}

      {/* Human-readable explanation from knowledge base */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Explanation</CardTitle>
        </CardHeader>
        <CardContent>
          {explanationLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-foreground">
              {explanation?.explanation ?? error.explanation ?? error.message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Common Causes */}
      <Section title="Common Causes">
        {explanationLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : (
          <ol className="flex flex-col gap-2 text-sm">
            {(explanation?.commonCauses ?? error.commonCauses ?? []).map(
              (cause, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex size-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{cause}</span>
                </li>
              )
            )}
            {(explanation?.commonCauses ?? error.commonCauses ?? []).length ===
              0 && (
              <p className="text-xs text-muted-foreground">
                No specific common causes identified for this error code.
              </p>
            )}
          </ol>
        )}
      </Section>

      {/* Suggested Fixes */}
      <Section title="Suggested Fixes">
        {explanationLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : (
          <ol className="flex flex-col gap-2 text-sm">
            {(explanation?.suggestedFixes ?? error.suggestedFixes ?? []).map(
              (fix, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex size-5 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                    {i + 1}
                  </span>
                  <span>{fix}</span>
                </li>
              )
            )}
            {(explanation?.suggestedFixes ?? error.suggestedFixes ?? [])
              .length === 0 && (
              <p className="text-xs text-muted-foreground">
                No specific fixes suggested. Review the error message and common
                causes above.
              </p>
            )}
          </ol>
        )}
      </Section>

      {/* Resource Info */}
      {error.resourceInfo && (
        <Section title="Resource">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Type:</span>
              <Badge variant="outline" className="font-mono text-xs">
                {error.resourceInfo.resourceType}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="shrink-0 text-muted-foreground">Name:</span>
              <span className="min-w-0 truncate font-mono text-xs" title={error.resourceInfo.resourceName}>
                {truncateId(error.resourceInfo.resourceName, 12)}
              </span>
              {error.resourceInfo.resourceType.toLowerCase().includes("contract") &&
                onNavigateContract && (
                  <Button
                    size="sm"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() =>
                      onNavigateContract(error.resourceInfo!.resourceName)
                    }
                  >
                    <HugeiconsIcon icon={LinkSquare01Icon} data-icon="inline-start" strokeWidth={2} />
                    View Lifecycle
                  </Button>
                )}
              {error.resourceInfo.resourceType.toLowerCase().includes("template") &&
                onNavigateTemplate && (
                  <Button
                    size="sm"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() =>
                      onNavigateTemplate(error.resourceInfo!.resourceName)
                    }
                  >
                    <HugeiconsIcon icon={LinkSquare01Icon} data-icon="inline-start" strokeWidth={2} />
                    View Template
                  </Button>
                )}
            </div>
            {error.resourceInfo.owner && (
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="shrink-0 text-muted-foreground">Owner:</span>
                <span className="min-w-0 truncate font-mono text-xs" title={error.resourceInfo.owner}>
                  {error.resourceInfo.owner}
                </span>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Retry Info */}
      {error.retryInfo && (
        <Section title="Retry">
          <RetryCountdown
            delaySeconds={error.retryInfo.retryDelaySeconds}
            onRetry={handleRetry}
          />
        </Section>
      )}

      {/* Correlation IDs */}
      <Section title="Correlation">
        <div className="flex flex-col gap-2">
          <CopyField label="Command ID" value={completion.commandId} />
          {completion.submissionId && (
            <CopyField label="Submission ID" value={completion.submissionId} />
          )}
          <CopyField label="Correlation ID" value={error.correlationId} />
          {error.requestInfo?.requestId && (
            <CopyField
              label="Request ID"
              value={error.requestInfo.requestId}
            />
          )}
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" strokeWidth={2} />
            <span>Search in participant node logs using these IDs for full context.</span>
          </div>
        </div>
      </Section>

      {/* Error metadata */}
      {error.errorInfo && (
        <Section title="Error Metadata" defaultOpen={false}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="shrink-0 text-muted-foreground">Reason:</span>
              <span className="min-w-0 truncate font-mono text-xs" title={error.errorInfo.reason}>{error.errorInfo.reason}</span>
            </div>
            {Object.entries(error.errorInfo.metadata).length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3 overflow-hidden">
                <pre className="whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(error.errorInfo.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
