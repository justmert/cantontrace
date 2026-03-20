import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Shield01Icon,
  ViewIcon,
  UserGroupIcon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { PrivacyEvent } from "@/lib/types";

// ---------------------------------------------------------------------------
// Static Analysis Section
// ---------------------------------------------------------------------------

export interface StaticAnalysisProps {
  events: PrivacyEvent[];
}

interface TemplateAnalysis {
  templateName: string;
  moduleName: string;
  signatories: string[];
  observers: string[];
  hasDynamicObservers: boolean;
  hasExerciseEvents: boolean;
  eventCount: number;
  rules: string[];
}

function analyzeTemplates(events: PrivacyEvent[]): TemplateAnalysis[] {
  const templateMap = new Map<string, PrivacyEvent[]>();

  events.forEach((event) => {
    const key = `${event.templateId.moduleName}:${event.templateId.entityName}`;
    if (!templateMap.has(key)) {
      templateMap.set(key, []);
    }
    templateMap.get(key)!.push(event);
  });

  const analyses: TemplateAnalysis[] = [];

  for (const [, templateEvents] of templateMap) {
    const firstEvent = templateEvents[0];
    const allSignatories = new Set<string>();
    const allObservers = new Set<string>();

    templateEvents.forEach((e) => {
      e.signatories.forEach((s) => allSignatories.add(s));
      e.observers.forEach((o) => allObservers.add(o));
    });

    // Detect dynamic observers (different observers across events of same template)
    const observerSets = templateEvents.map((e) =>
      [...e.observers].sort().join(",")
    );
    const uniqueObserverSets = new Set(observerSets);
    const hasDynamic = uniqueObserverSets.size > 1;

    const hasExercise = templateEvents.some(
      (e) => e.eventType === "exercised"
    );

    // Build rules
    const rules: string[] = [];
    rules.push(
      "Signatories always see all events in this template"
    );
    if (allObservers.size > 0) {
      rules.push("Observers see creates and archives only");
    }
    if (hasExercise) {
      rules.push("Controller of exercises sees exercise events");
    }
    if (templateEvents.some((e) => e.isDisclosed)) {
      rules.push(
        "Some events accessed via explicit disclosure"
      );
    }

    analyses.push({
      templateName: firstEvent.templateId.entityName,
      moduleName: firstEvent.templateId.moduleName,
      signatories: [...allSignatories],
      observers: [...allObservers],
      hasDynamicObservers: hasDynamic,
      hasExerciseEvents: hasExercise,
      eventCount: templateEvents.length,
      rules,
    });
  }

  return analyses.sort((a, b) => a.templateName.localeCompare(b.templateName));
}

function TemplateAnalysisCard({
  analysis,
}: {
  analysis: TemplateAnalysis;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-md border bg-card">
      <button
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
        ) : (
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
        )}
        <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{analysis.templateName}</span>
        <span className="text-xs text-muted-foreground">
          {analysis.moduleName}
        </span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {analysis.eventCount} event{analysis.eventCount !== 1 ? "s" : ""}
        </Badge>
        {analysis.hasDynamicObservers && (
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-3.5 text-secondary-foreground" />
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t px-3 py-3">
          {/* Signatories */}
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} className="size-3" />
              Signatories
            </div>
            <div className="flex flex-wrap gap-1">
              {analysis.signatories.map((s) => (
                <Badge
                  key={s}
                  variant="outline"
                  className="font-mono text-[10px]"
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>

          {/* Observers */}
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <HugeiconsIcon icon={ViewIcon} strokeWidth={2} className="size-3" />
              Observers
            </div>
            <div className="flex flex-wrap gap-1">
              {analysis.observers.length > 0 ? (
                analysis.observers.map((o) => (
                  <Badge
                    key={o}
                    variant="outline"
                    className="font-mono text-[10px]"
                  >
                    {o}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">
                  No static observers
                </span>
              )}
            </div>
          </div>

          {/* Privacy rules */}
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              Privacy Rules
            </div>
            <ul className="flex flex-col gap-1">
              {analysis.rules.map((rule, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-1.5 text-xs text-muted-foreground"
                >
                  <div className="mt-1.5 size-1 flex-shrink-0 rounded-full bg-muted-foreground/50" />
                  {rule}
                </li>
              ))}
            </ul>
          </div>

          {/* Dynamic observers warning */}
          {analysis.hasDynamicObservers && (
            <Alert className="border-secondary-foreground/50">
              <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4 text-secondary-foreground" />
              <AlertTitle className="text-xs">Dynamic Observers</AlertTitle>
              <AlertDescription className="text-xs">
                This template uses dynamic observer patterns -- actual visibility
                may differ at runtime depending on contract-specific observer
                lists.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}

export function StaticAnalysis({ events }: StaticAnalysisProps) {
  const analyses = React.useMemo(
    () => analyzeTemplates(events),
    [events]
  );

  if (analyses.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No template privacy analysis available</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Template-level privacy analysis based on signatory, observer, and
        controller expressions.
      </p>
      <div className="flex flex-col gap-2">
        {analyses.map((analysis) => (
          <TemplateAnalysisCard
            key={`${analysis.moduleName}:${analysis.templateName}`}
            analysis={analysis}
          />
        ))}
      </div>
    </div>
  );
}
