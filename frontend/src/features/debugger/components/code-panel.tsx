import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { TraceStep } from "@/lib/types";
import { VariableInspector } from "./variable-inspector";

// ---------------------------------------------------------------------------
// Daml language definition for Monaco
// ---------------------------------------------------------------------------

function registerDamlLanguage(monaco: Monaco) {
  // Only register once
  if (monaco.languages.getLanguages().some((l) => l.id === "daml")) return;

  monaco.languages.register({ id: "daml" });

  monaco.languages.setMonarchTokensProvider("daml", {
    keywords: [
      "module",
      "where",
      "import",
      "template",
      "with",
      "signatory",
      "observer",
      "ensure",
      "agreement",
      "controller",
      "can",
      "choice",
      "do",
      "return",
      "let",
      "in",
      "if",
      "then",
      "else",
      "case",
      "of",
      "type",
      "data",
      "class",
      "instance",
      "deriving",
      "this",
      "self",
      "create",
      "exercise",
      "exerciseByKey",
      "fetch",
      "fetchByKey",
      "lookupByKey",
      "archive",
      "abort",
      "assert",
      "forA",
      "forA_",
      "mapA",
      "pure",
      "interface",
      "key",
      "maintainer",
      "nonconsuming",
      "preconsuming",
      "postconsuming",
    ],
    typeKeywords: [
      "Party",
      "ContractId",
      "Text",
      "Int",
      "Decimal",
      "Bool",
      "Date",
      "Time",
      "Optional",
      "List",
      "Map",
      "Update",
      "Scenario",
      "Either",
      "DA",
    ],
    operators: [
      "=",
      "->",
      "<-",
      "=>",
      "::",
      "..",
      "|",
      "\\",
      "@",
      "~",
      "++",
      "==",
      "/=",
      "<=",
      ">=",
      "&&",
      "||",
      ">>",
      ">>=",
      "<$>",
      "<*>",
    ],
    symbols: /[=><!~?:&|+\-*/^%]+/,
    tokenizer: {
      root: [
        [
          /[a-z_$][\w$']*/,
          {
            cases: {
              "@keywords": "keyword",
              "@default": "identifier",
            },
          },
        ],
        [
          /[A-Z][\w$']*/,
          {
            cases: {
              "@typeKeywords": "type.identifier",
              "@default": "type.identifier",
            },
          },
        ],
        { include: "@whitespace" },
        [/[{}()\[\]]/, "@brackets"],
        [
          /@symbols/,
          {
            cases: {
              "@operators": "operator",
              "@default": "",
            },
          },
        ],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@string"],
        [/\d+/, "number"],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
      whitespace: [
        [/[ \t\r\n]+/, "white"],
        [/--.*$/, "comment"],
        [/{-/, "comment", "@comment"],
      ],
      comment: [
        [/[^{}-]+/, "comment"],
        [/{-/, "comment", "@push"],
        [/-}/, "comment", "@pop"],
        [/[{}-]/, "comment"],
      ],
    },
  });

  // Theme contributions for Daml — colours aligned to the app's oklch palette.
  // Dark: bg oklch(0.13) ≈ #1f1f1f, card oklch(0.17) ≈ #272727
  // Light: bg oklch(0.995) ≈ #fefefe
  monaco.editor.defineTheme("daml-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "c586c0" },
      { token: "type.identifier", foreground: "4ec9b0" },
      { token: "string", foreground: "ce9178" },
      { token: "number", foreground: "b5cea8" },
      { token: "comment", foreground: "6a9955" },
      { token: "operator", foreground: "d4d4d4" },
    ],
    colors: {
      "editor.background": "#1f1f1f",
      "editor.foreground": "#e0e0e0",
      "editorLineNumber.foreground": "#4a4a4a",
      "editorGutter.background": "#1f1f1f",
      "editor.lineHighlightBackground": "#262626",
    },
  });

  monaco.editor.defineTheme("daml-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "af00db" },
      { token: "type.identifier", foreground: "267f99" },
      { token: "string", foreground: "a31515" },
      { token: "number", foreground: "098658" },
      { token: "comment", foreground: "008000" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#1a1a1a",
      "editorLineNumber.foreground": "#8a8a8a",
      "editorGutter.background": "#ffffff",
      "editor.lineHighlightBackground": "#ffffff",
    },
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CodePanelProps {
  sourceFiles: Record<string, string>;
  sourceAvailable: boolean;
  currentStep: TraceStep | null;
  variables: Record<string, unknown>;
  previousVariables?: Record<string, unknown>;
  /** Package ID for the traced template — used to fetch decompiled LF on demand */
  packageId?: string;
}

export function CodePanel({
  sourceFiles,
  sourceAvailable,
  currentStep,
  variables,
  previousVariables,
  packageId,
}: CodePanelProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null);

  // Incremented when the editor mounts so decoration effects re-run
  const [editorMountKey, setEditorMountKey] = useState(0);

  // On-demand decompiled source when backend didn't provide it
  const [decompiledSource, setDecompiledSource] = useState<string | null>(null);
  const [decompiledLoading, setDecompiledLoading] = useState(false);

  const effectiveSourceFiles = useMemo(() => {
    if (Object.keys(sourceFiles).length > 0) return sourceFiles;
    if (decompiledSource) return { "decompiled.daml": decompiledSource };
    return sourceFiles;
  }, [sourceFiles, decompiledSource]);

  // Extract the traced template name from trace steps
  const tracedTemplateName = useMemo(() => {
    if (!currentStep) return undefined;
    // Look for templateId in step context or summary
    const ctx = currentStep.context;
    if (ctx.templateId) {
      const tid = ctx.templateId;
      return typeof tid === "string" ? tid.split(":").pop() : (tid as { entityName?: string }).entityName;
    }
    // Parse from summary (e.g., "Exercise Transfer on cantontrace-test:Main:SimpleToken")
    const match = currentStep.summary.match(/:(\w+)$/);
    return match?.[1];
  }, [currentStep]);

  // Fetch decompiled LF — only the traced template, not the entire package
  const fetchDecompiled = useCallback(async () => {
    if (!packageId || decompiledLoading || decompiledSource) return;
    setDecompiledLoading(true);
    try {
      const res = await fetch(`/api/v1/packages/${encodeURIComponent(packageId)}/templates`);
      if (res.ok) {
        const data = await res.json();
        const modules = data?.data?.modules ?? [];

        // Try to find the specific traced template first
        if (tracedTemplateName) {
          for (const mod of modules) {
            for (const tmpl of mod.templates ?? []) {
              if (tmpl.name === tracedTemplateName && tmpl.decompiledLF) {
                setDecompiledSource(`-- Decompiled: ${mod.name}.${tmpl.name}\n\n${tmpl.decompiledLF}`);
                setDecompiledLoading(false);
                return;
              }
            }
          }
        }

        // Fallback: show first template with decompiled source
        for (const mod of modules) {
          for (const tmpl of mod.templates ?? []) {
            if (tmpl.decompiledLF) {
              setDecompiledSource(`-- Decompiled: ${mod.name}.${tmpl.name}\n\n${tmpl.decompiledLF}`);
              setDecompiledLoading(false);
              return;
            }
          }
        }

        setDecompiledSource("-- No decompiled Daml-LF available for this package");
      }
    } catch {
      setDecompiledSource("-- Failed to fetch decompiled source");
    } finally {
      setDecompiledLoading(false);
    }
  }, [packageId, decompiledLoading, decompiledSource]);

  // Auto-fetch when source is empty and we have a packageId
  useEffect(() => {
    if (
      currentStep &&
      Object.keys(sourceFiles).length === 0 &&
      !sourceAvailable &&
      packageId &&
      !decompiledSource &&
      !decompiledLoading
    ) {
      fetchDecompiled();
    }
  }, [currentStep, sourceFiles, sourceAvailable, packageId, decompiledSource, decompiledLoading, fetchDecompiled]);

  // Determine current file and content.
  // If the step has a sourceLocation.file that matches a key in effectiveSourceFiles, use it.
  // Otherwise fall back to the first available source file (typically the decompiled one).
  const fileNames = Object.keys(effectiveSourceFiles);
  const locFile = currentStep?.sourceLocation?.file ?? "";
  const currentFile = effectiveSourceFiles[locFile]
    ? locFile
    : fileNames.length > 0
    ? fileNames[0]!
    : "";
  const sourceContent = effectiveSourceFiles[currentFile] ?? "";
  const hasSource = !!sourceContent;

  // Detect dark mode from document, reactively via MutationObserver
  const [isDark, setIsDark] = useState(
    typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Build inline variable decorations
  // Note: we intentionally do NOT check editorRef.current here -- refs don't
  // trigger useMemo recalculation.  The consuming useEffect guards on the ref.
  const variableDecorations = useMemo(() => {
    if (!currentStep?.sourceLocation) return [];

    const decorations: editor.IModelDeltaDecoration[] = [];
    const loc = currentStep.sourceLocation;

    // Highlight current execution line
    decorations.push({
      range: {
        startLineNumber: loc.startLine,
        startColumn: 1,
        endLineNumber: loc.endLine,
        endColumn: 1000,
      },
      options: {
        isWholeLine: true,
        className: "execution-line-highlight",
        glyphMarginClassName: "execution-line-glyph",
      },
    });

    // Add inline variable annotations
    const entries = Object.entries(variables);
    entries.forEach(([name, value], idx) => {
      const changed =
        previousVariables &&
        JSON.stringify(previousVariables[name]) !== JSON.stringify(value);

      const displayValue =
        typeof value === "string"
          ? `"${value}"`
          : typeof value === "object"
          ? JSON.stringify(value).slice(0, 60)
          : String(value);

      decorations.push({
        range: {
          startLineNumber: loc.startLine + idx,
          startColumn: 1000,
          endLineNumber: loc.startLine + idx,
          endColumn: 1000,
        },
        options: {
          after: {
            content: `  // ${name} = ${displayValue}`,
            inlineClassName: changed
              ? "variable-annotation-changed"
              : "variable-annotation",
          },
        },
      });
    });

    return decorations;
  }, [currentStep, variables, previousVariables]);

  // Update decorations when step changes or editor mounts
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;

    if (decorationsRef.current) {
      decorationsRef.current.clear();
    }

    if (variableDecorations.length > 0) {
      decorationsRef.current = ed.createDecorationsCollection(variableDecorations);
    }

    // Scroll to current line and briefly flash the range for visibility
    if (currentStep?.sourceLocation) {
      const loc = currentStep.sourceLocation;
      ed.revealLineInCenter(loc.startLine);
      // Also set the cursor so the user has a clear focus point
      ed.setPosition({ lineNumber: loc.startLine, column: loc.startCol || 1 });
    }
  }, [variableDecorations, currentStep, editorMountKey]);

  const handleEditorMount = (
    ed: editor.IStandaloneCodeEditor,
    monaco: Monaco
  ) => {
    editorRef.current = ed;
    monacoRef.current = monaco;
    registerDamlLanguage(monaco);
    // Bump mount key so the decoration useEffect re-runs now that the ref is set
    setEditorMountKey((k) => k + 1);
  };

  // Variable inspector collapse state
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const hasVariables = Object.keys(variables).length > 0;

  // Placeholder state
  if (!currentStep) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            Source Code
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="text-4xl text-muted-foreground/20">{"{ }"}</div>
          <p className="text-sm text-muted-foreground">
            Run a trace to see the execution code
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        <span className="truncate font-mono text-xs text-foreground">
          {currentFile || (decompiledLoading ? "Loading..." : packageId ? "Decompiled source" : "No source")}
        </span>
        <div className="ml-auto flex-shrink-0">
          {sourceAvailable ? (
            <Badge variant="secondary" className="text-xs">
              Source Available
            </Badge>
          ) : decompiledLoading ? (
            <Badge variant="outline" className="text-xs">
              <Spinner className="mr-1 size-3" />
              Loading...
            </Badge>
          ) : decompiledSource ? (
            <Badge variant="outline" className="text-xs">
              Decompiled from Daml-LF
            </Badge>
          ) : packageId ? (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              No source found
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 bg-card" style={{ minHeight: 0 }}>
        <Editor
          height="100%"
          language="daml"
          theme={isDark ? "daml-dark" : "daml-light"}
          value={
            hasSource
              ? sourceContent
              : decompiledLoading
              ? "-- Loading decompiled Daml-LF source..."
              : "-- Source code not available. Decompiled LF could not be loaded."
          }
          options={{
            readOnly: true,
            minimap: { enabled: false },
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            renderLineHighlight: "none",
            occurrencesHighlight: "off",
            selectionHighlight: false,
            wordWrap: "off",
            glyphMargin: true,
            folding: true,
            automaticLayout: true,
          }}
          beforeMount={(monaco) => registerDamlLanguage(monaco)}
          onMount={handleEditorMount}
        />
      </div>

      {/* Variable Inspector (collapsible) */}
      {hasVariables && (
        <div className="flex flex-col border-t border-border bg-card">
          <button
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
            onClick={() => setInspectorOpen(!inspectorOpen)}
          >
            {inspectorOpen ? (
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-3" strokeWidth={2} />
            ) : (
              <HugeiconsIcon icon={ArrowUp01Icon} className="size-3" strokeWidth={2} />
            )}
            Variables ({Object.keys(variables).length})
          </button>
          {inspectorOpen && (
            <VariableInspector
              variables={variables}
              previousVariables={previousVariables}
            />
          )}
        </div>
      )}

      {/* Inject CSS for decorations — these classes are applied by Monaco
          to its own DOM elements which live in the same document tree. */}
      <style>{`
        .execution-line-highlight {
          background-color: rgba(251, 191, 36, 0.18) !important;
          border-left: 3px solid rgb(245, 158, 11) !important;
        }
        .dark .execution-line-highlight {
          background-color: rgba(251, 191, 36, 0.10) !important;
          border-left: 3px solid rgb(251, 191, 36) !important;
        }
        .execution-line-glyph {
          background-color: rgb(245, 158, 11);
          border-radius: 50%;
          margin-left: 4px;
          width: 8px !important;
          height: 8px !important;
        }
        .dark .execution-line-glyph {
          background-color: rgb(251, 191, 36);
        }
        .variable-annotation {
          color: rgba(156, 163, 175, 0.7);
          font-style: italic;
          font-size: 12px;
        }
        .variable-annotation-changed {
          color: rgb(217, 119, 6);
          font-style: italic;
          font-size: 12px;
          font-weight: 600;
        }
        .dark .variable-annotation-changed {
          color: rgb(251, 191, 36);
        }
      `}</style>
    </div>
  );
}
