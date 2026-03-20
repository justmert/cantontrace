import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TraceRequest, ExecutionTrace } from "@/lib/types";

// ---------------------------------------------------------------------------
// Trace mutation hook
// ---------------------------------------------------------------------------

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
