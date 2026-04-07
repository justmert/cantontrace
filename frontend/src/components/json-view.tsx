import { useState } from "react";
import { cn, formatPartyDisplay } from "@/lib/utils";

/**
 * Syntax-highlighted JSON viewer with collapsible objects/arrays.
 * Theme-compatible — uses CSS variables for colors.
 */

interface JsonViewProps {
  data: unknown;
  /** Initial expansion depth (default 2) */
  defaultExpandDepth?: number;
  /** Root-level label */
  label?: string;
  className?: string;
}

export function JsonView({ data, defaultExpandDepth = 2, label, className }: JsonViewProps) {
  return (
    <div className={cn("font-mono text-[11px] leading-relaxed", className)}>
      {label && <span className="text-muted-foreground">{label}: </span>}
      <JsonNode value={data} depth={0} defaultExpandDepth={defaultExpandDepth} />
    </div>
  );
}

function JsonNode({
  value,
  depth,
  defaultExpandDepth,
}: {
  value: unknown;
  depth: number;
  defaultExpandDepth: number;
}) {
  if (value === null) return <span className="text-muted-foreground/60">null</span>;
  if (value === undefined) return <span className="text-muted-foreground/60">undefined</span>;

  if (typeof value === "string") {
    // Party ID — show display name with full ID on hover
    if (value.includes("::")) {
      return (
        <span className="text-primary/80 cursor-help" title={value}>
          &quot;{formatPartyDisplay(value)}&quot;
        </span>
      );
    }
    // Numeric string — highlight differently
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      // Trim trailing zeros
      const trimmed = value.includes(".")
        ? value.replace(/\.?0+$/, (m) => m === "." ? ".0" : "").replace(/\.$/, ".0")
        : value;
      return <span className="text-event-create">&quot;{trimmed}&quot;</span>;
    }
    return <span className="text-event-archive">&quot;{value}&quot;</span>;
  }

  if (typeof value === "number") {
    return <span className="text-event-create">{value}</span>;
  }

  if (typeof value === "boolean") {
    return <span className="text-primary">{value ? "true" : "false"}</span>;
  }

  if (Array.isArray(value)) {
    return <CollapsibleArray items={value} depth={depth} defaultExpandDepth={defaultExpandDepth} />;
  }

  if (typeof value === "object") {
    return <CollapsibleObject obj={value as Record<string, unknown>} depth={depth} defaultExpandDepth={defaultExpandDepth} />;
  }

  return <span>{String(value)}</span>;
}

function CollapsibleObject({
  obj,
  depth,
  defaultExpandDepth,
}: {
  obj: Record<string, unknown>;
  depth: number;
  defaultExpandDepth: number;
}) {
  const entries = Object.entries(obj);
  const [expanded, setExpanded] = useState(depth < defaultExpandDepth);

  if (entries.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-muted-foreground hover:text-foreground"
      >
        {"{"} <span className="text-[10px]">{entries.length} fields</span> {"}"}
      </button>
    );
  }

  return (
    <span>
      <button
        onClick={() => setExpanded(false)}
        className="text-muted-foreground hover:text-foreground"
      >
        {"{"}
      </button>
      <div className="ml-4 border-l border-border/30 pl-2">
        {entries.map(([key, val], i) => (
          <div key={key}>
            <span className="text-foreground/70">{key}</span>
            <span className="text-muted-foreground">: </span>
            <JsonNode value={val} depth={depth + 1} defaultExpandDepth={defaultExpandDepth} />
            {i < entries.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
      </div>
      <span className="text-muted-foreground">{"}"}</span>
    </span>
  );
}

function CollapsibleArray({
  items,
  depth,
  defaultExpandDepth,
}: {
  items: unknown[];
  depth: number;
  defaultExpandDepth: number;
}) {
  const [expanded, setExpanded] = useState(depth < defaultExpandDepth);

  if (items.length === 0) return <span className="text-muted-foreground">[]</span>;

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-muted-foreground hover:text-foreground"
      >
        [<span className="text-[10px]">{items.length} items</span>]
      </button>
    );
  }

  return (
    <span>
      <button
        onClick={() => setExpanded(false)}
        className="text-muted-foreground hover:text-foreground"
      >
        [
      </button>
      <div className="ml-4 border-l border-border/30 pl-2">
        {items.map((item, i) => (
          <div key={i}>
            <JsonNode value={item} depth={depth + 1} defaultExpandDepth={defaultExpandDepth} />
            {i < items.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
      </div>
      <span className="text-muted-foreground">]</span>
    </span>
  );
}
