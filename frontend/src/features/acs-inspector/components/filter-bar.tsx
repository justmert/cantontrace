import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, FilterIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface TemplateOption {
  key: string;
  packageName: string;
  moduleName: string;
  entityName: string;
}

export interface FilterBarProps {
  templateOptions: TemplateOption[];
  parties: string[];
  selectedTemplate: string;
  selectedParty: string;
  searchContractId: string;
  resultCount: number | undefined;
  isLoading: boolean;
  onTemplateChange: (value: string) => void;
  onPartyChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
}

export function FilterBar({
  templateOptions,
  parties,
  selectedTemplate,
  selectedParty,
  searchContractId,
  resultCount,
  isLoading,
  onTemplateChange,
  onPartyChange,
  onSearchChange,
  onApply,
  onClear,
}: FilterBarProps) {
  const hasFilters =
    selectedTemplate !== "__all__" ||
    selectedParty !== "__all__" ||
    searchContractId.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <HugeiconsIcon icon={FilterIcon} strokeWidth={2} className="size-4" />
        <span>Filters</span>
        {resultCount !== undefined && (
          <Badge variant="secondary" className="ml-auto">
            {resultCount.toLocaleString()} contract{resultCount !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {/* Template filter */}
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Template
          </label>
          <Select value={selectedTemplate} onValueChange={onTemplateChange}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All templates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All templates</SelectItem>
              {templateOptions.map((tmpl) => (
                <SelectItem key={tmpl.key} value={tmpl.key}>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs">{tmpl.entityName}</span>
                    <span className="text-xs text-muted-foreground">
                      {tmpl.moduleName}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Party filter */}
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Party
          </label>
          <Select value={selectedParty} onValueChange={onPartyChange}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All parties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All parties</SelectItem>
              {parties.map((party) => (
                <SelectItem key={party} value={party}>
                  <span className="font-mono text-xs">{party}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Contract ID search */}
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Contract ID
          </label>
          <div className="relative">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8 font-mono text-xs"
              placeholder="Search by contract ID prefix..."
              value={searchContractId}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onApply();
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onApply} disabled={isLoading}>
            Apply Filters
          </Button>
          {hasFilters && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={onClear}
                    aria-label="Clear all filters"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear all filters</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
}
