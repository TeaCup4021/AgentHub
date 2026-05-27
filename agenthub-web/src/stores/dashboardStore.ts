import { create } from "zustand";
import type { AgentProgress } from "@/components/chat/AgentProgressBar";

interface DashboardState {
  dashboardOpen: boolean;
  setDashboardOpen: (open: boolean) => void;
  toggleDashboard: () => void;

  agentStatuses: AgentProgress[];
  updateAgentStatus: (status: AgentProgress) => void;
  clearStatuses: () => void;
  allDone: () => boolean;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboardOpen: false,
  setDashboardOpen: (open) => set({ dashboardOpen: open }),
  toggleDashboard: () => set((s) => ({ dashboardOpen: !s.dashboardOpen })),

  agentStatuses: [],
  updateAgentStatus: (status) =>
    set((s) => {
      const idx = s.agentStatuses.findIndex((a) => a.agentId === status.agentId);
      if (idx >= 0) {
        const updated = [...s.agentStatuses];
        updated[idx] = status;
        return { agentStatuses: updated };
      }
      return { agentStatuses: [...s.agentStatuses, status] };
    }),
  clearStatuses: () => set({ agentStatuses: [], dashboardOpen: false }),
  allDone: () =>
    get().agentStatuses.every(
      (a) => a.status === "success" || a.status === "failed" || a.status === "timeout",
    ),
}));