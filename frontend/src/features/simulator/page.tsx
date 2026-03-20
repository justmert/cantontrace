import { useState, useCallback, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  TestTube01Icon,
  AlertCircleIcon,
  LockIcon,
} from "@hugeicons/core-free-icons";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { SimulationRequest, SimulationResult } from "@/lib/types";
import { ApiRequestError } from "@/lib/api";
import { CommandBuilder } from "./components/command-builder";
import { SimulationResultView } from "./components/simulation-result";
import { WhatIfPanel } from "./components/what-if-panel";
import { useSimulation } from "./hooks";

export default function SimulatorPage() {
  const simulation = useSimulation();

  // Read URL query params to pre-fill the command builder when arriving
  // from e.g. ACS Inspector's "Use in Simulation" link.
  const urlInitialValues = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const contractId = params.get("contractId") ?? undefined;
    const template = params.get("template") ?? undefined;
    if (!contractId && !template) return undefined;
    return { contractId, template };
  }, []);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [lastRequest, setLastRequest] = useState<
    Partial<{
      packageId: string;
      template: string;
      choice: string;
      contractId: string;
      args: Record<string, unknown>;
      actAs: string;
      readAs: string;
      mode: "online" | "offline";
      offset: string;
    }>
  >({});

  const handleSimulate = useCallback(
    (request: SimulationRequest) => {
      const cmd = request.commands[0];
      setLastRequest({
        packageId: cmd?.templateId.packageName ?? "",
        template: cmd?.templateId.entityName,
        choice: cmd?.choice ?? "",
        contractId: cmd?.contractId ?? "",
        args: cmd?.arguments ?? {},
        actAs: request.actAs.join(", "),
        readAs: request.readAs.join(", "),
        mode: request.mode,
        offset: request.historicalOffset ?? "",
      });

      simulation.mutate(request, {
        onSuccess: (data) => {
          setResult(data);
        },
      });
    },
    [simulation]
  );

  return (
    <div className="flex-1 p-6">
      <div className="flex flex-col gap-6">
        {/* Page header with mode toggle */}
        <div>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
              <HugeiconsIcon
                icon={TestTube01Icon}
                className="size-5 text-foreground"
                strokeWidth={2}
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Transaction Simulator
              </h1>
              <p className="text-muted-foreground">
                Predict transaction outcomes before submitting to the ledger
              </p>
            </div>
          </div>
        </div>

        {/* Command builder card */}
        <CommandBuilder
          onSimulate={handleSimulate}
          isSimulating={simulation.isPending}
          initialValues={urlInitialValues}
        />

        {/* Error display */}
        {simulation.isError &&
          (() => {
            const err = simulation.error;
            const isAuthError =
              err instanceof ApiRequestError &&
              (err.status === 401 || err.status === 403);
            const isNetworkError =
              err instanceof ApiRequestError && err.status >= 500;

            return (
              <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4">
                <HugeiconsIcon
                  icon={isAuthError ? LockIcon : AlertCircleIcon}
                  className="mt-0.5 size-5 flex-shrink-0 text-destructive"
                  strokeWidth={2}
                />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-destructive">
                    {isAuthError
                      ? "Authentication / Authorization Error"
                      : isNetworkError
                        ? "Server Error"
                        : "Simulation Request Failed"}
                  </span>
                  <p className="text-sm text-destructive/80">
                    {err?.message ?? "An unknown error occurred"}
                  </p>
                  {isAuthError && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Check your connection and ensure your user has the required
                      CanActAs or CanReadAs rights for the specified parties.
                    </p>
                  )}
                  {isNetworkError && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      The API gateway or engine service may be unavailable.
                      Check your connection settings.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

        {/* Loading state */}
        {simulation.isPending && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border bg-muted/20 py-16 text-center">
            <Spinner className="size-8" />
            <p className="text-sm text-muted-foreground">
              Running simulation...
            </p>
          </div>
        )}

        {/* Results section */}
        {result && !simulation.isPending && (
          <>
            <Separator />
            <SimulationResultView result={result} />
          </>
        )}

        {/* What-if comparison panel */}
        {result && !simulation.isPending && (
          <>
            <Separator />
            <WhatIfPanel
              originalResult={result}
              initialRequest={lastRequest}
            />
          </>
        )}
      </div>
    </div>
  );
}
