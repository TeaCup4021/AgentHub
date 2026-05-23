import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  previewPanelOpen: boolean;
  theme: "light" | "dark";

  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  openPreview: () => void;
  closePreview: () => void;
  toggleTheme: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  sidebarWidth: 320,
  previewPanelOpen: false,
  theme: "light",

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  openPreview: () => set({ previewPanelOpen: true }),
  closePreview: () => set({ previewPanelOpen: false }),
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
}));
