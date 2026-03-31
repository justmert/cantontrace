import { create } from "zustand";
import type { SimulationResult, ExecutionTrace } from "@/lib/types";

// ---------------------------------------------------------------------------
// Command builder form state — persisted to localStorage
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

const FORM_STORAGE_KEY = "cantontrace-debugger-form";

function loadFormState(): CommandFormState {
  try {
    const raw = localStorage.getItem(FORM_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
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
}

function saveFormState(state: CommandFormState) {
  try {
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Debugger store
// ---------------------------------------------------------------------------

interface DebuggerState {
  // Command builder form (persisted)
  form: CommandFormState;
  setForm: (patch: Partial<CommandFormState>) => void;

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
  form: loadFormState(),
  setForm: (patch) =>
    set((state) => {
      const next = { ...state.form, ...patch };
      saveFormState(next);
      return { form: next };
    }),

  simResult: null,
  setSimResult: (simResult) => set({ simResult }),

  trace: null,
  setTrace: (trace) => set({ trace }),

  activeTab: "simulation",
  setActiveTab: (activeTab) => set({ activeTab }),

  lastRequest: {},
  setLastRequest: (lastRequest) => set({ lastRequest }),

  reset: () => {
    try { localStorage.removeItem(FORM_STORAGE_KEY); } catch { /* ignore */ }
    set({
      form: {
        packageId: "",
        template: "",
        choice: "",
        contractId: "",
        args: {},
        actingParties: [],
        readAsParties: [],
        mode: "online",
        historicalOffset: "",
      },
      simResult: null,
      trace: null,
      activeTab: "simulation",
      lastRequest: {},
    });
  },
}));
