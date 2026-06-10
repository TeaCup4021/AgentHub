import { create } from "zustand";

export type Theme = "light" | "dark" | "system";
export type BgColor = "#ECEDEE" | "#E6F1F4" | "#DCE5F7" | "#4872AD";

function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem("agenthub-theme");
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch { /* not available */ }
  return "system";
}

function loadBgColor(): BgColor {
  try {
    const saved = localStorage.getItem("agenthub-bgcolor");
    if (saved === "#ECEDEE" || saved === "#E6F1F4" || saved === "#DCE5F7" || saved === "#4872AD") return saved;
  } catch { /* */ }
  return "#DCE5F7";
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
  bgColor: BgColor;
  settingsOpen: boolean;
  newConvTrigger: number;
  manageAgentsOpen: boolean;
  selectedProjectId: string | null;

  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  openPreview: () => void;
  closePreview: () => void;
  setTheme: (theme: Theme) => void;
  setBgColor: (color: BgColor) => void;
  setSettingsOpen: (open: boolean) => void;
  triggerNewConv: () => void;
  resetNewConvTrigger: () => void;
  setManageAgentsOpen: (open: boolean) => void;
  setSelectedProjectId: (id: string | null) => void;
}

function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function loadSelectedProjectId(): string | null {
  try {
    const id = localStorage.getItem("agenthub-project-id");
    if (id && isValidUuid(id)) return id;
    localStorage.removeItem("agenthub-project-id");
    return null;
  } catch { return null; }
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
  bgColor: loadBgColor(),
  settingsOpen: false,
  newConvTrigger: 0,
  manageAgentsOpen: false,
  selectedProjectId: loadSelectedProjectId(),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  openPreview: () => set({ previewPanelOpen: true }),
  closePreview: () => set({ previewPanelOpen: false }),
  setTheme: (theme) => {
    persistTheme(theme);
    set({ theme });
  },
  setBgColor: (color) => {
    try { localStorage.setItem("agenthub-bgcolor", color); } catch { /* */ }
    set({ bgColor: color });
  },
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  triggerNewConv: () => set((s) => ({ newConvTrigger: s.newConvTrigger + 1 })),
  resetNewConvTrigger: () => set({ newConvTrigger: 0 }),
  setManageAgentsOpen: (open) => set({ manageAgentsOpen: open }),
  setSelectedProjectId: (id) => {
    try {
      if (id) localStorage.setItem("agenthub-project-id", id);
      else localStorage.removeItem("agenthub-project-id");
    } catch { /* */ }
    set({ selectedProjectId: id });
  },
}));
