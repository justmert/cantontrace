import React, { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContractIdCombobox } from "@/components/smart-fields/contract-id-combobox";
import { UpdateIdCombobox } from "@/components/smart-fields/update-id-combobox";
import type { WorkflowCorrelation } from "@/lib/types";

// ---------------------------------------------------------------------------
// Correlation types
// ---------------------------------------------------------------------------

const CORRELATION_TYPES = [
  { value: "trace_context", label: "Trace ID", placeholder: "W3C trace_parent ID..." },
  { value: "contract_chain", label: "Contract Chain", placeholder: "Contract ID to trace..." },
  { value: "workflow_id", label: "Workflow ID", placeholder: "Application workflow_id..." },
  { value: "update_id", label: "Update ID", placeholder: "Transaction update ID..." },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CorrelationInputProps {
  onSearch: (correlation: WorkflowCorrelation) => void;
  isLoading: boolean;
}

export function CorrelationInput({
  onSearch,
  isLoading,
}: CorrelationInputProps) {
  const [type, setType] = useState<string>("trace_context");
  const [value, setValue] = useState("");

  const handleSearch = () => {
    if (!value.trim()) return;
    switch (type) {
      case "trace_context":
        onSearch({ type: "trace_context", traceId: value.trim() });
        break;
      case "contract_chain":
        onSearch({ type: "contract_chain", startContractId: value.trim() });
        break;
      case "workflow_id":
        onSearch({ type: "workflow_id", workflowId: value.trim() });
        break;
      case "update_id":
        onSearch({ type: "update_id", updateId: value.trim() });
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleTypeChange = (newType: string) => {
    setType(newType);
    setValue("");
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={type} onValueChange={handleTypeChange}>
        <SelectTrigger className="w-[160px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CORRELATION_TYPES.map((ct) => (
            <SelectItem key={ct.value} value={ct.value}>
              {ct.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex-1" onKeyDown={handleKeyDown}>
        {type === "contract_chain" ? (
          <ContractIdCombobox
            value={value}
            onChange={setValue}
            placeholder="Select or type contract ID..."
          />
        ) : type === "update_id" ? (
          <UpdateIdCombobox
            value={value}
            onChange={setValue}
            placeholder="Select or type update ID..."
          />
        ) : (
          <Input
            className="font-mono text-xs"
            placeholder={CORRELATION_TYPES.find((ct) => ct.value === type)?.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </div>

      <Button
        onClick={handleSearch}
        disabled={!value.trim() || isLoading}
        className="shrink-0"
      >
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} data-icon="inline-start" />
        {isLoading ? "Searching..." : "Trace"}
      </Button>
    </div>
  );
}
