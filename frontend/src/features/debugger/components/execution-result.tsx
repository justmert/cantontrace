import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tick02Icon,
  Cancel01Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { truncateId } from "@/lib/utils";
import type { ExecuteResult } from "@/lib/types";
import { SimpleTransactionTree, ContractCard } from "./simulation-result";

// ---------------------------------------------------------------------------
// Execution result view — shows committed transaction details
// ---------------------------------------------------------------------------

export function ExecutionResultView({
  result,
}: {
  result: ExecuteResult;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Status banner */}
      <div className="flex items-start gap-4">
        {result.success ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
            <HugeiconsIcon icon={Tick02Icon} className="size-5 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
          </div>
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <HugeiconsIcon icon={Cancel01Icon} className="size-5 text-destructive" strokeWidth={2} />
          </div>
        )}

        <div className="flex flex-col gap-1.5 min-w-0">
          <h3 className="text-sm font-semibold">
            {result.success ? "Transaction Committed" : "Execution Failed"}
          </h3>

          {/* Metadata grid */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {result.updateId && (
              <span className="flex items-center gap-1.5">
                Update ID:
                <span className="font-mono">{truncateId(result.updateId, 20)}</span>
                <CopyButton text={result.updateId} />
              </span>
            )}
            {result.completionOffset && (
              <span>
                Offset: <span className="font-mono">{result.completionOffset}</span>
              </span>
            )}
            {result.executedAt && (
              <span>
                Executed: <span className="font-mono">{result.executedAt}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error details */}
      {result.error && (
        <div className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={2} />
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-destructive">
                  {result.error.errorCodeId}
                </span>
                <Badge variant="outline" className="text-[11px] text-destructive/70">
                  {result.error.categoryId}
                </Badge>
              </div>
              <p className="text-xs text-destructive/80">{result.error.message}</p>
              {result.error.suggestedFixes && result.error.suggestedFixes.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {result.error.suggestedFixes.map((fix, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-muted-foreground/50">-</span>
                      {fix}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transaction tree + state diff */}
      {result.success && result.transactionTree && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Left: Transaction Tree */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Transaction Tree</CardTitle>
                {result.transactionTree.stateDiff && (
                  <span className="text-xs font-medium text-muted-foreground">
                    {result.transactionTree.stateDiff.netChange}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <SimpleTransactionTree transaction={result.transactionTree} />
            </CardContent>
          </Card>

          {/* Right: State Diff */}
          <div className="flex flex-col gap-3">
            {/* Inputs consumed */}
            {(() => {
              const inputs =
                result.transactionTree?.stateDiff?.inputs ??
                result.inputContracts?.map((ic) => ic.contract) ??
                [];
              if (inputs.length === 0) return null;
              return (
                <Card>
                  <CardHeader className="py-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      Inputs Consumed ({inputs.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-col gap-2">
                      {inputs.map((c) => (
                        <ContractCard
                          key={c.contractId}
                          contract={c}
                          label="Input"
                          variant="input"
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Outputs created */}
            {(() => {
              const outputs = result.transactionTree?.stateDiff?.outputs ?? [];
              if (outputs.length === 0) return null;
              return (
                <Card>
                  <CardHeader className="py-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      Outputs Created ({outputs.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-col gap-2">
                      {outputs.map((c) => (
                        <ContractCard
                          key={c.contractId}
                          contract={c}
                          label="Output"
                          variant="output"
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        </div>
      )}

      {/* Failed tree only */}
      {!result.success && result.transactionTree && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Transaction Tree</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleTransactionTree transaction={result.transactionTree} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
