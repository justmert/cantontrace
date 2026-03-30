import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
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
  onClear,
}: FilterBarProps) {
  const hasFilters =
    selectedTemplate !== "__all__" ||
    selectedParty !== "__all__" ||
    searchContractId.length > 0;

  return (
    <div className="flex h-11 items-center gap-2 px-1">
      {/* Template filter */}
      <Select value={selectedTemplate} onValueChange={onTemplateChange}>
        <SelectTrigger className="h-8 w-[180px] text-xs">
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

      {/* Party filter */}
      <Select value={selectedParty} onValueChange={onPartyChange}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
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

      {/* Contract ID search */}
      <div className="relative min-w-[180px] flex-1">
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-8 pl-7 font-mono text-xs"
          placeholder="Search contract ID..."
          value={searchContractId}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Clear button */}
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

      {/* Loading indicator */}
      {isLoading && (
        <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Result count badge */}
      {resultCount !== undefined && (
        <Badge variant="secondary" className="shrink-0 text-xs">
          {resultCount.toLocaleString()} contract{resultCount !== 1 ? "s" : ""}
        </Badge>
      )}
    </div>
  );
}
