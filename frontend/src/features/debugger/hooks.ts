import { useCallback, useState } from "react";
import { useMutation, useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  SimulationRequest,
  SimulationResult,
  TraceRequest,
  ExecutionTrace,
} from "@/lib/types";

// ===========================================================================
// Simulation
// ===========================================================================

export function useSimulation() {
  return useMutation<SimulationResult, Error, SimulationRequest>({
    mutationFn: (request) => api.simulate(request).then((r) => r.data),
  });
}

// ---------------------------------------------------------------------------
// ACS-based contract autocomplete
// ---------------------------------------------------------------------------

export function useContractAutocomplete(query: string) {
  // The ACS API does not support text search. We fetch a page of contracts
  // and filter client-side. The query key includes a debounced "enabled" flag
  // but not the query itself, to avoid redundant fetches per keystroke.
  return useQuery({
    queryKey: ["acs-autocomplete"],
    queryFn: () =>
      api.getACS({
        pageSize: 50,
      }).then((r) => r.data),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    select: (data) => ({
      ...data,
      contracts: data.contracts.filter(
        (c) =>
          c.contractId.toLowerCase().includes(query.toLowerCase()) ||
          c.templateId.entityName.toLowerCase().includes(query.toLowerCase())
      ),
    }),
  });
}

// ---------------------------------------------------------------------------
// Known parties from bootstrap (for party selectors)
// ---------------------------------------------------------------------------

export function useKnownParties() {
  return useQuery({
    queryKey: ["bootstrap-parties"],
    queryFn: () => api.getBootstrap().then((r) => r.data.knownParties),
    staleTime: 5 * 60 * 1000,
  });
}

// ===========================================================================
// Execution Trace
// ===========================================================================

export function useTrace() {
  return useMutation<ExecutionTrace, Error, TraceRequest>({
    mutationFn: (request) => api.trace(request).then((r) => r.data),
  });
}

// ---------------------------------------------------------------------------
// Step navigation state
// ---------------------------------------------------------------------------

export interface TraceNavigation {
  currentStep: number;
  totalSteps: number;
  setStep: (step: number) => void;
  stepForward: () => void;
  stepBack: () => void;
  runToFailure: (steps: { passed: boolean }[]) => void;
  runToEnd: () => void;
  reset: () => void;
  isAtStart: boolean;
  isAtEnd: boolean;
}

export function useTraceNavigation(totalSteps: number): TraceNavigation {
  const [currentStep, setCurrentStep] = useState(0);

  const clamp = useCallback(
    (n: number) => Math.max(0, Math.min(n, totalSteps - 1)),
    [totalSteps]
  );

  const setStep = useCallback(
    (step: number) => setCurrentStep(clamp(step)),
    [clamp]
  );

  const stepForward = useCallback(
    () => setCurrentStep((prev) => clamp(prev + 1)),
    [clamp]
  );

  const stepBack = useCallback(
    () => setCurrentStep((prev) => clamp(prev - 1)),
    [clamp]
  );

  const runToFailure = useCallback(
    (steps: { passed: boolean }[]) => {
      const failIdx = steps.findIndex((s) => !s.passed);
      if (failIdx >= 0) {
        setCurrentStep(failIdx);
      }
    },
    []
  );

  const runToEnd = useCallback(
    () => setCurrentStep(Math.max(0, totalSteps - 1)),
    [totalSteps]
  );

  const reset = useCallback(() => setCurrentStep(0), []);

  return {
    currentStep,
    totalSteps,
    setStep,
    stepForward,
    stepBack,
    runToFailure,
    runToEnd,
    reset,
    isAtStart: currentStep === 0,
    isAtEnd: currentStep >= totalSteps - 1,
  };
}
