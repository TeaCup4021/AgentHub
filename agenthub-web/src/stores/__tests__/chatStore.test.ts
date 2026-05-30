import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "../chatStore";

function resetStore() {
  useChatStore.setState({
    activeConversationId: null,
    searchQuery: "",
    isStreaming: false,
    streamingContent: {},
    pendingMention: null,
    connectionStatus: "connected",
    retryCount: 0,
    pendingQuote: null,
    messageSearch: "",
    pendingPlan: null,
  });
}

describe("chatStore — initStreamingMessage", () => {
  beforeEach(resetStore);

  it("应该创建新条目并设 isStreaming=true", () => {
    useChatStore.getState().initStreamingMessage("msg-1");
    const state = useChatStore.getState();
    expect(state.isStreaming).toBe(true);
    expect(state.streamingContent["msg-1"]).toEqual({
      content: "",
      artifacts: [],
      thinkingSteps: [],
    });
  });

  it("应该保留其他条目的内容", () => {
    useChatStore.getState().initStreamingMessage("msg-1");
    useChatStore.getState().appendStreamToken("msg-1", "hello");
    useChatStore.getState().initStreamingMessage("msg-2");
    expect(useChatStore.getState().streamingContent["msg-1"].content).toBe("hello");
    expect(useChatStore.getState().streamingContent["msg-2"]).toBeDefined();
  });
});

describe("chatStore — appendStreamToken", () => {
  beforeEach(resetStore);

  it("应该在已有内容后追加 delta", () => {
    useChatStore.getState().initStreamingMessage("msg-1");
    useChatStore.getState().appendStreamToken("msg-1", "He");
    useChatStore.getState().appendStreamToken("msg-1", "llo");
    expect(useChatStore.getState().streamingContent["msg-1"].content).toBe("Hello");
  });

  it("对不存在的 messageId 应无操作", () => {
    useChatStore.getState().appendStreamToken("nonexistent", "x");
    expect(useChatStore.getState().streamingContent["nonexistent"]).toBeUndefined();
  });
});

describe("chatStore — appendStreamArtifact", () => {
  beforeEach(resetStore);

  it("应该追加 artifact 到消息条目", () => {
    useChatStore.getState().initStreamingMessage("msg-1");
    const artifact = {
      id: "art-1", artifactType: "code" as const, title: "test.ts",
      content: { language: "ts", code: "const x = 1;" },
      version: 1, createdAt: "2026-01-01T00:00:00Z",
    };
    useChatStore.getState().appendStreamArtifact("msg-1", artifact);
    expect(useChatStore.getState().streamingContent["msg-1"].artifacts).toHaveLength(1);
  });
});

describe("chatStore — appendThinkingStep", () => {
  beforeEach(resetStore);

  it("应该为新的 phase+text 追加步骤", () => {
    useChatStore.getState().initStreamingMessage("msg-1");
    useChatStore.getState().appendThinkingStep("msg-1", {
      phase: "thought", text: "分析需求", status: "running",
    });
    expect(useChatStore.getState().streamingContent["msg-1"].thinkingSteps).toHaveLength(1);
  });

  it("同 phase+text 的步骤应原地更新状态", () => {
    useChatStore.getState().initStreamingMessage("msg-1");
    useChatStore.getState().appendThinkingStep("msg-1", {
      phase: "thought", text: "分析需求", status: "running",
    });
    useChatStore.getState().appendThinkingStep("msg-1", {
      phase: "thought", text: "分析需求", status: "done",
    });
    const steps = useChatStore.getState().streamingContent["msg-1"].thinkingSteps;
    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe("done");
  });

  it("不同 phase+text 应追加而非覆盖", () => {
    useChatStore.getState().initStreamingMessage("msg-1");
    useChatStore.getState().appendThinkingStep("msg-1", {
      phase: "thought", text: "步骤1", status: "done",
    });
    useChatStore.getState().appendThinkingStep("msg-1", {
      phase: "action", text: "步骤2", status: "running",
    });
    expect(useChatStore.getState().streamingContent["msg-1"].thinkingSteps).toHaveLength(2);
  });
});

describe("chatStore — finalizeStreamingMessage", () => {
  beforeEach(resetStore);

  it("应该从 streamingContent 中移除条目", () => {
    useChatStore.getState().initStreamingMessage("msg-1");
    useChatStore.getState().finalizeStreamingMessage("msg-1");
    expect(useChatStore.getState().streamingContent["msg-1"]).toBeUndefined();
  });

  it("应该设置 isStreaming=false", () => {
    useChatStore.getState().initStreamingMessage("msg-1");
    useChatStore.getState().finalizeStreamingMessage("msg-1");
    expect(useChatStore.getState().isStreaming).toBe(false);
  });
});

describe("chatStore — 连接状态", () => {
  beforeEach(resetStore);

  it("初始连接状态应为 connected", () => {
    expect(useChatStore.getState().connectionStatus).toBe("connected");
    expect(useChatStore.getState().retryCount).toBe(0);
  });

  it("setConnectionStatus 应更新状态", () => {
    useChatStore.getState().setConnectionStatus("failed");
    expect(useChatStore.getState().connectionStatus).toBe("failed");
  });

  it("setRetryCount 应更新重试计数", () => {
    useChatStore.getState().setRetryCount(3);
    expect(useChatStore.getState().retryCount).toBe(3);
  });
});

describe("chatStore — setPendingQuote", () => {
  beforeEach(resetStore);

  it("应该设置引用消息", () => {
    useChatStore.getState().setPendingQuote({ messageId: "m1", content: "引用文本" });
    expect(useChatStore.getState().pendingQuote).toEqual({
      messageId: "m1", content: "引用文本",
    });
  });

  it("传 null 时清除引用", () => {
    useChatStore.getState().setPendingQuote({ messageId: "m1", content: "x" });
    useChatStore.getState().setPendingQuote(null);
    expect(useChatStore.getState().pendingQuote).toBeNull();
  });
});

describe("chatStore — setPendingPlan", () => {
  beforeEach(resetStore);

  it("应该设置待确认计划", () => {
    const plan = { planId: "plan-1", subtasks: [] };
    useChatStore.getState().setPendingPlan(plan);
    expect(useChatStore.getState().pendingPlan).toEqual(plan);
  });

  it("传 null 时清除计划", () => {
    useChatStore.getState().setPendingPlan({ planId: "plan-1", subtasks: [] });
    useChatStore.getState().setPendingPlan(null);
    expect(useChatStore.getState().pendingPlan).toBeNull();
  });
});
