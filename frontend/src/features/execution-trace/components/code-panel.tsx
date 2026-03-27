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
  // Dark: background oklch(0.205 0 0) ≈ #2b2b2b, foreground oklch(0.985 0 0) ≈ #fbfbfb
  // Light: background oklch(1 0 0) = #ffffff, foreground oklch(0.145 0 0) ≈ #1a1a1a
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
      "editor.background": "#2b2b2b",
      "editor.foreground": "#fbfbfb",
      "editorLineNumber.foreground": "#6b6b6b",
      "editorGutter.background": "#2b2b2b",
      "editor.lineHighlightBackground": "#2b2b2b",
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

  // On-demand decompiled source when backend didn't provide it
  const [decompiledSource, setDecompiledSource] = useState<string | null>(null);
  const [decompiledLoading, setDecompiledLoading] = useState(false);

  const effectiveSourceFiles = useMemo(() => {
    if (Object.keys(sourceFiles).length > 0) return sourceFiles;
    if (decompiledSource) return { "decompiled.daml": decompiledSource };
    return sourceFiles;
  }, [sourceFiles, decompiledSource]);

  // Fetch decompiled LF when source is not available
  const fetchDecompiled = useCallback(async () => {
    if (!packageId || decompiledLoading || decompiledSource) return;
    setDecompiledLoading(true);
    try {
      const res = await fetch(`/api/v1/packages/${encodeURIComponent(packageId)}/templates`);
      if (res.ok) {
        const data = await res.json();
        // Look for decompiledLF in any module/template
        const modules = data?.data?.modules ?? [];
        const lfParts: string[] = [];
        for (const mod of modules) {
          for (const tmpl of mod.templates ?? []) {
            if (tmpl.decompiledLF) {
              lfParts.push(`-- Template: ${mod.name}.${tmpl.name}\n${tmpl.decompiledLF}`);
            }
          }
        }
        if (lfParts.length > 0) {
          setDecompiledSource(lfParts.join("\n\n"));
        } else {
          setDecompiledSource("-- No decompiled Daml-LF available for this package");
        }
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

  // Update decorations when step changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (decorationsRef.current) {
      decorationsRef.current.clear();
    }

    if (variableDecorations.length > 0) {
      decorationsRef.current = editor.createDecorationsCollection(variableDecorations);
    }

    // Scroll to current line
    if (currentStep?.sourceLocation) {
      editor.revealLineInCenter(currentStep.sourceLocation.startLine);
    }
  }, [variableDecorations, currentStep]);

  const handleEditorMount = (
    editor: editor.IStandaloneCodeEditor,
    monaco: Monaco
  ) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerDamlLanguage(monaco);
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
          {currentFile || "Unknown file"}
        </span>
        <div className="ml-auto flex-shrink-0">
          {sourceAvailable ? (
            <Badge variant="secondary" className="text-[10px]">
              Source Available
            </Badge>
          ) : decompiledLoading ? (
            <Badge variant="outline" className="text-[10px]">
              <Spinner className="mr-1 size-3" />
              Loading decompiled source...
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              Decompiled from Daml-LF
            </Badge>
          )}
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
            minimap: { enabled: true },
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

      {/* Inject CSS for decorations */}
      <style>{`
        .execution-line-highlight {
          background-color: rgba(251, 191, 36, 0.15) !important;
          border-left: 3px solid rgb(245, 158, 11) !important;
        }
        .dark .execution-line-highlight {
          background-color: rgba(251, 191, 36, 0.08) !important;
        }
        .execution-line-glyph {
          background-color: rgb(245, 158, 11);
          border-radius: 50%;
          margin-left: 4px;
          width: 8px !important;
          height: 8px !important;
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
