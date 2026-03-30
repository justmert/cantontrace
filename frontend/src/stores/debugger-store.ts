import { create } from "zustand";
import type { SimulationResult, ExecutionTrace } from "@/lib/types";

interface DebuggerState {
  // Simulation results
  simResult: SimulationResult | null;
  setSimResult: (result: SimulationResult | null) => void;

  // Trace results
  trace: ExecutionTrace | null;
  setTrace: (trace: ExecutionTrace | null) => void;

  // Active tab
  activeTab: string;
  setActiveTab: (tab: string) => void;

  // Last request params (to show in collapsed state)
  lastRequest: Record<string, unknown>;
  setLastRequest: (req: Record<string, unknown>) => void;

  // Reset everything
  reset: () => void;
}

export const useDebuggerStore = create<DebuggerState>((set) => ({
  simResult: null,
  setSimResult: (simResult) => set({ simResult }),

  trace: null,
  setTrace: (trace) => set({ trace }),

  activeTab: "simulation",
  setActiveTab: (activeTab) => set({ activeTab }),

  lastRequest: {},
  setLastRequest: (lastRequest) => set({ lastRequest }),

  reset: () =>
    set({
      simResult: null,
      trace: null,
      activeTab: "simulation",
      lastRequest: {},
    }),
}));
