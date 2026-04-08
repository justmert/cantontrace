import { useState, useRef, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete01Icon, ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { FieldDefinition } from "@/lib/types";
import { useKnownParties } from "@/features/debugger/hooks";

// ---------------------------------------------------------------------------
// Type inference helpers
// ---------------------------------------------------------------------------

function inferInputType(
  typeStr: string
): "text" | "number" | "bool" | "party" | "contractId" | "record" | "list" | "optional" {
  const lower = typeStr.toLowerCase();
  if (lower === "bool" || lower === "boolean") return "bool";
  if (
    lower === "int" ||
    lower === "int64" ||
    lower === "decimal" ||
    lower === "numeric"
  )
    return "number";
  if (lower === "party") return "party";
  if (lower.startsWith("contractid")) return "contractId";
  if (lower.startsWith("optional")) return "optional";
  if (lower.startsWith("[") || lower.startsWith("list")) return "list";
  if (lower.includes(".") || lower.startsWith("{")) return "record";
  return "text";
}

function extractOptionalInner(typeStr: string): string {
  const match = typeStr.match(/^Optional\s*\(?\s*(.+?)\s*\)?$/i);
  return match?.[1] ?? "Text";
}

function extractListInner(typeStr: string): string {
  const match = typeStr.match(/^\[(.+)]$/);
  if (match) return match[1];
  const listMatch = typeStr.match(/^List\s*\(?\s*(.+?)\s*\)?$/i);
  return listMatch?.[1] ?? "Text";
}

// ---------------------------------------------------------------------------
// Field components
// ---------------------------------------------------------------------------

function BoolField({
  name: _name,
  value,
  onChange,
}: {
  name: string;
  value: unknown;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Switch checked={!!value} onCheckedChange={onChange} />
      <Label className="text-xs">{value ? "True" : "False"}</Label>
    </div>
  );
}

function NumberField({
  name: _name,
  value,
  onChange,
  type,
}: {
  name: string;
  value: unknown;
  onChange: (v: number | undefined) => void;
  type: string;
}) {
  return (
    <Input
      type="number"
      className="h-8 font-mono text-xs"
      placeholder={`Enter ${type}...`}
      value={value !== undefined && value !== null ? String(value) : ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? undefined : Number(v));
      }}
    />
  );
}

function TextField({
  name: _name,
  value,
  onChange,
  type,
  placeholder,
}: {
  name: string;
  value: unknown;
  onChange: (v: string | undefined) => void;
  type: string;
  placeholder?: string;
}) {
  return (
    <Input
      className="h-8 font-mono text-xs"
      placeholder={placeholder ?? `Enter ${type}...`}
      value={value !== undefined && value !== null ? String(value) : ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  );
}

function PartyField({
  name: _name,
  value,
  onChange,
}: {
  name: string;
  value: unknown;
  onChange: (v: string | undefined) => void;
}) {
  const [query, setQuery] = useState(
    value !== undefined && value !== null ? String(value) : ""
  );
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: knownParties } = useKnownParties();

  // Sync external value changes
  useEffect(() => {
    setQuery(value !== undefined && value !== null ? String(value) : "");
  }, [value]);

  const filtered = (knownParties ?? []).filter((p) =>
    p.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        className="h-8 font-mono text-xs"
        placeholder="Select or type a party..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value || undefined);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full z-50 mt-1 max-h-36 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
          {filtered.map((party) => (
            <button
              key={party}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery(party);
                onChange(party);
                setOpen(false);
              }}
            >
              {party}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionalField({
  name,
  typeStr,
  value,
  onChange,
}: {
  name: string;
  typeStr: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [enabled, setEnabled] = useState(value !== undefined && value !== null);
  const innerType = extractOptionalInner(typeStr);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            setEnabled(checked);
            if (!checked) onChange(undefined);
          }}
        />
        <Label className="text-xs text-muted-foreground">
          {enabled ? "Some" : "None"}
        </Label>
      </div>
      {enabled && (
        <DynamicField
          field={{ name, type: innerType, optional: false }}
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function ListField({
  name,
  typeStr,
  value,
  onChange,
}: {
  name: string;
  typeStr: string;
  value: unknown;
  onChange: (v: unknown[]) => void;
}) {
  const items = Array.isArray(value) ? value : [];
  const innerType = extractListInner(typeStr);

  const addItem = () => onChange([...items, undefined]);
  const removeItem = (idx: number) =>
    onChange(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, v: unknown) =>
    onChange(items.map((item, i) => (i === idx ? v : item)));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {items.length} item{items.length !== 1 ? "s" : ""}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={addItem}
          className="h-6 text-xs"
        >
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
          Add
        </Button>
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <div className="flex-1">
            <DynamicField
              field={{
                name: `${name}[${idx}]`,
                type: innerType,
                optional: false,
              }}
              value={item}
              onChange={(v) => updateItem(idx, v)}
            />
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => removeItem(idx)}
            className="flex-shrink-0"
          >
            <HugeiconsIcon icon={Delete01Icon} className="text-muted-foreground" strokeWidth={2} />
          </Button>
        </div>
      ))}
    </div>
  );
}

