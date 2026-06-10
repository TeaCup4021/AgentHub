import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList, getUserBubbleContent } from "../MessageList";
import { getRenderableArtifacts } from "@/lib/artifacts";
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

  it("shows a loading bar after message_start before visible stream output", () => {
    useChatStore.getState().initStreamingMessage("stream-1");

    render(
      <MessageList
        messages={[]}
        agents={[makeAgent()]}
        streamingMessageId="stream-1"
        streamingAgentName="Claude Code CLI"
      />,
    );

    expect(screen.getByTestId("streaming-output-loading-bar")).toBeInTheDocument();
  });

  it("hides the stream loading bar once token output starts", () => {
    useChatStore.getState().initStreamingMessage("stream-1");
    useChatStore.getState().appendStreamToken("stream-1", "PPT generated");

    render(
      <MessageList
        messages={[]}
        agents={[makeAgent()]}
        streamingMessageId="stream-1"
        streamingAgentName="Claude Code CLI"
      />,
    );

    expect(screen.queryByTestId("streaming-output-loading-bar")).not.toBeInTheDocument();
    expect(document.body.textContent).toContain("PPT generated");
  });

  it("用户消息不为 URL 生成兜底链接卡片", () => {
    render(
      <MessageList
        messages={[
          makeMessage({
            content: "baseUrl是https://api.deepseek.com/anthropic",
          }),
        ]}
        agents={[makeAgent()]}
      />,
    );

    expect(document.body.textContent).toContain("baseUrl是https://api.deepseek.com/anthropic");
    expect(screen.queryByText("链接")).not.toBeInTheDocument();
  });

  it("用户消息展示时脱敏 apiKey", () => {
    render(
      <MessageList
        messages={[
          makeMessage({
            content: "apiKey is demo-api-key-84ae07b4c0324962b85239e478f67d12, baseUrl is https://api.deepseek.com/anthropic",
          }),
        ]}
        agents={[makeAgent()]}
      />,
    );

    expect(document.body.textContent).toContain("demo-ap...7d12");
    expect(document.body.textContent).not.toContain("demo-api-key-84ae07b4c0324962b85239e478f67d12");
    expect(screen.queryByText("链接")).not.toBeInTheDocument();
  });
  it("renders only the user request for selection-edit prompts", () => {
    const content = [
      "[选区修改] 请仅修改以下选中的代码片段（文件：bubble_sort.c · 语言：c），其余代码保持不变，并以 diff 形式给出改动：",
      "",
      "```c",
      "bubble_sort",
      "```",
      "",
      "修改要求：换为maopao",
    ].join("\n");

    render(
      <MessageList
        messages={[makeMessage({ content })]}
        agents={[makeAgent()]}
      />,
    );

    expect(document.body.textContent).toContain("换为maopao");
    expect(document.body.textContent).not.toContain("请仅修改以下选中的代码片段");
    expect(document.body.textContent).not.toContain("bubble_sort");
  });

  it("getUserBubbleContent extracts the request from selection-edit prompts", () => {
    expect(getUserBubbleContent("[选区修改]\n\n修改要求：换为maopao")).toBe("换为maopao");
    expect(getUserBubbleContent("普通消息")).toBe("普通消息");
  });

  it("renders a fallback instead of an empty agent bubble", () => {
    render(
      <MessageList
        messages={[
          makeMessage({
            id: "msg-empty-agent",
            senderType: "agent",
            senderName: "Claude",
            content: "",
            artifacts: [],
            status: "done",
          }),
        ]}
        agents={[makeAgent()]}
      />,
    );

    expect(
      screen.getByText("Agent response was interrupted before producing output. Please retry."),
    ).toBeInTheDocument();
  });
});

describe("getRenderableArtifacts", () => {
  it("filters local file document cards but keeps uploaded PPTX and PDF preview cards", () => {
    const artifacts = getRenderableArtifacts([
      {
        id: "local-ppt",
        artifactType: "document",
        title: "Beijing_Presentation.pptx",
        content: {
          fileName: "Beijing_Presentation.pptx",
          fileUrl: "file:///C:/Users/wolves/.agenthub/cli_workspace/Beijing_Presentation.pptx",
          fileType: "pptx",
          fileSize: 0,
        },
        version: 1,
        createdAt: "2026-06-09T00:00:00Z",
      },
      {
        id: "uploaded-ppt",
        artifactType: "document",
        title: "Beijing_Presentation.pptx",
        content: {
          fileName: "Beijing_Presentation.pptx",
          fileUrl: "/api/v1/files/ppt/download",
          fileType: "pptx",
          fileSize: 43091,
        },
        version: 1,
        createdAt: "2026-06-09T00:00:00Z",
      },
      {
        id: "pdf-preview",
        artifactType: "document",
        title: "Beijing_Presentation.pdf",
        content: {
          fileName: "Beijing_Presentation.pdf",
          fileUrl: "/api/v1/files/pdf/download",
          fileType: "pdf",
          fileSize: 442169,
          sourceFileName: "Beijing_Presentation.pptx",
          sourceFileType: "pptx",
        },
        version: 1,
        createdAt: "2026-06-09T00:00:00Z",
      },
    ]);

    expect(artifacts.map((artifact) => artifact.id)).toEqual(["uploaded-ppt", "pdf-preview"]);
  });
});
