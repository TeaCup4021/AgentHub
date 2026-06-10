import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "../ChatInput";
import { useChatStore } from "@/stores/chatStore";
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

function renderInput(props: Partial<{ onSend: ReturnType<typeof vi.fn>; onStop: ReturnType<typeof vi.fn>; disabled: boolean; agents: Agent[] }> = {}) {
  const onSend = props.onSend ?? vi.fn();
  const onStop = props.onStop ?? vi.fn();
  const disabled = props.disabled ?? false;
  const agents = props.agents ?? [makeAgent()];
  const result = render(<ChatInput onSend={onSend} onStop={onStop} disabled={disabled} agents={agents} />);
  const editor = result.container.querySelector('[contenteditable]') as HTMLDivElement;
  return { ...result, onSend, onStop, editor };
}

describe("ChatInput — 基础行为", () => {
  beforeEach(() => {
    useChatStore.setState({ pendingQuote: null, pendingMention: null });
  });

  it("contentEditable 输入区应存在", () => {
    const { editor } = renderInput();
    expect(editor).toBeInTheDocument();
    expect(editor.getAttribute("contenteditable")).toBe("true");
  });

  it("Enter 键应触发 onSend", async () => {
    const { onSend, editor } = renderInput();
    editor.focus();
    await userEvent.type(editor, "hello");
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("hello", [], []);
  });

  it("组合输入中 Enter 不应触发发送", async () => {
    const { onSend, editor } = renderInput();
    editor.focus();

    fireEvent.compositionStart(editor);
    await userEvent.type(editor, "nihao");
    fireEvent.keyDown(editor, { key: "Enter", shiftKey: false });
    fireEvent.compositionEnd(editor);

    expect(onSend).not.toHaveBeenCalled();
  });

  it("disabled 模式下不可编辑", () => {
    const { editor } = renderInput({ disabled: true });
    expect(editor.getAttribute("contenteditable")).toBe("false");
  });

  it("pendingQuote 存在时显示引用条", () => {
    useChatStore.setState({ pendingQuote: { messageId: "m1", content: "引用的原文" } });
    renderInput();
    expect(screen.getByText(/引用的原文/)).toBeInTheDocument();
  });
});

describe("ChatInput — @提及", () => {
  beforeEach(() => {
    useChatStore.setState({ pendingQuote: null, pendingMention: null });
  });

  it("输入 @ 应弹出 Agent 补全列表", async () => {
    const codex = makeAgent({ id: "agent-2", name: "Codex" });
    const { editor } = renderInput({ agents: [makeAgent(), codex] });
    editor.focus();
    await userEvent.type(editor, "@");
    await waitFor(() => {
      expect(screen.getByText("Claude Code")).toBeInTheDocument();
    });
  });
});
