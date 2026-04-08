import { useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlayIcon, Bug02Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ChoiceDefinition } from "@/lib/types";

export interface ChoiceDetailProps {
  choice: ChoiceDefinition;
  sourceAvailable: boolean;
  /** Qualified template name, e.g. "Main:AliceOnly" */
  templateQualified?: string;
  /** Package name for navigation */
  packageName?: string;
  /** All qualified template names in the package (for return type linking) */
  allTemplateNames?: string[];
  /** Navigate to a template in the explorer */
  onNavigateToTemplate?: (templateQualified: string) => void;
}

/**
 * Try to extract a template reference from a return type string.
 * E.g. "ContractId Agreement" -> "Agreement", "Optional (ContractId Foo)" -> "Foo"
 */
function extractTemplateRef(returnType: string): string | null {
  // Match patterns like "ContractId SomeTemplate"
  const contractIdMatch = returnType.match(/ContractId\s+(\w+)/);
  if (contractIdMatch) return contractIdMatch[1];
  return null;
}

export function ChoiceDetail({
  choice,
  sourceAvailable: _sourceAvailable,
  templateQualified,
  packageName,
  allTemplateNames,
  onNavigateToTemplate,
}: ChoiceDetailProps) {
  const navigate = useNavigate();

  // Check if return type references a known template
  const returnTypeRef = extractTemplateRef(choice.returnType);
  const matchedTemplate = returnTypeRef
    ? allTemplateNames?.find(
        (tq) =>
          tq.endsWith(`:${returnTypeRef}`) || tq === returnTypeRef
      )
    : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{choice.name}</span>
        <Badge
          variant={choice.consuming ? "destructive" : "secondary"}
          className="text-xs"
        >
          {choice.consuming ? "Consuming" : "Non-consuming"}
        </Badge>
      </div>

      {/* Controller */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Controller Expression
        </span>
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
          {choice.controllerExpression}
        </code>
      </div>

      {/* Parameters */}
      {choice.parameters.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Parameters
          </span>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="h-8 text-xs">Name</TableHead>
                  <TableHead className="h-8 text-xs">Type</TableHead>
                  <TableHead className="h-8 text-xs">Optional</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {choice.parameters.map((param) => (
                  <TableRow key={param.name}>
                    <TableCell className="py-1.5 font-mono text-xs">
                      {param.name}
                    </TableCell>
                    <TableCell className="py-1.5 font-mono text-xs text-primary">
                      {param.type}
                    </TableCell>
                    <TableCell className="py-1.5 text-xs">
                      {param.optional ? (
                        <Badge variant="outline" className="text-[11px]">
                          Optional
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Required</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Return type */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Return Type
        </span>
        {matchedTemplate && onNavigateToTemplate ? (
          <button
            className="w-fit rounded-md bg-muted px-2 py-1 font-mono text-xs text-primary hover:underline"
            onClick={() => onNavigateToTemplate(matchedTemplate)}
          >
            {choice.returnType}
          </button>
        ) : (
          <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-primary">
            {choice.returnType}
          </code>
        )}
      </div>

      {/* Source code */}
      {(choice.sourceCode || choice.decompiledLF) && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Source
            </span>
            <Badge variant="outline" className="text-[11px]">
              {choice.sourceCode ? "Daml Source" : "Decompiled LF"}
            </Badge>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
            {choice.sourceCode ?? choice.decompiledLF}
          </pre>
        </div>
      )}

      {/* Action buttons */}
      {templateQualified && (
        <div className="flex items-center gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({
                to: "/debugger",
                search: {
                  template: templateQualified,
                  choice: choice.name,
                  package: packageName,
                  mode: "simulate",
                },
              } as any)
            }
          >
            <HugeiconsIcon icon={PlayIcon} strokeWidth={2} data-icon="inline-start" />
            Simulate
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({
                to: "/debugger",
                search: {
                  template: templateQualified,
                  choice: choice.name,
                  package: packageName,
                  mode: "trace",
                },
              } as any)
            }
          >
            <HugeiconsIcon icon={Bug02Icon} strokeWidth={2} data-icon="inline-start" />
            Trace
          </Button>
        </div>
      )}
    </div>
  );
}
