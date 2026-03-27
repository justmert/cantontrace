import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  Search01Icon,
  Shield01Icon,
  Sword01Icon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import type { ContentionTimeline as ContentionTimelineType } from "@/lib/types";
import { ErrorList } from "./components/error-list";
import { ErrorCategoryBadge } from "./components/error-category-badge";
import { ContentionTimeline } from "./components/contention-timeline";
import { useErrorExplanation } from "./hooks";

// ---------------------------------------------------------------------------
// Error Lookup tab
// ---------------------------------------------------------------------------

function ErrorLookupTab() {
  const [errorCode, setErrorCode] = useState("");
  const [lookupCode, setLookupCode] = useState<string | undefined>(undefined);
  const {
    data: explanation,
    isLoading,
    isError,
  } = useErrorExplanation(lookupCode);

  const handleLookup = () => {
    const trimmed = errorCode.trim();
    if (trimmed) {
      setLookupCode(trimmed);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <Field className="max-w-md flex-1">
          <FieldLabel className="text-xs font-medium text-muted-foreground">
            Error Code
          </FieldLabel>
          <Input
            placeholder="Enter an error code (e.g. CONTRACT_NOT_FOUND)..."
            className="font-mono text-sm"
            value={errorCode}
            onChange={(e) => setErrorCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLookup();
            }}
          />
        </Field>
        <Button onClick={handleLookup} disabled={!errorCode.trim() || isLoading}>
          <HugeiconsIcon
            icon={Search01Icon}
            data-icon="inline-start"
            strokeWidth={2}
          />
          Look Up
        </Button>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3 rounded-lg border p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      )}

      {isError && (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyDescription>
              Error code not found in the knowledge base. Check the code and try
              again.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {lookupCode && !isLoading && !isError && !explanation && (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Error code not found</EmptyTitle>
            <EmptyDescription>
              &ldquo;{lookupCode}&rdquo; was not found in the knowledge base.
              Check the code and try again.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {explanation && (
        <div className="flex flex-col gap-4">
          {/* Header with error code and category */}
          <div className="flex items-start gap-4 rounded-lg border p-5">
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold">
                  {explanation.errorCodeId}
                </span>
                {explanation.category && (
                  <ErrorCategoryBadge category={explanation.category} />
                )}
              </div>
              {explanation.grpcStatusCode && (
                <span className="text-xs text-muted-foreground">
                  gRPC status: {explanation.grpcStatusCode}
                </span>
              )}
            </div>
          </div>

          {/* PERMISSION_DENIED / auth credential security banner */}
          {(explanation.category ===
            "AuthInterceptorInvalidAuthenticationCredentials" ||
            explanation.grpcStatusCode === "PERMISSION_DENIED") && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <HugeiconsIcon
                icon={Shield01Icon}
                className="mt-0.5 size-5 flex-shrink-0 text-destructive"
                strokeWidth={2}
              />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-destructive">
                  Security Note
                </span>
                <p className="text-xs text-destructive/80">
                  Detailed error information has been stripped from the API
                  response for security reasons. Check the participant node's
                  server-side logs for full details.
                </p>
              </div>
            </div>
          )}

          {/* Explanation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Explanation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground">
                {explanation.explanation}
              </p>
            </CardContent>
          </Card>

          {/* Common Causes */}
          {explanation.commonCauses && explanation.commonCauses.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Common Causes</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-2 text-sm">
                  {explanation.commonCauses.map((cause: string, i: number) => (
                    <li key={i} className="flex gap-2">
                      <span className="flex size-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {i + 1}
                      </span>
                      <span className="text-muted-foreground">{cause}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* Suggested Fixes */}
          {explanation.suggestedFixes &&
            explanation.suggestedFixes.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Suggested Fixes</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="flex flex-col gap-2 text-sm">
                    {explanation.suggestedFixes.map(
                      (fix: string, i: number) => (
                        <li key={i} className="flex gap-2">
                          <span className="flex size-5 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                            {i + 1}
                          </span>
                          <span>{fix}</span>
                        </li>
                      )
                    )}
                  </ol>
                </CardContent>
              </Card>
            )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contention tab
// ---------------------------------------------------------------------------

function ContentionTab() {
  const [contentionEvents] = useState<ContentionTimelineType[]>([]);

  if (contentionEvents.length === 0) {
    return (
      <Empty className="py-20">
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={Sword01Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No contention events detected</EmptyTitle>
          <EmptyDescription>
            When multiple transactions compete for the same contract, contention
            details will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {contentionEvents.map((ce, i) => (
        <ContentionTimeline key={i} contention={ce} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ErrorDebuggerPage() {
  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <PageHeader
        icon={AlertCircleIcon}
        title="Error Debugger"
        subtitle="Analyze failed commands and understand Canton error categories"
      />

      {/* Full-width tabbed content */}
      <div className="flex flex-1 flex-col overflow-hidden px-6 pt-4">
        <Tabs defaultValue="recent" className="flex flex-1 flex-col">
          <TabsList>
            <TabsTrigger value="recent">Recent Errors</TabsTrigger>
            <TabsTrigger value="lookup">Error Lookup</TabsTrigger>
            <TabsTrigger value="contention">Contention</TabsTrigger>
          </TabsList>

          <TabsContent value="recent" className="flex-1 overflow-auto pb-6">
            <ErrorList />
          </TabsContent>

          <TabsContent value="lookup" className="flex-1 overflow-auto pb-6">
            <ErrorLookupTab />
          </TabsContent>

          <TabsContent
            value="contention"
            className="flex-1 overflow-auto pb-6"
          >
            <ContentionTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
