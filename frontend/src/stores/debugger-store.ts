import { create } from "zustand";
import type { SimulationResult, ExecutionTrace } from "@/lib/types";

// ---------------------------------------------------------------------------
// Command builder form state — in-memory only (no localStorage)
// ---------------------------------------------------------------------------

interface CommandFormState {
  packageId: string;
  template: string;
  choice: string;
  contractId: string;
  args: Record<string, unknown>;
  actingParties: string[];
  readAsParties: string[];
  mode: "online" | "offline";
  historicalOffset: string;
}

const DEFAULT_FORM: CommandFormState = {
  packageId: "",
  template: "",
  choice: "",
  contractId: "",
  args: {},
  actingParties: [],
  readAsParties: [],
  mode: "online",
  historicalOffset: "",
};

// ---------------------------------------------------------------------------
// Debugger store — no persistence, purely in-memory
// ---------------------------------------------------------------------------

interface DebuggerState {
  form: CommandFormState;
  setForm: (patch: Partial<CommandFormState>) => void;

  simResult: SimulationResult | null;
  setSimResult: (result: SimulationResult | null) => void;

  trace: ExecutionTrace | null;
  setTrace: (trace: ExecutionTrace | null) => void;

  activeTab: string;
  setActiveTab: (tab: string) => void;

  lastRequest: Record<string, unknown>;
  setLastRequest: (req: Record<string, unknown>) => void;

  reset: () => void;
}

export const useDebuggerStore = create<DebuggerState>((set) => ({
  form: { ...DEFAULT_FORM },
  setForm: (patch) =>
    set((state) => ({ form: { ...state.form, ...patch } })),

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
      form: { ...DEFAULT_FORM },
      simResult: null,
      trace: null,
      activeTab: "simulation",
      lastRequest: {},
    }),
}));
