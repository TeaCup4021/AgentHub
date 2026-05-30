import { describe, it, expect, beforeEach } from "vitest";
import { useTokenUsageStore, estimateCost } from "../tokenUsageStore";

function resetStore() {
  useTokenUsageStore.setState({ usageMap: {}, events: [] });
}

describe("useTokenUsageStore — addUsage", () => {
  beforeEach(resetStore);

  it("新会话应创建新条目", () => {
    useTokenUsageStore.getState().addUsage({
      conversationId: "conv-1",
      conversationTitle: "测试对话",
      agentName: "Claude Code",
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      estimatedCost: 0.01,
    });
    expect(useTokenUsageStore.getState().usageMap["conv-1"]).toBeDefined();
    expect(useTokenUsageStore.getState().events).toHaveLength(1);
  });

  it("追加同一会话应累加 Token 和费用", () => {
    const store = useTokenUsageStore.getState();
    store.addUsage({
      conversationId: "conv-1", conversationTitle: "T", agentName: "A",
      inputTokens: 1000, outputTokens: 500, totalTokens: 1500, estimatedCost: 0.01,
    });
    store.addUsage({
      conversationId: "conv-1", conversationTitle: "T", agentName: "A",
      inputTokens: 500, outputTokens: 200, totalTokens: 700, estimatedCost: 0.005,
    });
    const entry = useTokenUsageStore.getState().usageMap["conv-1"];
    expect(entry.inputTokens).toBe(1500);
    expect(entry.estimatedCost).toBeCloseTo(0.015, 5);
  });

  it("不同会话的用量应独立存储", () => {
    const store = useTokenUsageStore.getState();
    store.addUsage({ conversationId: "conv-1", conversationTitle: "A", agentName: "X", inputTokens: 100, outputTokens: 0, totalTokens: 100, estimatedCost: 0 });
    store.addUsage({ conversationId: "conv-2", conversationTitle: "B", agentName: "Y", inputTokens: 200, outputTokens: 0, totalTokens: 200, estimatedCost: 0 });
    expect(Object.keys(useTokenUsageStore.getState().usageMap)).toHaveLength(2);
  });

  it("每条 addUsage 应追加事件到 events 数组", () => {
    useTokenUsageStore.getState().addUsage({
      conversationId: "c1", conversationTitle: "T", agentName: "A",
      inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0,
    });
    useTokenUsageStore.getState().addUsage({
      conversationId: "c1", conversationTitle: "T", agentName: "A",
      inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0,
    });
    expect(useTokenUsageStore.getState().events).toHaveLength(2);
  });
});

describe("estimateCost", () => {
  it("claude-sonnet-4-6 应使用 $3/$15 每百万 Token 定价", () => {
    const cost = estimateCost(1_000_000, 1_000_000, "claude-sonnet-4-6");
    expect(cost).toBeCloseTo(18, 1); // 3 + 15
  });

  it("未知模型应使用默认定价 $2.5/$10", () => {
    const cost = estimateCost(1_000_000, 1_000_000, "unknown-model");
    expect(cost).toBeCloseTo(12.5, 1); // 2.5 + 10
  });

  it("零 Token 应返回 $0", () => {
    expect(estimateCost(0, 0)).toBe(0);
  });
});