function RecordField({
  name,
  fields,
  value,
  onChange,
}: {
  name: string;
  fields?: FieldDefinition[];
  value: unknown;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const record = (typeof value === "object" && value !== null
    ? value
    : {}) as Record<string, unknown>;

  // If we have field definitions, render them
  if (fields && fields.length > 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          className="flex items-center gap-1 text-xs hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3" strokeWidth={2} />
          ) : (
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" strokeWidth={2} />
          )}
          <span className="text-muted-foreground">{name}</span>
        </button>
        {expanded && (
          <div className="ml-3 flex flex-col gap-2 border-l border-border pl-3">
            {fields.map((f) => (
              <div key={f.name} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">{f.name}</Label>
                  {f.optional && (
                    <Badge variant="outline" className="text-[10px]">
                      optional
                    </Badge>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {f.type}
                  </span>
                </div>
                <DynamicField
                  field={f}
                  value={record[f.name]}
                  onChange={(v) =>
                    onChange({ ...record, [f.name]: v })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Fallback: JSON text area
  return (
    <textarea
      className="h-20 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
      placeholder='{"key": "value"}'
      value={JSON.stringify(record, null, 2)}
      onChange={(e) => {
        try {
          onChange(JSON.parse(e.target.value));
        } catch {
          // Keep current value on parse error
        }
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Dynamic field dispatcher
// ---------------------------------------------------------------------------

interface DynamicFieldProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

function DynamicField({ field, value, onChange }: DynamicFieldProps) {
  const inputType = inferInputType(field.type);

  switch (inputType) {
    case "bool":
      return (
        <BoolField
          name={field.name}
          value={value}
          onChange={(v) => onChange(v)}
        />
      );
    case "number":
      return (
        <NumberField
          name={field.name}
          value={value}
          onChange={(v) => onChange(v)}
          type={field.type}
        />
      );
    case "party":
      return (
        <PartyField
          name={field.name}
          value={value}
          onChange={(v) => onChange(v)}
        />
      );
    case "contractId":
      return (
        <TextField
          name={field.name}
          value={value}
          onChange={(v) => onChange(v)}
          type={field.type}
          placeholder="Enter contract ID..."
        />
      );
    case "optional":
      return (
        <OptionalField
          name={field.name}
          typeStr={field.type}
          value={value}
          onChange={onChange}
        />
      );
    case "list":
      return (
        <ListField
          name={field.name}
          typeStr={field.type}
          value={value}
          onChange={(v) => onChange(v)}
        />
      );
    case "record":
      return (
        <RecordField
          name={field.name}
          fields={field.fields}
          value={value}
          onChange={(v) => onChange(v)}
        />
      );
    default:
      return (
        <TextField
          name={field.name}
          value={value}
          onChange={(v) => onChange(v)}
          type={field.type}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Main argument form
// ---------------------------------------------------------------------------

export interface ArgumentFormProps {
  parameters: FieldDefinition[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

export function ArgumentForm({
  parameters,
  values,
  onChange,
}: ArgumentFormProps) {
  if (parameters.length === 0) {
    return (
      <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
        This choice takes no arguments
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {parameters.map((param) => (
        <div key={param.name} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium">{param.name}</Label>
            {param.optional && (
              <Badge variant="outline" className="text-[11px]">
                optional
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {param.type}
            </span>
          </div>
          <DynamicField
            field={param}
            value={values[param.name]}
            onChange={(v) => onChange({ ...values, [param.name]: v })}
          />
        </div>
      ))}
    </div>
  );
}

export { DynamicField };
