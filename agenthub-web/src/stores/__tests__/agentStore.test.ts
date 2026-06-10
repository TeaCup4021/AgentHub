import { describe, it, expect, beforeEach } from "vitest";
import { useAgentStore } from "../agentStore";

describe("useAgentStore", () => {
  beforeEach(() => {
    useAgentStore.setState({ selectedAgentIds: [] });
  });

  it("toggleSelectedAgent — 未选中时加入", () => {
    useAgentStore.getState().toggleSelectedAgent("agent-1");
    expect(useAgentStore.getState().selectedAgentIds).toEqual(["agent-1"]);
  });

  it("toggleSelectedAgent — 已选中时移除", () => {
    useAgentStore.setState({ selectedAgentIds: ["agent-1", "agent-2"] });
    useAgentStore.getState().toggleSelectedAgent("agent-1");
    expect(useAgentStore.getState().selectedAgentIds).toEqual(["agent-2"]);
  });

  it("setSelectedAgents 应替换整个列表", () => {
    useAgentStore.setState({ selectedAgentIds: ["a", "b"] });
    useAgentStore.getState().setSelectedAgents(["c", "d", "e"]);
    expect(useAgentStore.getState().selectedAgentIds).toEqual(["c", "d", "e"]);
  });
});
