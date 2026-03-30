import { useState, useEffect, useMemo, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlayIcon,
  Add01Icon,
  Delete01Icon,
  HelpCircleIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Bug01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn, partitionPackages } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ContractIdCombobox } from "@/components/smart-fields/contract-id-combobox";
import { PartyMultiSelect } from "@/components/smart-fields/party-multi-select";
import type {
  SimulationRequest,
  SimulationCommand,
  TraceRequest,
  DisclosedContract,
  TemplateDefinition,
  TemplateId,
} from "@/lib/types";
import { ArgumentForm } from "./argument-form";

// ---------------------------------------------------------------------------
// Disclosed contract entry
// ---------------------------------------------------------------------------

interface DisclosedEntry {
  id: string;
  contractId: string;
  templatePackage: string;
  templateModule: string;
  templateEntity: string;
  eventBlob: string;
}

// ---------------------------------------------------------------------------
// Command builder component
// ---------------------------------------------------------------------------

export interface CommandBuilderProps {
  onSimulate: (request: SimulationRequest) => void;
  onTrace?: (request: TraceRequest) => void;
  isSimulating: boolean;
  isTracing?: boolean;
  /** When true, the command builder starts collapsed (e.g. after first run) */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  initialValues?: Partial<{
    packageId: string;
    template: string;
    choice: string;
    contractId: string;
    args: Record<string, unknown>;
    actAs: string;
    readAs: string;
    mode: "online" | "offline";
    offset: string;
  }>;
}

