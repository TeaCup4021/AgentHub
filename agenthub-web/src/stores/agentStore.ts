import { create } from "zustand";

interface AgentUIState {
  selectedAgentIds: string[];
  toggleSelectedAgent: (id: string) => void;
  setSelectedAgents: (ids: string[]) => void;
}

export const useAgentStore = create<AgentUIState>((set) => ({
  selectedAgentIds: [],
  toggleSelectedAgent: (id) =>
    set((s) => ({
      selectedAgentIds: s.selectedAgentIds.includes(id)
        ? s.selectedAgentIds.filter((a) => a !== id)
        : [...s.selectedAgentIds, id],
    })),
  setSelectedAgents: (ids) => set({ selectedAgentIds: ids }),
}));
