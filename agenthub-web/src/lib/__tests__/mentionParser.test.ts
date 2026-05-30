import { describe, it, expect } from "vitest";
import { parseMentions, mentionsFromText } from "../mentionParser";
import type { Agent } from "@/types";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Claude Code",
    avatarUrl: "",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    capabilities: ["coding"],
    systemPrompt: "",
    toolConfig: {},
    isBuiltin: true,
    isActive: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("parseMentions", () => {
  it("纯文本无 @ 应返回单个 text segment", () => {
    const agents = [makeAgent()];
    const result = parseMentions("你好世界", agents);
    expect(result).toEqual([{ type: "text", text: "你好世界" }]);
  });

  it("@完整Agent名 应解析为 mention segment", () => {
    const agents = [makeAgent()];
    const result = parseMentions("@Claude Code 帮我写代码", agents);
    expect(result).toEqual([
      { type: "mention", agentId: "agent-1", agentName: "Claude Code" },
      { type: "text", text: " 帮我写代码" },
    ]);
  });

  it("多个 @Agent 应正确分段", () => {
    const agent2 = makeAgent({ id: "agent-2", name: "Codex" });
    const agents = [makeAgent(), agent2];
    const result = parseMentions("@Claude Code 和 @Codex 一起", agents);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ type: "mention", agentId: "agent-1", agentName: "Claude Code" });
    expect(result[1]).toEqual({ type: "text", text: " 和 " });
    expect(result[2]).toEqual({ type: "mention", agentId: "agent-2", agentName: "Codex" });
  });

  it("@部分匹配不应解析", () => {
    const agents = [makeAgent()];
    const result = parseMentions("@Claude 帮我", agents);
    expect(result).toEqual([{ type: "text", text: "@Claude 帮我" }]);
  });

  it("Agent 名长度降序匹配 — 长名优先于短名前缀", () => {
    const short = makeAgent({ id: "s", name: "Codex" });
    const long = makeAgent({ id: "l", name: "Codex Pro" });
    const agents = [short, long];
    const result = parseMentions("@Codex Pro 你好", agents);
    expect(result[0]).toEqual({ type: "mention", agentId: "l", agentName: "Codex Pro" });
  });

  it("空字符串返回空数组", () => {
    const result = parseMentions("", [makeAgent()]);
    expect(result).toEqual([]);
  });

  it("禁用的 Agent 不应被匹配", () => {
    const disabled = makeAgent({ isActive: false });
    const result = parseMentions("@Claude Code", [disabled]);
    expect(result).toEqual([{ type: "text", text: "@Claude Code" }]);
  });
});

describe("mentionsFromText", () => {
  it("应提取所有被 mention 的 Agent ID", () => {
    const agent2 = makeAgent({ id: "agent-2", name: "Codex" });
    const result = mentionsFromText("@Claude Code @Codex", [makeAgent(), agent2]);
    expect(result).toEqual(["agent-1", "agent-2"]);
  });

  it("同一 Agent 多次出现应去重", () => {
    const result = mentionsFromText("@Claude Code @Claude Code", [makeAgent()]);
    expect(result).toEqual(["agent-1"]);
  });
});
