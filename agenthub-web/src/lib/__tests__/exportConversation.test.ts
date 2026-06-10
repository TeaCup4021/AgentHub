import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportConversation } from "../exportConversation";
import type { Message } from "@/types";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    senderType: "user",
    senderName: "我",
    contentType: "text",
    content: "你好",
    artifacts: [],
    status: "done",
    meta: null,
    createdAt: "2026-05-21T14:00:00Z",
    updatedAt: "2026-05-21T14:00:00Z",
    ...overrides,
  };
}

describe("exportConversation", () => {
  beforeEach(() => {
    vi.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => null!);
    vi.spyOn(document.body, "removeChild").mockImplementation(() => null!);
    globalThis.URL.createObjectURL = vi.fn(() => "blob:test");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it("应生成包含标题的 Markdown 文件", () => {
    const messages = [makeMessage({ content: "测试消息" })];
    exportConversation(messages, "我的对话");
    const anchor = (document.createElement as ReturnType<typeof vi.spyOn>).mock.results[0].value as HTMLAnchorElement;
    expect(anchor.download).toBe("我的对话.md");
  });

  it("应处理带特殊字符的标题", () => {
    const messages = [makeMessage()];
    exportConversation(messages, "测试: 文件/名*?");
    const anchor = (document.createElement as ReturnType<typeof vi.spyOn>).mock.results[0].value as HTMLAnchorElement;
    expect(anchor.download).not.toContain("/");
    expect(anchor.download).not.toContain(":");
  });
});
