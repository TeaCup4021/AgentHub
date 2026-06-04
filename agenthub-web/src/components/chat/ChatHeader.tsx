import { useState, useCallback } from "react";
import { Tag, Typography, Input, Button } from "@douyinfe/semi-ui";
import { IconSearch, IconClose } from "@douyinfe/semi-icons";
import { useChatStore } from "@/stores/chatStore";
import { PinManager } from "@/components/chat/PinManager";
import type { Conversation, Agent } from "@/types";

type SearchMode = "off" | "conv" | "msg";

interface TaskSummary {
  total: number;
  completed: number;
  failed: number;
  running: number;
  hasDag: boolean;
}

interface ChatHeaderProps {
  conversation: Conversation;
  agents: Agent[];
  messageHitCount?: number;
  taskSummary?: TaskSummary | null;
  onPinChanged?: () => void;
  onJumpToMessage?: (messageId: string) => void;
}

export function ChatHeader({ conversation, agents, messageHitCount, taskSummary, onPinChanged, onJumpToMessage }: ChatHeaderProps) {
  const [searchMode, setSearchMode] = useState<SearchMode>("off");
  const [searchText, setSearchText] = useState("");
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const messageSearch = useChatStore((s) => s.messageSearch);
  const setMessageSearch = useChatStore((s) => s.setMessageSearch);

  const handleSearchChange = useCallback((v: string) => {
    setSearchText(v);
    if (searchMode === "msg") {
      setMessageSearch(v);
    } else {
      setSearchQuery(v);
    }
  }, [searchMode, setSearchQuery, setMessageSearch]);

  const handleCloseSearch = useCallback(() => {
    setSearchMode("off");
    setSearchText("");
    setSearchQuery("");
    setMessageSearch("");
  }, [setSearchQuery, setMessageSearch]);

  const cycleSearch = useCallback(() => {
    if (searchMode === "off") {
      setSearchMode("msg");
      setMessageSearch("");
    } else if (searchMode === "msg") {
      setSearchMode("conv");
      setMessageSearch("");
      setSearchQuery("");
      setSearchText("");
    } else {
      handleCloseSearch();
    }
  }, [searchMode, handleCloseSearch, setSearchQuery, setMessageSearch]);

  const isSearchActive = searchQuery || messageSearch;

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
          {taskSummary && taskSummary.total > 0 && (
            <div
              onClick={() => window.dispatchEvent(new CustomEvent("open-react-panel"))}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 10px",
                borderRadius: 12,
                background: taskSummary.running > 0
                  ? "color-mix(in srgb, var(--color-status-running) 10%, transparent)"
                  : taskSummary.failed > 0
                    ? "color-mix(in srgb, var(--color-status-failed) 10%, transparent)"
                    : "color-mix(in srgb, var(--color-status-done) 10%, transparent)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 500,
                userSelect: "none",
                transition: "background 0.15s",
              }}
            >
              <span style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: taskSummary.running > 0
                  ? "var(--color-status-running)"
                  : taskSummary.failed > 0
                    ? "var(--color-status-failed)"
                    : "var(--color-status-done)",
                animation: taskSummary.running > 0 ? "pulse 1.5s infinite" : "none",
              }} />
              {taskSummary.running > 0
                ? `执行中 (${taskSummary.completed}/${taskSummary.total})`
                : taskSummary.failed > 0
                  ? `${taskSummary.completed}/${taskSummary.total} 完成，${taskSummary.failed} 失败`
                  : `${taskSummary.total} 个任务已完成`}
            </div>
          )}
          <PinManager
            conversationId={conversation.id}
            onJumpToMessage={onJumpToMessage}
            onPinChanged={onPinChanged}
          />
          <Button
            data-search-toggle
            icon={<IconSearch />}
            theme="borderless"
            size="small"
            onClick={cycleSearch}
            type={isSearchActive ? "primary" : "tertiary"}
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
      {searchMode !== "off" && (
        <div data-search-input-wrapper style={{ padding: "0 16px 10px", display: "flex", gap: 8 }}>
          <Input
            prefix={<IconSearch />}
            suffix={searchText ? <Button icon={<IconClose />} theme="borderless" size="small" onClick={handleCloseSearch} /> : null}
            placeholder={searchMode === "msg" ? "搜索消息内容..." : "搜索对话标题..."}
            value={searchText}
            onChange={handleSearchChange}
            size="small"
            style={{ flex: 1 }}
          />
          <Button
            size="small"
            theme="light"
            onClick={() => {
              const next: SearchMode = searchMode === "msg" ? "conv" : "msg";
              setSearchMode(next);
              setSearchText("");
              if (next === "msg") setSearchQuery("");
              else setMessageSearch("");
            }}
          >
            {searchMode === "msg" ? "消息" : "对话"}
          </Button>
          {searchMode === "msg" && searchText && messageHitCount !== undefined && (
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)", lineHeight: "32px", whiteSpace: "nowrap" }}>
              找到 {messageHitCount} 条
            </span>
          )}
        </div>
      )}
    </div>
  );
}
