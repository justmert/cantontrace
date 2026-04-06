import React, { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FileCodeIcon,
  CodeIcon,
  Key01Icon,
  Layers01Icon,
  ListViewIcon,
  InformationCircleIcon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";


import type { TemplateDefinition, PackageDetail } from "@/lib/types";
import { ChoiceDetail } from "./choice-detail";

// ---------------------------------------------------------------------------
// Monaco lazy import -- the editor is only rendered in the Source tab
// ---------------------------------------------------------------------------

let MonacoEditor: React.ComponentType<{
  height: string;
  defaultLanguage: string;
  value: string;
  theme: string;
  options: Record<string, unknown>;
  className?: string;
}> | null = null;

function LazyMonaco({
  value,
  language,
}: {
  value: string;
  language: string;
}) {
  const [Editor, setEditor] = useState<typeof MonacoEditor>(MonacoEditor);
  const [loading, setLoading] = useState(!MonacoEditor);

  React.useEffect(() => {
    if (MonacoEditor) return;
    import("@monaco-editor/react").then((mod) => {
      MonacoEditor = mod.default as unknown as typeof MonacoEditor;
      setEditor(() => MonacoEditor);
      setLoading(false);
    });
  }, []);

  if (loading || !Editor) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border bg-muted">
        <span className="text-sm text-muted-foreground">Loading editor...</span>
      </div>
    );
  }

  // Detect dark mode by checking document class
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  return (
    <Editor
      height="100%"
      defaultLanguage={language}
      value={value}
      theme={isDark ? "vs-dark" : "vs-light"}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        fontSize: 13,
        wordWrap: "on",
        padding: { top: 8 },
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Template detail component
// ---------------------------------------------------------------------------

export interface TemplateDetailProps {
  template: TemplateDefinition;
  packageDetail: PackageDetail;
  moduleName: string;
}

export function TemplateDetail({
  template,
  packageDetail,
  moduleName,
}: TemplateDetailProps) {
  const navigate = useNavigate();
  const hasSource = !!template.sourceCode;
  const hasDecompiled = !!template.decompiledLF;
  const sourceText = template.sourceCode ?? template.decompiledLF ?? "";
  const templateQualified = `${moduleName}:${template.name}`;
  const packageName = packageDetail.packageName ?? packageDetail.packageId;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={FileCodeIcon} strokeWidth={2} className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">{template.name}</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Module: <span className="font-mono">{moduleName}</span>
          </span>
          <Separator orientation="vertical" className="h-3" />
          <span>
            Package:{" "}
            <span className="font-mono">
              {packageDetail.packageName ?? packageDetail.packageId}
            </span>
          </span>
          {packageDetail.packageVersion && (
            <>
              <Separator orientation="vertical" className="h-3" />
              <span>v{packageDetail.packageVersion}</span>
            </>
          )}
          <Separator orientation="vertical" className="h-3" />
          <button
            className="inline-flex items-center gap-1 text-primary hover:underline"
            onClick={() =>
              navigate({
                to: "/contracts",
                search: { template: templateQualified },
              } as any)
            }
          >
            View active contracts
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="fields" className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b px-6">
          <TabsList className="h-9">
            <TabsTrigger value="fields" className="gap-1 text-xs">
              <HugeiconsIcon icon={ListViewIcon} strokeWidth={2} className="size-3.5" />
              Fields
            </TabsTrigger>
            <TabsTrigger value="choices" className="gap-1 text-xs">
              <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="size-3.5" />
              Choices
              <Badge variant="secondary" className="ml-1 px-1 py-0 text-[9px]">
                {template.choices.length}
              </Badge>
            </TabsTrigger>
            {template.key && (
              <TabsTrigger value="key" className="gap-1 text-xs">
                <HugeiconsIcon icon={Key01Icon} strokeWidth={2} className="size-3.5" />
                Key
              </TabsTrigger>
            )}
            <TabsTrigger value="source" className="gap-1 text-xs">
              <HugeiconsIcon icon={CodeIcon} strokeWidth={2} className="size-3.5" />
              Source
            </TabsTrigger>
            {template.implements.length > 0 && (
              <TabsTrigger value="interfaces" className="gap-1 text-xs">
                <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-3.5" />
                Interfaces
                <Badge variant="secondary" className="ml-1 px-1 py-0 text-[9px]">
                  {template.implements.length}
                </Badge>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Fields tab */}
          <TabsContent value="fields" className="overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-4">
              {/* Signatory / Observer expressions */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Signatory Expression
                  </span>
                  {template.signatoryExpression === "<parsed from DALF>" ? (
                    <span className="rounded-md bg-muted px-2 py-1 text-xs italic text-muted-foreground">
                      Expression from Daml-LF
                    </span>
                  ) : (
                    <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                      {template.signatoryExpression}
                    </code>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Observer Expression
                  </span>
                  {template.observerExpression === "<parsed from DALF>" ? (
                    <span className="rounded-md bg-muted px-2 py-1 text-xs italic text-muted-foreground">
                      Expression from Daml-LF
                    </span>
                  ) : (
                    <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                      {template.observerExpression}
                    </code>
                  )}
                </div>
              </div>

              {template.ensureExpression && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Ensure Expression
                  </span>
                  {template.ensureExpression === "<parsed from DALF>" ? (
                    <span className="rounded-md bg-muted px-2 py-1 text-xs italic text-muted-foreground">
                      Expression from Daml-LF
                    </span>
                  ) : (
                    <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                      {template.ensureExpression}
                    </code>
                  )}
                </div>
              )}

              <Separator />

              {/* Fields table */}
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="h-9 text-xs">Field Name</TableHead>
                      <TableHead className="h-9 text-xs">Type</TableHead>
                      <TableHead className="h-9 text-xs">Required</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {template.fields.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="py-8 text-center text-sm text-muted-foreground italic"
                        >
                          Field definitions not yet available for Daml-LF 2.x packages
                        </TableCell>
                      </TableRow>
                    ) : (
                      template.fields.map((field) => (
                        <TableRow key={field.name}>
                          <TableCell className="py-2 font-mono text-xs font-medium">
                            {field.name}
                          </TableCell>
                          <TableCell className="py-2 font-mono text-xs text-primary">
                            {field.type}
                          </TableCell>
                          <TableCell className="py-2 text-xs">
                            {field.optional ? (
                              <Badge variant="outline" className="text-[9px]">
                                Optional
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[9px]">
                                Required
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          {/* Choices tab */}
          <TabsContent value="choices" className="overflow-y-auto px-6 py-4">
            {template.choices.length === 0 ? (
              <Empty>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No choices defined on this template</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-4">
                {template.choices.map((choice) => (
                  <ChoiceDetail
                    key={choice.name}
                    choice={choice}
                    sourceAvailable={packageDetail.hasSource}
                    templateQualified={templateQualified}
                    packageName={packageName}
                    allTemplateNames={packageDetail.modules.flatMap((m) =>
                      m.templates.map((t) => `${m.name}:${t.name}`)
                    )}
                    onNavigateToTemplate={(tq) =>
                      navigate({
                        to: "/templates",
                        search: { template: tq, package: packageName },
                      } as any)
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Key tab */}
          <TabsContent value="key" className="overflow-y-auto px-6 py-4">
            {template.key ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Key Type
                  </span>
                  <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-primary">
                    {template.key.type}
                  </code>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Key Expression
                  </span>
                  <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                    {template.key.expression}
                  </code>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Maintainer Expression
                  </span>
                  <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                    {template.key.maintainerExpression}
                  </code>
                </div>
              </div>
            ) : (
              <Empty>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={Key01Icon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>This template does not define a contract key</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </TabsContent>

          {/* Source tab */}
          <TabsContent value="source" className="flex flex-col px-6 py-4">
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex shrink-0 items-center gap-2">
                <Badge
                  variant={hasSource ? "default" : "secondary"}
                  className="text-xs"
                >
                  {hasSource
                    ? "Source Available"
                    : hasDecompiled
                      ? "Decompiled from Daml-LF"
                      : "No source available"}
                </Badge>
              </div>
              {sourceText ? (
                <div className="min-h-[400px] flex-1 overflow-hidden rounded-md border">
                  <LazyMonaco value={sourceText} language="haskell" />
                </div>
              ) : (
                <Empty>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={CodeIcon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>Source code is not available for this template</EmptyTitle>
                    <EmptyDescription>
                      Upload a DAR with sources to enable this feature.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </TabsContent>

          {/* Interfaces tab */}
          <TabsContent value="interfaces" className="overflow-y-auto px-6 py-4">
            {template.implements.length === 0 ? (
              <Empty>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>This template does not implement any interfaces</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Implemented Interfaces
                </span>
                <div className="flex flex-wrap gap-2">
                  {template.implements.map((iface) => (
                    <Badge
                      key={iface}
                      variant="outline"
                      className="font-mono text-xs"
                    >
                      {iface}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
