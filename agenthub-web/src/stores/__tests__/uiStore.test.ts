import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "../uiStore";

describe("useUIStore — 主题", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("setTheme 应更新状态并持久化到 localStorage", () => {
    useUIStore.getState().setTheme("dark");
    expect(useUIStore.getState().theme).toBe("dark");
    expect(localStorage.getItem("agenthub-theme")).toBe("dark");
  });

  it("setBgColor 应更新并持久化", () => {
    useUIStore.getState().setBgColor("#4872AD");
    expect(useUIStore.getState().bgColor).toBe("#4872AD");
    expect(localStorage.getItem("agenthub-bgcolor")).toBe("#4872AD");
  });
});

describe("useUIStore — 侧边栏", () => {
  it("toggleSidebar 应切换开/关", () => {
    const initial = useUIStore.getState().sidebarOpen;
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(!initial);
  });

  it("triggerNewConv 应递增 newConvTrigger", () => {
    const before = useUIStore.getState().newConvTrigger;
    useUIStore.getState().triggerNewConv();
    expect(useUIStore.getState().newConvTrigger).toBe(before + 1);
  });
});
