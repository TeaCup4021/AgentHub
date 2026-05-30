import { describe, it, expect, beforeEach } from "vitest";
import { useDashboardStore } from "../dashboardStore";

describe("useDashboardStore", () => {
  beforeEach(() => {
    useDashboardStore.setState({ dashboardOpen: false, agentStatuses: [] });
  });

  it("updateAgentStatus — 新 Agent 应追加", () => {
    useDashboardStore.getState().updateAgentStatus({
      agentId: "a1", agentName: "Claude", status: "running", progress: 50,
    });
    expect(useDashboardStore.getState().agentStatuses).toHaveLength(1);
  });

  it("updateAgentStatus — 已有 Agent 应原地更新", () => {
    useDashboardStore.getState().updateAgentStatus({
      agentId: "a1", agentName: "Claude", status: "queued", progress: 0,
    });
    useDashboardStore.getState().updateAgentStatus({
      agentId: "a1", agentName: "Claude", status: "running", progress: 50,
    });
    const statuses = useDashboardStore.getState().agentStatuses;
    expect(statuses).toHaveLength(1);
    expect(statuses[0].status).toBe("running");
    expect(statuses[0].progress).toBe(50);
  });

  it("allDone — 全部 success/failed 时应返回 true", () => {
    useDashboardStore.getState().updateAgentStatus({
      agentId: "a1", agentName: "A", status: "success", progress: 100,
    });
    expect(useDashboardStore.getState().allDone()).toBe(true);
  });

  it("allDone — 有 running 时应返回 false", () => {
    useDashboardStore.getState().updateAgentStatus({
      agentId: "a1", agentName: "A", status: "running", progress: 50,
    });
    expect(useDashboardStore.getState().allDone()).toBe(false);
  });

  it("clearStatuses 应清空状态并关闭仪表盘", () => {
    useDashboardStore.getState().updateAgentStatus({
      agentId: "a1", agentName: "A", status: "success", progress: 100,
    });
    useDashboardStore.getState().clearStatuses();
    expect(useDashboardStore.getState().agentStatuses).toHaveLength(0);
    expect(useDashboardStore.getState().dashboardOpen).toBe(false);
  });
});
