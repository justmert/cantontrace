import { create } from "zustand";

interface ACSFilterState {
  selectedTemplate: string;
  selectedParty: string;
  searchContractId: string;

  setSelectedTemplate: (value: string) => void;
  setSelectedParty: (value: string) => void;
  setSearchContractId: (value: string) => void;
  clearFilters: () => void;
}

export const useACSFilterStore = create<ACSFilterState>((set) => ({
  selectedTemplate: "__all__",
  selectedParty: "__all__",
  searchContractId: "",

  setSelectedTemplate: (value: string) => set({ selectedTemplate: value }),
  setSelectedParty: (value: string) => set({ selectedParty: value }),
  setSearchContractId: (value: string) => set({ searchContractId: value }),
  clearFilters: () =>
    set({
      selectedTemplate: "__all__",
      selectedParty: "__all__",
      searchContractId: "",
    }),
}));
