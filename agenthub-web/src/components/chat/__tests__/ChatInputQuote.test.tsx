import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput, composeQuotedPrompt } from "../ChatInput";
import { useChatStore, type PendingQuote } from "@/stores/chatStore";
import type { Agent } from "@/types";

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

function renderInput(onSend = vi.fn()) {
  const result = render(<ChatInput onSend={onSend} onStop={vi.fn()} disabled={false} agents={[makeAgent()]} />);
  const editor = result.container.querySelector('[contenteditable]') as HTMLDivElement;
  return { ...result, onSend, editor };
}

describe("composeQuotedPrompt", () => {
  it("代码片段引用 → 注入 [选区修改] 哨兵 + diff 指令 + 代码围栏", () => {
    const quote: PendingQuote = {
      messageId: "art-1",
      content: "for x in items:\n    print(x)",
      codeRange: { fileName: "main.py", language: "python", snippet: "for x in items:\n    print(x)" },
    };
    const out = composeQuotedPrompt(quote, "改成列表推导");
    expect(out).toContain("[选区修改]");
    expect(out).toContain("文件：main.py");
    expect(out).toContain("语言：python");
    expect(out).toContain("```python");
    expect(out).toContain("for x in items:");
    expect(out).toContain("修改要求：改成列表推导");
  });

  it("无文件名/语言的代码片段仍带哨兵，不带 meta 行", () => {
    const quote: PendingQuote = {
      messageId: "art-1",
      content: "a = 1",
      codeRange: { snippet: "a = 1" },
    };
    const out = composeQuotedPrompt(quote, "加注释");
    expect(out).toContain("[选区修改]");
    expect(out).not.toContain("文件：");
    expect(out).not.toContain("语言：");
    expect(out).toContain("修改要求：加注释");
  });

  it("普通整条消息引用 → blockquote + 描述，不含选区哨兵", () => {
    const quote: PendingQuote = { messageId: "m1", content: "第一行\n第二行" };
    const out = composeQuotedPrompt(quote, "总结一下");
    expect(out).not.toContain("[选区修改]");
    expect(out).toContain("> 第一行");
    expect(out).toContain("> 第二行");
    expect(out).toContain("总结一下");
  });

  it("普通引用且无描述 → 仅 blockquote", () => {
    const quote: PendingQuote = { messageId: "m1", content: "原文" };
    const out = composeQuotedPrompt(quote, "");
    expect(out).toBe("> 原文");
  });
});

describe("ChatInput — 引用发送", () => {
  beforeEach(() => {
    useChatStore.setState({ pendingQuote: null, pendingMention: null });
  });

  it("代码片段引用条显示选区标签和片段内容", () => {
    useChatStore.setState({
      pendingQuote: {
        messageId: "art-1", content: "x = 1",
        codeRange: { fileName: "a.py", language: "python", snippet: "x = 1" },
      },
    });
    renderInput();
    expect(screen.getByText(/选区/)).toBeInTheDocument();
    expect(screen.getByText(/python/)).toBeInTheDocument();
    expect(screen.getByText(/x = 1/)).toBeInTheDocument();
  });

  it("存在引用时，输入描述并回车 → onSend 收到组装后的 prompt，并清除引用", async () => {
    useChatStore.setState({
      pendingQuote: {
        messageId: "art-1", content: "for x in items: print(x)",
        codeRange: { fileName: "main.py", language: "python", snippet: "for x in items: print(x)" },
      },
    });
    const { onSend, editor } = renderInput();
    editor.focus();
    await userEvent.type(editor, "改成列表推导");
    await userEvent.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledTimes(1);
    const [content] = onSend.mock.calls[0];
    expect(content).toContain("[选区修改]");
    expect(content).toContain("修改要求：改成列表推导");
    await waitFor(() => {
      expect(useChatStore.getState().pendingQuote).toBeNull();
    });
  });

  it("存在引用时，空描述也可直接发送", async () => {
    useChatStore.setState({
      pendingQuote: { messageId: "m1", content: "解释这段" },
    });
    const { onSend, editor } = renderInput();
    editor.focus();
    fireEvent.keyDown(editor, { key: "Enter", shiftKey: false });

    expect(onSend).toHaveBeenCalledTimes(1);
    const [content] = onSend.mock.calls[0];
    expect(content).toContain("> 解释这段");
  });
});
