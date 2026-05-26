import { useState, useCallback } from "react";
import { Tag, Typography, Input, Button } from "@douyinfe/semi-ui";
import { IconSearch, IconClose } from "@douyinfe/semi-icons";
import { useChatStore } from "@/stores/chatStore";
import type { Conversation, Agent } from "@/types";

interface ChatHeaderProps {
  conversation: Conversation;
  agents: Agent[];
}

export function ChatHeader({ conversation, agents }: ChatHeaderProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState("");
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);

  const handleSearchChange = useCallback((v: string) => {
    setSearchText(v);
    setSearchQuery(v);
  }, [setSearchQuery]);

  const handleCloseSearch = useCallback(() => {
    setShowSearch(false);
    setSearchText("");
    setSearchQuery("");
  }, [setSearchQuery]);

  return (
    <div style={{
      borderBottom: "1px solid var(--color-border-light)",
      background: "var(--color-bg-elevated)",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
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
          <Button
            icon={<IconSearch />}
            theme="borderless"
            size="small"
            onClick={() => setShowSearch(!showSearch)}
            type={searchQuery ? "primary" : "tertiary"}
          />
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
      {showSearch && (
        <div style={{ padding: "0 16px 10px" }}>
          <Input
            prefix={<IconSearch />}
            suffix={searchText ? <Button icon={<IconClose />} theme="borderless" size="small" onClick={handleCloseSearch} /> : null}
            placeholder="搜索消息..."
            value={searchText}
            onChange={handleSearchChange}
            size="small"
          />
        </div>
      )}
    </div>
  );
}
