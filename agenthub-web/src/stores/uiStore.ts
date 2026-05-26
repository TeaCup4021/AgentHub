import { create } from "zustand";

export type Theme = "light" | "dark" | "system";

function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem("agenthub-theme");
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch { /* not available */ }
  return "system";
}

function persistTheme(theme: Theme) {
  try {
    localStorage.setItem("agenthub-theme", theme);
  } catch { /* not available */ }
}

interface UIState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  previewPanelOpen: boolean;
  theme: Theme;

  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  openPreview: () => void;
  closePreview: () => void;
  setTheme: (theme: Theme) => void;
}

function loadSidebarWidth(): number {
  try {
    const saved = localStorage.getItem("agenthub-conv-width");
    if (saved) {
      const n = parseInt(saved, 10);
      if (n >= 200 && n <= 500) return n;
    }
  } catch { /* */ }
  return 260;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  sidebarWidth: loadSidebarWidth(),
  previewPanelOpen: false,
  theme: loadTheme(),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  openPreview: () => set({ previewPanelOpen: true }),
  closePreview: () => set({ previewPanelOpen: false }),
  setTheme: (theme) => {
    persistTheme(theme);
    set({ theme });
  },
}));
