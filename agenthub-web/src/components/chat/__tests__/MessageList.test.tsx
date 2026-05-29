import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "../MessageList";
import { useChatStore } from "@/stores/chatStore";
import type { Message, Agent } from "@/types";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1", name: "Claude Code", avatarUrl: "",
    provider: "anthropic", model: "claude-sonnet-4-6",
    capabilities: ["coding"], systemPrompt: "", toolConfig: {},
    isBuiltin: true, isActive: true,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1", conversationId: "conv-1",
    senderType: "user", senderName: "我",
    contentType: "text", content: "测试消息内容",
    artifacts: [], status: "done", meta: null,
    createdAt: "2026-05-21T14:00:00Z", updatedAt: "2026-05-21T14:00:00Z",
    ...overrides,
  };
}

describe("MessageList", () => {
  beforeEach(() => {
    useChatStore.setState({ streamingContent: {}, pendingPlan: null });
  });

  it("应渲染所有消息", () => {
    const messages = [makeMessage(), makeMessage({ id: "msg-2", senderType: "agent", senderName: "Claude" })];
    render(<MessageList messages={messages} agents={[makeAgent()]} />);
    const items = screen.getAllByText("测试消息内容");
    expect(items).toHaveLength(2);
  });

  it("间隔超 5 分钟的消息之间应显示时间分隔条", () => {
    const msg1 = makeMessage({ createdAt: "2026-05-21T14:00:00Z" });
    const msg2 = makeMessage({ id: "msg-2", createdAt: "2026-05-21T14:10:00Z" });
    render(<MessageList messages={[msg1, msg2]} agents={[makeAgent()]} />);
    const separators = document.querySelectorAll('[title]');
    expect(separators.length).toBeGreaterThan(0);
  });

  it("isWaiting 时显示等待动画", () => {
    render(<MessageList messages={[]} agents={[makeAgent()]} isWaiting />);
    const dots = document.querySelectorAll('[style*="animation"][style*="bounce"]');
    expect(dots.length).toBeGreaterThan(0);
  });
});
