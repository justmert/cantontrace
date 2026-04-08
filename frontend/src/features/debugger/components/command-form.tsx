import { useState, useEffect, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete01Icon,
  PlayIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Package01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { partitionPackages } from "@/lib/utils";
import { ContractIdCombobox } from "@/components/smart-fields/contract-id-combobox";
import { PartyMultiSelect } from "@/components/smart-fields/party-multi-select";
import type {
  TraceRequest,
  SimulationCommand,
  DisclosedContract,
  TemplateDefinition,
  FieldDefinition,
  TemplateId,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Dynamic argument field
// ---------------------------------------------------------------------------

function ArgumentField({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const lowerType = field.type.toLowerCase();

  if (lowerType === "bool" || lowerType === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Label className="text-xs">{field.name}</Label>
        <select
          className="h-8 rounded-md border bg-background px-2 text-xs"
          value={String(value ?? "false")}
          onChange={(e) => onChange(e.target.value === "true")}
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
        <span className="text-xs text-muted-foreground">{field.type}</span>
      </div>
    );
  }

  if (lowerType === "int" || lowerType === "int64" || lowerType === "decimal" || lowerType === "numeric") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Label className="text-xs">{field.name}</Label>
          {field.optional && (
            <Badge variant="outline" className="text-[11px]">
              optional
            </Badge>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {field.type}
          </span>
        </div>
        <Input
          type="number"
          className="h-8 font-mono text-xs"
          placeholder={`${field.name} (${field.type})`}
          value={String(value ?? "")}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? undefined : Number(v));
          }}
        />
      </div>
    );
  }

  // Default: text input for Text, Party, ContractId, etc.
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Label className="text-xs">{field.name}</Label>
        {field.optional && (
          <Badge variant="outline" className="text-[11px]">
            optional
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {field.type}
        </span>
      </div>
      <Input
        className="h-8 font-mono text-xs"
        placeholder={`${field.name} (${field.type})`}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disclosed contract form
// ---------------------------------------------------------------------------

interface DisclosedContractEntry {
  id: string;
  contractId: string;
  templatePackage: string;
  templateModule: string;
  templateEntity: string;
  eventBlob: string;
}

function DisclosedContractForm({
  entries,
  onAdd,
  onRemove,
  onUpdate,
}: {
  entries: DisclosedContractEntry[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: keyof DisclosedContractEntry, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">
          Disclosed Contracts
        </Label>
        <Button size="sm" variant="outline" onClick={onAdd} className="h-7 text-xs">
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
          Add
        </Button>
      </div>
      {entries.map((entry) => (
        <div key={entry.id} className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Disclosed Contract</span>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => onRemove(entry.id)}
            >
              <HugeiconsIcon icon={Delete01Icon} className="text-muted-foreground" strokeWidth={2} />
            </Button>
          </div>
          <Input
            className="h-7 font-mono text-xs"
            placeholder="Contract ID"
            value={entry.contractId}
            onChange={(e) => onUpdate(entry.id, "contractId", e.target.value)}
          />
          <div className="grid grid-cols-3 gap-2">
            <Input
              className="h-7 font-mono text-xs"
              placeholder="Package"
              value={entry.templatePackage}
              onChange={(e) => onUpdate(entry.id, "templatePackage", e.target.value)}
            />
            <Input
              className="h-7 font-mono text-xs"
              placeholder="Module"
              value={entry.templateModule}
              onChange={(e) => onUpdate(entry.id, "templateModule", e.target.value)}
            />
            <Input
              className="h-7 font-mono text-xs"
              placeholder="Entity"
              value={entry.templateEntity}
              onChange={(e) => onUpdate(entry.id, "templateEntity", e.target.value)}
            />
          </div>
          <Input
            className="h-7 font-mono text-xs"
            placeholder="Created event blob (base64)"
            value={entry.eventBlob}
            onChange={(e) => onUpdate(entry.id, "eventBlob", e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main command form
// ---------------------------------------------------------------------------

export interface CommandFormProps {
  onTrace: (request: TraceRequest) => void;
  isTracing: boolean;
}

export function CommandForm({ onTrace, isTracing }: CommandFormProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Form state
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedChoice, setSelectedChoice] = useState<string>("");
  const [contractId, setContractId] = useState("");
  const [actingParties, setActingParties] = useState<string[]>([]);
  const [readAsParties, setReadAsParties] = useState<string[]>([]);
  const [historicalOffset, setHistoricalOffset] = useState("");
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const [disclosedEntries, setDisclosedEntries] = useState<DisclosedContractEntry[]>([]);

  // Fetch packages
  const { data: packages, isLoading: packagesLoading } = useQuery({
    queryKey: ["packages-summary"],
    queryFn: () => api.getPackages().then((r) => r.data),
    staleTime: 60_000,
  });

  // Partition packages into user vs system (system packages have no templates)
  const [userPackages, systemPackages] = useMemo(
    () => partitionPackages(packages ?? []),
    [packages]
  );

  // Fetch package detail (templates + choices)
  const { data: packageDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["package-detail", selectedPackageId],
    queryFn: () => api.getPackageTemplates(selectedPackageId).then((r) => r.data),
    enabled: !!selectedPackageId,
    staleTime: 10 * 60 * 1000,
  });

  // Derive available templates and choices
  const allTemplates: TemplateDefinition[] =
    packageDetail?.modules.flatMap((m) => m.templates) ?? [];

  const currentTemplate = allTemplates.find((t) => t.name === selectedTemplate);
  const currentChoice = currentTemplate?.choices.find(
    (c) => c.name === selectedChoice
  );

  // Build template filter for Contract ID combobox based on selected template
  const contractTemplateFilter = useMemo<TemplateId[] | undefined>(() => {
    if (!currentTemplate || !packageDetail) return undefined;
    const module = packageDetail.modules.find((m) =>
      m.templates.some((t) => t.name === selectedTemplate)
    );
    if (!module) return undefined;
    return [
      {
        packageName: packageDetail.packageName ?? selectedPackageId,
        moduleName: module.name,
        entityName: selectedTemplate,
      },
    ];
  }, [currentTemplate, packageDetail, selectedTemplate, selectedPackageId]);

  // Reset downstream selections when parent changes
  useEffect(() => {
    setSelectedTemplate("");
    setSelectedChoice("");
    setArgs({});
  }, [selectedPackageId]);

  useEffect(() => {
    setSelectedChoice("");
    setArgs({});
  }, [selectedTemplate]);

  useEffect(() => {
    setArgs({});
  }, [selectedChoice]);

  // Disclosed contract helpers
  const addDisclosed = () => {
    setDisclosedEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        contractId: "",
        templatePackage: "",
        templateModule: "",
        templateEntity: "",
        eventBlob: "",
      },
    ]);
  };

  const removeDisclosed = (id: string) => {
    setDisclosedEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const updateDisclosed = (
    id: string,
    field: keyof DisclosedContractEntry,
    value: string
  ) => {
    setDisclosedEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  // Build and submit the trace request
  const handleTrace = () => {
    if (!currentTemplate) return;

    const module = packageDetail?.modules.find((m) =>
      m.templates.some((t) => t.name === selectedTemplate)
    );

    const templateId: TemplateId = {
      packageName: packageDetail?.packageName ?? selectedPackageId,
      moduleName: module?.name ?? "",
      entityName: selectedTemplate,
    };

    const command: SimulationCommand = {
      templateId,
      choice: selectedChoice || undefined,
      contractId: contractId || undefined,
      arguments: args,
    };

    const disclosed: DisclosedContract[] = disclosedEntries
      .filter((e) => e.contractId)
      .map((e) => ({
        contractId: e.contractId,
        templateId: {
          packageName: e.templatePackage,
          moduleName: e.templateModule,
          entityName: e.templateEntity,
        },
        payload: {},
        createdEventBlob: e.eventBlob || undefined,
      }));

    const request: TraceRequest = {
      command,
      actAs: actingParties.filter(Boolean),
      readAs: readAsParties.filter(Boolean),
      disclosedContracts: disclosed.length > 0 ? disclosed : undefined,
      historicalOffset: historicalOffset || undefined,
    };

    onTrace(request);
  };

  return (
    <div className="flex flex-col rounded-lg border bg-card shadow-sm">
      {/* Header */}
      <button
        className="flex items-center justify-between px-4 py-3"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon icon={Package01Icon} className="size-4 text-muted-foreground" strokeWidth={2} />
          Command Configuration
          {currentTemplate && (
            <Badge variant="outline" className="ml-2 font-mono text-xs">
              {selectedTemplate}
              {selectedChoice && ` / ${selectedChoice}`}
            </Badge>
          )}
        </div>
        {collapsed ? (
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 text-muted-foreground" strokeWidth={2} />
        ) : (
          <HugeiconsIcon icon={ArrowUp01Icon} className="size-4 text-muted-foreground" strokeWidth={2} />
        )}
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-4 border-t px-4 pb-4 pt-3">
          {/* Template / Choice selection */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {/* Package */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Package
              </Label>
              {packagesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select
                  value={selectedPackageId}
                  onValueChange={setSelectedPackageId}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select package..." />
                  </SelectTrigger>
                  <SelectContent>
                    {userPackages.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-xs text-muted-foreground">
                          User Packages
                        </SelectLabel>
                        {userPackages.map((pkg) => (
                          <SelectItem key={pkg.packageId} value={pkg.packageId}>
                            <span className="text-xs">
                              {pkg.packageName ?? pkg.packageId.slice(0, 16)}
                              {pkg.packageVersion && ` v${pkg.packageVersion}`}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {systemPackages.length > 0 && (
                      <>
                        {userPackages.length > 0 && <SelectSeparator />}
                        <SelectGroup>
                          <SelectLabel className="text-xs text-muted-foreground">
                            System Packages (no templates)
                          </SelectLabel>
                          {systemPackages.map((pkg) => (
                            <SelectItem
                              key={pkg.packageId}
                              value={pkg.packageId}
                              className="text-muted-foreground"
                            >
                              <span className="text-xs">
                                {pkg.packageName ?? pkg.packageId.slice(0, 16)}
                                {pkg.packageVersion && ` v${pkg.packageVersion}`}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Template */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Template
              </Label>
              {detailLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select
                  value={selectedTemplate}
                  onValueChange={setSelectedTemplate}
                  disabled={!selectedPackageId || allTemplates.length === 0}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue
                      placeholder={
                        selectedPackageId && !detailLoading && allTemplates.length === 0
                          ? "No templates in this package"
                          : "Select template..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {allTemplates.map((t) => (
                      <SelectItem key={t.name} value={t.name}>
                        <span className="text-xs">{t.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Choice */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Choice
              </Label>
              <Select
                value={selectedChoice}
                onValueChange={setSelectedChoice}
                disabled={!currentTemplate}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select choice..." />
                </SelectTrigger>
                <SelectContent>
                  {currentTemplate?.choices.map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      <span className="flex items-center gap-2 text-xs">
                        {c.name}
                        {c.consuming && (
                          <Badge
                            variant="outline"
                            className="text-[11px] text-destructive"
                          >
                            consuming
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Contract ID */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Contract ID (for exercise commands)
            </Label>
            <ContractIdCombobox
              value={contractId}
              onChange={setContractId}
              templateFilter={contractTemplateFilter}
              placeholder="Select or type a contract ID..."
              className="h-9"
            />
          </div>

          {/* Dynamic arguments */}
          {currentChoice && currentChoice.parameters.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Choice Arguments
              </Label>
              <div className="grid grid-cols-1 gap-2 rounded-md border bg-muted/20 p-3 md:grid-cols-2">
                {currentChoice.parameters.map((param) => (
                  <ArgumentField
                    key={param.name}
                    field={param}
                    value={args[param.name]}
                    onChange={(v) =>
                      setArgs((prev) => ({ ...prev, [param.name]: v }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Parties */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Acting As
              </Label>
              <PartyMultiSelect
                value={actingParties}
                onChange={setActingParties}
                placeholder="Select acting parties..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Read As
              </Label>
              <PartyMultiSelect
                value={readAsParties}
                onChange={setReadAsParties}
                placeholder="Select read-as parties..."
              />
            </div>
          </div>

          {/* Historical offset */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Historical Offset (optional, for time-travel debugging)
            </Label>
            <Input
              className="h-9 font-mono text-xs"
              placeholder="Leave blank for current state"
              value={historicalOffset}
              onChange={(e) => setHistoricalOffset(e.target.value)}
            />
          </div>

          {/* Disclosed contracts */}
          <DisclosedContractForm
            entries={disclosedEntries}
            onAdd={addDisclosed}
            onRemove={removeDisclosed}
            onUpdate={updateDisclosed}
          />

          <Separator />

          {/* Trace button */}
          <div className="flex justify-end">
            <Button
              onClick={handleTrace}
              disabled={!currentTemplate || isTracing}
              className="min-w-[120px]"
            >
              {isTracing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={PlayIcon} data-icon="inline-start" strokeWidth={2} />
              )}
              Trace
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
