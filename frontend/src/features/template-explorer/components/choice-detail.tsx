import { Badge } from "@/components/ui/badge";
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
}

export function ChoiceDetail({ choice, sourceAvailable: _sourceAvailable }: ChoiceDetailProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{choice.name}</span>
        <Badge
          variant={choice.consuming ? "destructive" : "secondary"}
          className="text-[10px]"
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
                        <Badge variant="outline" className="text-[9px]">
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
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-primary">
          {choice.returnType}
        </code>
      </div>

      {/* Source code */}
      {(choice.sourceCode || choice.decompiledLF) && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Source
            </span>
            <Badge variant="outline" className="text-[9px]">
              {choice.sourceCode ? "Daml Source" : "Decompiled LF"}
            </Badge>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
            {choice.sourceCode ?? choice.decompiledLF}
          </pre>
        </div>
      )}
    </div>
  );
}
