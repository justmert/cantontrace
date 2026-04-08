import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Value renderer with type annotations
// ---------------------------------------------------------------------------

function ValueNode({
  name,
  value,
  previousValue,
  depth = 0,
}: {
  name: string;
  value: unknown;
  previousValue?: unknown;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChanged =
    previousValue !== undefined &&
    JSON.stringify(previousValue) !== JSON.stringify(value);

  const typeLabel = Array.isArray(value)
    ? "List"
    : value === null
    ? "null"
    : typeof value === "object"
    ? "Record"
    : typeof value;

  // Primitive values
  if (value === null || value === undefined) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <span
          className={cn(
            "font-mono text-xs",
            hasChanged
              ? "font-semibold text-accent-foreground"
              : "text-foreground"
          )}
        >
          {name}
        </span>
        <span className="text-xs text-muted-foreground">{typeLabel}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {String(value)}
        </span>
        {hasChanged && (
          <span className="flex items-center gap-1 text-xs text-accent-foreground">
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-2.5" strokeWidth={2} />
            changed
          </span>
        )}
      </div>
    );
  }

  if (typeof value !== "object") {
    const display =
      typeof value === "string"
        ? `"${value.length > 80 ? value.slice(0, 80) + "..." : value}"`
        : String(value);

    return (
      <div className="flex items-center gap-2 py-0.5">
        <span
          className={cn(
            "font-mono text-xs",
            hasChanged
              ? "font-semibold text-accent-foreground"
              : "text-foreground"
          )}
        >
          {name}
        </span>
        <span className="text-xs text-muted-foreground">{typeLabel}</span>
        <span
          className={cn(
            "font-mono text-xs",
            typeof value === "string"
              ? "text-primary"
              : typeof value === "number"
              ? "text-secondary-foreground"
              : typeof value === "boolean"
              ? "text-accent-foreground"
              : "text-foreground"
          )}
        >
          {display}
        </span>
        {hasChanged && previousValue !== undefined && (
          <span className="flex items-center gap-1 text-xs text-accent-foreground">
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-2.5" strokeWidth={2} />
            was:{" "}
            <span className="line-through">
              {typeof previousValue === "string"
                ? `"${String(previousValue).slice(0, 30)}"`
                : String(previousValue)}
            </span>
          </span>
        )}
      </div>
    );
  }

  // Object / Array
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  const prevObj =
    previousValue && typeof previousValue === "object"
      ? (previousValue as Record<string, unknown>)
      : undefined;

  return (
    <div className="flex flex-col">
      <button
        className="flex items-center gap-2 py-0.5 hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 flex-shrink-0" strokeWidth={2} />
        ) : (
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3 flex-shrink-0" strokeWidth={2} />
        )}
        <span
          className={cn(
            "font-mono text-xs",
            hasChanged
              ? "font-semibold text-accent-foreground"
              : "text-foreground"
          )}
        >
          {name}
        </span>
        <span className="text-xs text-muted-foreground">
          {typeLabel}({entries.length})
        </span>
        {hasChanged && (
          <Badge
            variant="outline"
            className="text-[11px] text-accent-foreground"
          >
            modified
          </Badge>
        )}
      </button>
      {expanded && (
        <div className="ml-4 flex flex-col border-l border-border pl-2">
          {entries.map(([key, val]) => (
            <ValueNode
              key={key}
              name={key}
              value={val}
              previousValue={prevObj?.[key]}
              depth={depth + 1}
            />
          ))}
          {entries.length === 0 && (
            <span className="py-0.5 text-xs text-muted-foreground">
              {Array.isArray(value) ? "(empty array)" : "(empty object)"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface VariableInspectorProps {
  variables: Record<string, unknown>;
  previousVariables?: Record<string, unknown>;
}

export function VariableInspector({
  variables,
  previousVariables,
}: VariableInspectorProps) {
  const entries = Object.entries(variables);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-xs text-muted-foreground">
          No variable bindings at this step
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[400px]">
      <div className="flex flex-col gap-0.5 p-2">
        {entries.map(([name, value]) => (
          <ValueNode
            key={name}
            name={name}
            value={value}
            previousValue={previousVariables?.[name]}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
