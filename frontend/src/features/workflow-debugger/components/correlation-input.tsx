import React, { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ContractIdCombobox } from "@/components/smart-fields/contract-id-combobox";
import { UpdateIdCombobox } from "@/components/smart-fields/update-id-combobox";
import type { WorkflowCorrelation } from "@/lib/types";

// ---------------------------------------------------------------------------
// Descriptions for each correlation type
// ---------------------------------------------------------------------------

const DESCRIPTIONS: Record<string, string> = {
  trace_context:
    "Group transactions sharing the same W3C distributed trace context (primary, most reliable)",
  contract_chain:
    "Follow contracts from creation through exercises to child contracts",
  workflow_id:
    "Group by application-set workflow_id (supplementary, often empty)",
  update_id: "Start from a specific update_id and trace related transactions",
};

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
  const [tab, setTab] = useState<string>("trace_context");
  const [traceId, setTraceId] = useState("");
  const [contractId, setContractId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [updateId, setUpdateId] = useState("");

  const handleSearch = () => {
    switch (tab) {
      case "trace_context":
        if (traceId.trim()) {
          onSearch({ type: "trace_context", traceId: traceId.trim() });
        }
        break;
      case "contract_chain":
        if (contractId.trim()) {
          onSearch({
            type: "contract_chain",
            startContractId: contractId.trim(),
          });
        }
        break;
      case "workflow_id":
        if (workflowId.trim()) {
          onSearch({ type: "workflow_id", workflowId: workflowId.trim() });
        }
        break;
      case "update_id":
        if (updateId.trim()) {
          onSearch({ type: "update_id", updateId: updateId.trim() });
        }
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const isSearchDisabled = () => {
    switch (tab) {
      case "trace_context":
        return !traceId.trim();
      case "contract_chain":
        return !contractId.trim();
      case "workflow_id":
        return !workflowId.trim();
      case "update_id":
        return !updateId.trim();
      default:
        return true;
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
        <span>Workflow Correlation</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Choose a correlation method to group related transactions into a
              workflow view. Trace ID is the most reliable method.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="trace_context">Trace ID</TabsTrigger>
          <TabsTrigger value="contract_chain">Contract Chain</TabsTrigger>
          <TabsTrigger value="workflow_id">Workflow ID</TabsTrigger>
          <TabsTrigger value="update_id">Update ID</TabsTrigger>
        </TabsList>

        <div className="mt-3">
          <TabsContent value="trace_context" className="mt-0">
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {DESCRIPTIONS.trace_context}
              </p>
              <div className="flex gap-2">
                <Input
                  className="flex-1 font-mono text-xs"
                  placeholder="W3C trace_parent trace ID (e.g. 4bf92f3577b34da6a3ce929d0e0e4736)"
                  value={traceId}
                  onChange={(e) => setTraceId(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <Button
                  onClick={handleSearch}
                  disabled={isSearchDisabled() || isLoading}
                >
                  {isLoading ? "Searching..." : "Search"}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="contract_chain" className="mt-0">
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {DESCRIPTIONS.contract_chain}
              </p>
              <div className="flex gap-2">
                <div className="flex-1" onKeyDown={handleKeyDown}>
                  <ContractIdCombobox
                    value={contractId}
                    onChange={setContractId}
                    placeholder="Select or type a contract ID to trace..."
                  />
                </div>
                <Button
                  onClick={handleSearch}
                  disabled={isSearchDisabled() || isLoading}
                >
                  {isLoading ? "Tracing..." : "Trace Chain"}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="workflow_id" className="mt-0">
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {DESCRIPTIONS.workflow_id}
              </p>
              <div className="flex gap-2">
                <Input
                  className="flex-1 font-mono text-xs"
                  placeholder="Application-set workflow_id"
                  value={workflowId}
                  onChange={(e) => setWorkflowId(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <Button
                  onClick={handleSearch}
                  disabled={isSearchDisabled() || isLoading}
                >
                  {isLoading ? "Searching..." : "Search"}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="update_id" className="mt-0">
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {DESCRIPTIONS.update_id}
              </p>
              <div className="flex gap-2">
                <div className="flex-1" onKeyDown={handleKeyDown}>
                  <UpdateIdCombobox
                    value={updateId}
                    onChange={setUpdateId}
                    placeholder="Select or type an update ID..."
                  />
                </div>
                <Button
                  onClick={handleSearch}
                  disabled={isSearchDisabled() || isLoading}
                >
                  {isLoading ? "Searching..." : "Search"}
                </Button>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
