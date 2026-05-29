import { useCallback } from "react";
import { Tag } from "@douyinfe/semi-ui";
import { IconComment, IconUserGroup } from "@douyinfe/semi-icons";
import { formatRelativeTime, truncate } from "@/lib/utils";
import type { Conversation, Agent } from "@/types";

interface WelcomePageProps {
  conversations: Conversation[];
  agents: Agent[];
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onManageAgents: () => void;
}

const STARTERS = [
  "帮我写一个 React 组件",
  "解释一下这段代码",
  "帮我设计一个 API 接口",
];

export function WelcomePage({ conversations, agents, onSelectConversation, onNewConversation, onManageAgents }: WelcomePageProps) {
  const recentConversations = conversations
    .filter((c) => !c.isArchived)
    .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
    .slice(0, 3);

  const activeAgents = agents.filter((a) => a.isActive);

  const handleSendStarter = useCallback(() => {
    onNewConversation();
  }, [onNewConversation]);

  return (
    <div style={{
      display: "flex",
      height: "100%",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
      gap: 28,
      overflow: "auto",
    }}>
      {/* 标题区 */}
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
          AgentHub
        </h1>
        <p style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-tertiary)", marginTop: 6 }}>
          多 Agent 协作平台 — 与 AI Agent 团队一起完成复杂任务
        </p>
      </div>

      {/* 快捷操作 */}
      <div style={{ display: "flex", gap: 12 }}>
        <QuickCard
          icon={<IconComment style={{ fontSize: 24 }} />}
          title="新对话"
          desc="开始一个新的单聊或群聊"
          onClick={onNewConversation}
        />
        <QuickCard
          icon={<IconUserGroup style={{ fontSize: 24 }} />}
          title="Agent 市场"
          desc="浏览和管理可用 Agent"
          onClick={onManageAgents}
        />
      </div>

      {/* Starter 提示 */}
      <div style={{ width: "100%", maxWidth: 480 }}>
        <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)", textAlign: "center", marginBottom: 8 }}>
          试试这些话题
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {STARTERS.map((text) => (
            <button
              key={text}
              onClick={handleSendStarter}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 16px",
                border: "1px solid var(--color-border-light)",
                borderRadius: "var(--radius-md)",
                background: "var(--color-bg-elevated)",
                fontSize: "var(--font-size-md)",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                transition: "border-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
                e.currentTarget.style.color = "var(--color-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-light)";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {/* 最近对话 + Agent 网格 并排 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%", maxWidth: 560 }}>
        {recentConversations.length > 0 && (
          <div>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)", marginBottom: 8, fontWeight: 500 }}>
              最近对话
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {recentConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    border: "1px solid var(--color-border-light)",
                    borderRadius: "var(--radius-md)",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background var(--duration-fast) var(--ease-out)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {truncate(conv.title, 16)}
                  </span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-disabled)", flexShrink: 0, marginLeft: 8 }}>
                    {formatRelativeTime(conv.lastActiveAt)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeAgents.length > 0 && (
          <div>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)", marginBottom: 8, fontWeight: 500 }}>
              可用 Agent
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {activeAgents.slice(0, 5).map((agent) => (
                <div
                  key={agent.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    border: "1px solid var(--color-border-light)",
                    borderRadius: "var(--radius-md)",
                    background: "transparent",
                  }}
                >
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--color-success)",
                    color: "#fff",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: 600,
                    flexShrink: 0,
                  }}>
                    {agent.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-primary)", fontWeight: 500 }}>
                      {agent.name}
                    </div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)" }}>
                      {agent.provider} / {agent.model}
                    </div>
                  </div>
                  {agent.capabilities && agent.capabilities.slice(0, 2).map((cap) => (
                    <Tag key={cap} size="small" color="blue" type="ghost">{cap}</Tag>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickCard({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "20px 32px",
        border: "1px solid var(--color-border-light)",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-bg-elevated)",
        cursor: "pointer",
        transition: "border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--color-primary)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border-light)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ color: "var(--color-primary)" }}>{icon}</div>
      <div style={{ fontSize: "var(--font-size-md)", fontWeight: 600, color: "var(--color-text-primary)" }}>{title}</div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)" }}>{desc}</div>
    </button>
  );
}
