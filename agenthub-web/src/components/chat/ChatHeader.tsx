import { Tag, Typography } from "@douyinfe/semi-ui";
import type { Conversation, Agent } from "@/types";

interface ChatHeaderProps {
  conversation: Conversation;
  agents: Agent[];
}

export function ChatHeader({ conversation, agents }: ChatHeaderProps) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: "1px solid var(--color-border-light)",
      padding: "10px 16px",
      background: "var(--color-bg-elevated)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Typography.Title heading={6} style={{ margin: 0, color: "var(--color-text-primary)" }}>
          {conversation.title}
        </Typography.Title>
        {conversation.type === "group" && (
          <Tag size="small" color="blue" type="solid">群聊</Tag>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {conversation.agentIds.map((aid) => {
          const agent = agents.find((a) => a.id === aid);
          return (
            <Tag key={aid} size="small" type="ghost" color="grey">
              {agent ? agent.name : aid.slice(0, 8)}
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