export function CommandBuilder({
  onSimulate,
  onTrace,
  isSimulating,
  isTracing = false,
  collapsed = false,
  onCollapsedChange,
  initialValues,
}: CommandBuilderProps) {
  // Parse initial template value — may be "ModuleName:EntityName" from URL
  const parsedInitialTemplate = useMemo(() => {
    const raw = initialValues?.template ?? "";
    if (raw.includes(":")) {
      return raw.split(":").pop() ?? "";
    }
    return raw;
  }, [initialValues?.template]);

  // Form state
  const [selectedPackageId, setSelectedPackageId] = useState(
    initialValues?.packageId ?? ""
  );
  const [selectedTemplate, setSelectedTemplate] = useState(
    parsedInitialTemplate
  );
  const [selectedChoice, setSelectedChoice] = useState(
    initialValues?.choice ?? ""
  );
  const [contractId, setContractId] = useState(
    initialValues?.contractId ?? ""
  );
  const [args, setArgs] = useState<Record<string, unknown>>(
    initialValues?.args ?? {}
  );
  const [actingParties, setActingParties] = useState<string[]>(
    initialValues?.actAs
      ? initialValues.actAs.split(",").map((p) => p.trim()).filter(Boolean)
      : []
  );
  const [readAsParties, setReadAsParties] = useState<string[]>(
    initialValues?.readAs
      ? initialValues.readAs.split(",").map((p) => p.trim()).filter(Boolean)
      : []
  );
  const [mode, setMode] = useState<"online" | "offline">(
    initialValues?.mode ?? "online"
  );
  const [historicalOffset, setHistoricalOffset] = useState(
    initialValues?.offset ?? ""
  );
  const [disclosedEntries, setDisclosedEntries] = useState<DisclosedEntry[]>(
    []
  );
  const [disclosedOpen, setDisclosedOpen] = useState(false);

  // Fetch packages
  const { data: packages, isLoading: packagesLoading } = useQuery({
    queryKey: ["packages-summary"],
    queryFn: () => api.getPackages().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  // Partition packages into user vs system
  const [userPackages, systemPackages] = useMemo(
    () => partitionPackages(packages ?? []),
    [packages]
  );

  // Auto-select the first user package that contains the initial template.
  // This fires once when packages finish loading and an initial template is provided
  // via URL query params (e.g. from ACS Inspector "Use in Simulation").
  useEffect(() => {
    if (!parsedInitialTemplate || selectedPackageId || !packages) return;
    // Prefer user packages, fall back to system packages
    const candidates = [...userPackages, ...systemPackages];
    if (candidates.length > 0) {
      // We don't know which package contains the template until we fetch its
      // detail, so select the first user package as a best guess.
      setSelectedPackageId(candidates[0].packageId);
    }
  }, [packages, parsedInitialTemplate, selectedPackageId, userPackages, systemPackages]);

  // Fetch package detail
  const { data: packageDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["package-detail", selectedPackageId],
    queryFn: () =>
      api.getPackageTemplates(selectedPackageId).then((r) => r.data),
    enabled: !!selectedPackageId,
    staleTime: 10 * 60 * 1000,
  });

  const allTemplates: TemplateDefinition[] =
    packageDetail?.modules.flatMap((m) => m.templates) ?? [];
  const currentTemplate = allTemplates.find(
    (t) => t.name === selectedTemplate
  );
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

  // Reset downstream when parent changes
  useEffect(() => {
    if (!initialValues?.template) {
      setSelectedTemplate("");
      setSelectedChoice("");
      setArgs({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPackageId]);

  useEffect(() => {
    if (!initialValues?.choice) {
      setSelectedChoice("");
      setArgs({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate]);

  useEffect(() => {
    if (!initialValues?.args) {
      setArgs({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setDisclosedOpen(true);
  };

  const removeDisclosed = (id: string) => {
    setDisclosedEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const updateDisclosed = (
    id: string,
    field: keyof DisclosedEntry,
    value: string
  ) => {
    setDisclosedEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  // Submit
  const handleSimulate = () => {
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

    const request: SimulationRequest = {
      mode,
      commands: [command],
      actAs: actingParties.filter(Boolean),
      readAs: readAsParties.filter(Boolean),
      disclosedContracts: disclosed.length > 0 ? disclosed : undefined,
      historicalOffset: historicalOffset || undefined,
    };

    onSimulate(request);
  };

  // Submit trace
  const handleTrace = () => {
    if (!currentTemplate || !onTrace) return;

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

  // Compact summary for collapsed state
  const summaryParts = useMemo(() => {
    const parts: string[] = [];
    if (selectedTemplate) parts.push(selectedTemplate);
    if (selectedChoice) parts.push(selectedChoice);
    if (actingParties.length > 0) parts.push(`as ${actingParties[0]}${actingParties.length > 1 ? ` +${actingParties.length - 1}` : ""}`);
    return parts.join(" / ");
  }, [selectedTemplate, selectedChoice, actingParties]);

  const handleSimulateAndCollapse = useCallback(() => {
    handleSimulate();
    onCollapsedChange?.(true);
  }, [handleSimulate, onCollapsedChange]);

  const handleTraceAndCollapse = useCallback(() => {
    handleTrace();
    onCollapsedChange?.(true);
  }, [handleTrace, onCollapsedChange]);

  return (
    <Card className="shrink-0">
      {/* Compact header — always visible, acts as collapse toggle */}
      <button
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => onCollapsedChange?.(!collapsed)}
      >
        <HugeiconsIcon
          icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
          className="size-4 text-muted-foreground"
          strokeWidth={2}
        />
        <span className="text-sm font-semibold">Command Builder</span>
        {/* Inline mode toggle — always visible */}
        <div className="ml-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HugeiconsIcon
                  icon={HelpCircleIcon}
                  className="size-3 text-muted-foreground"
                  strokeWidth={2}
                />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  <strong>Online (Prepare):</strong> Uses participant's
                  Prepare endpoint (requires CanActAs).
                </p>
                <p className="mt-1 text-xs">
                  <strong>Offline (Engine):</strong> Uses our engine
                  (requires CanReadAs only).
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex items-center rounded-full bg-muted p-0.5">
            <button
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                mode === "online"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setMode("online")}
            >
              Online
            </button>
            <button
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                mode === "offline"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setMode("offline")}
            >
              Offline
            </button>
          </div>
        </div>
        {/* Summary when collapsed */}
        {collapsed && summaryParts && (
          <span className="ml-2 truncate text-xs text-muted-foreground font-mono">
            {summaryParts}
          </span>
        )}
      </button>

      {/* Collapsible form body */}
      {!collapsed && (
        <CardContent className="px-4 pb-3 pt-0">
          <FieldGroup className="gap-2.5">
            {/* Command selection row: Package, Template, Choice */}
            <div className="grid grid-cols-3 gap-2">
              <Field>
                <FieldLabel className="text-[11px]">Package</FieldLabel>
                {packagesLoading ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  <Select
                    value={selectedPackageId}
                    onValueChange={setSelectedPackageId}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {userPackages.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="text-[10px] text-muted-foreground">
                            User Packages
                          </SelectLabel>
                          {userPackages.map((pkg) => (
                            <SelectItem
                              key={pkg.packageId}
                              value={pkg.packageId}
                            >
                              <span className="text-xs">
                                {pkg.packageName ?? pkg.packageId.slice(0, 16)}
                                {pkg.packageVersion &&
                                  ` v${pkg.packageVersion}`}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {systemPackages.length > 0 && (
                        <>
                          {userPackages.length > 0 && <SelectSeparator />}
                          <SelectGroup>
                            <SelectLabel className="text-[10px] text-muted-foreground">
                              System Packages
                            </SelectLabel>
                            {systemPackages.map((pkg) => (
                              <SelectItem
                                key={pkg.packageId}
                                value={pkg.packageId}
                                className="text-muted-foreground"
                              >
                                <span className="text-xs">
                                  {pkg.packageName ??
                                    pkg.packageId.slice(0, 16)}
                                  {pkg.packageVersion &&
                                    ` v${pkg.packageVersion}`}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field>
                <FieldLabel className="text-[11px]">Template</FieldLabel>
                {detailLoading ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  <Select
                    value={selectedTemplate}
                    onValueChange={setSelectedTemplate}
                    disabled={
                      !selectedPackageId || allTemplates.length === 0
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue
                        placeholder={
                          selectedPackageId &&
                          !detailLoading &&
                          allTemplates.length === 0
                            ? "No templates"
                            : "Select..."
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
              </Field>

              <Field>
                <FieldLabel className="text-[11px]">Choice</FieldLabel>
                <Select
                  value={selectedChoice}
                  onValueChange={setSelectedChoice}
                  disabled={!currentTemplate}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {currentTemplate?.choices.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        <span className="flex items-center gap-2 text-xs">
                          {c.name}
                          {c.consuming && (
                            <Badge
                              variant="outline"
                              className="text-[9px] text-destructive"
                            >
                              consuming
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Contract ID - shown when a choice is selected */}
            {selectedChoice && (
              <Field>
                <FieldLabel className="text-[11px]">Contract ID</FieldLabel>
                <ContractIdCombobox
                  value={contractId}
                  onChange={setContractId}
                  templateFilter={contractTemplateFilter}
                  placeholder="Select or type a contract ID..."
                />
              </Field>
            )}

            {/* Parties row */}
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel className="text-[11px]">Acting As</FieldLabel>
                <PartyMultiSelect
                  value={actingParties}
                  onChange={setActingParties}
                  placeholder="Select acting parties..."
                />
              </Field>
              <Field>
                <FieldLabel className="text-[11px]">Read As</FieldLabel>
                <PartyMultiSelect
                  value={readAsParties}
                  onChange={setReadAsParties}
                  placeholder="Select read-as parties..."
                />
              </Field>
            </div>

            {/* Historical offset (only for offline mode) */}
            {mode === "offline" && (
              <Field>
                <FieldLabel className="text-[11px]">Historical Offset</FieldLabel>
                <Input
                  className="h-8 font-mono text-xs"
                  placeholder="Leave blank for current ledger end"
                  value={historicalOffset}
                  onChange={(e) => setHistoricalOffset(e.target.value)}
                />
              </Field>
            )}

            {/* Dynamic choice arguments */}
            {currentChoice && (
              <>
                <Separator />
                <Field>
                  <FieldLabel className="text-[11px]">Choice Arguments</FieldLabel>
                  <div className="rounded-lg border bg-muted/30 p-2.5">
                    <ArgumentForm
                      parameters={currentChoice.parameters}
                      values={args}
                      onChange={setArgs}
                    />
                  </div>
                </Field>
              </>
            )}

            {/* Disclosed contracts - collapsible */}
            <Separator />
            <Collapsible open={disclosedOpen} onOpenChange={setDisclosedOpen}>
              <div className="flex items-center justify-between">
                <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium hover:text-foreground">
                  {disclosedOpen ? (
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      className="size-3.5"
                      strokeWidth={2}
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      className="size-3.5"
                      strokeWidth={2}
                    />
                  )}
                  Disclosed Contracts
                  {disclosedEntries.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {disclosedEntries.length}
                    </Badge>
                  )}
                </CollapsibleTrigger>
                <Button size="xs" variant="outline" onClick={addDisclosed}>
                  <HugeiconsIcon
                    icon={Add01Icon}
                    data-icon="inline-start"
                    strokeWidth={2}
                  />
                  Add
                </Button>
              </div>

              <CollapsibleContent>
                {disclosedEntries.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No disclosed contracts. Only needed for cross-domain scenarios.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2">
                    {disclosedEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">
                            Disclosed Contract
                          </span>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => removeDisclosed(entry.id)}
                          >
                            <HugeiconsIcon
                              icon={Delete01Icon}
                              className="text-muted-foreground"
                              strokeWidth={2}
                            />
                          </Button>
                        </div>
                        <Input
                          className="h-8 font-mono text-xs"
                          placeholder="Contract ID"
                          value={entry.contractId}
                          onChange={(e) =>
                            updateDisclosed(
                              entry.id,
                              "contractId",
                              e.target.value
                            )
                          }
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            className="h-8 font-mono text-xs"
                            placeholder="Package name"
                            value={entry.templatePackage}
                            onChange={(e) =>
                              updateDisclosed(
                                entry.id,
                                "templatePackage",
                                e.target.value
                              )
                            }
                          />
                          <Input
                            className="h-8 font-mono text-xs"
                            placeholder="Module name"
                            value={entry.templateModule}
                            onChange={(e) =>
                              updateDisclosed(
                                entry.id,
                                "templateModule",
                                e.target.value
                              )
                            }
                          />
                          <Input
                            className="h-8 font-mono text-xs"
                            placeholder="Entity name"
                            value={entry.templateEntity}
                            onChange={(e) =>
                              updateDisclosed(
                                entry.id,
                                "templateEntity",
                                e.target.value
                              )
                            }
                          />
                        </div>
                        <Input
                          className="h-8 font-mono text-xs"
                          placeholder="Created event blob (base64)"
                          value={entry.eventBlob}
                          onChange={(e) =>
                            updateDisclosed(
                              entry.id,
                              "eventBlob",
                              e.target.value
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="flex-1"
                      onClick={handleSimulate}
                      disabled={!currentTemplate || isSimulating || isTracing}
                    >
                      {isSimulating ? (
                        <Spinner data-icon="inline-start" className="size-4" />
                      ) : (
                        <HugeiconsIcon
                          icon={PlayIcon}
                          data-icon="inline-start"
                          strokeWidth={2}
                        />
                      )}
                      Simulate
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Results are predictions. Contracts may be archived between simulation and execution.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {onTrace && (
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={handleTrace}
                  disabled={!currentTemplate || isSimulating || isTracing}
                >
                  {isTracing ? (
                    <Spinner data-icon="inline-start" className="size-4" />
                  ) : (
                    <HugeiconsIcon
                      icon={Bug01Icon}
                      data-icon="inline-start"
                      strokeWidth={2}
                    />
                  )}
                  Trace
                </Button>
              )}
            </div>
          </FieldGroup>
        </CardContent>
      )}
    </Card>
  );
}
