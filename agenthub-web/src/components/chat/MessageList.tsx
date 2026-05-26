import { useState, useCallback, useEffect, useRef, useLayoutEffect } from "react";
import { Spin, Badge } from "@douyinfe/semi-ui";
import { useChatStore } from "@/stores/chatStore";
import { CardRenderer } from "@/components/cards";
import { AgentDetailPopover } from "./AgentDetailPopover";
import { AgentAvatarContextMenu } from "./AgentAvatarContextMenu";
import { MarkdownBubble } from "./MarkdownBubble";
import { formatTime, formatFullTime } from "@/lib/formatTime";
import type { Agent, Message, ThinkingStep } from "@/types";
import { ThinkingBlock } from "./ThinkingBlock";

const FIVE_MINUTES = 5 * 60 * 1000;

function TimeSeparator({ time }: { time: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }} title={formatFullTime(time)}>
      <span style={{
        fontSize: "var(--font-size-xs)",
        color: "var(--color-text-tertiary)",
        background: "var(--color-bg-elevated)",
        padding: "2px 12px",
        borderRadius: "var(--radius-round)",
        boxShadow: "var(--shadow-sm)",
      }}>
        {formatTime(time)}
      </span>
    </div>
  );
}

function MessageBubble({ message, agents }: { message: Message; agents: Agent[] }) {
  const isUser = message.senderType === "user";
  const isOrchestrator = message.senderType === "orchestrator";
  const agent = !isUser && !isOrchestrator && message.senderId
    ? agents.find((a) => a.id === message.senderId)
    : null;

  const avatarRef = useRef<HTMLDivElement>(null);
  const [showPopover, setShowPopover] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  const closeAll = useCallback(() => {
    setShowPopover(false);
    setShowMenu(false);
  }, []);

  const thinkingSteps = (message.meta?.thinking_steps as ThinkingStep[] | undefined) ?? [];

  const handleAvatarClick = useCallback(() => {
    if (!agent || !avatarRef.current) return;
    const rect = avatarRef.current.getBoundingClientRect();
    setPopoverPos({ top: rect.bottom + 4, left: rect.left });
    setShowPopover((prev) => !prev);
    setShowMenu(false);
  }, [agent]);

  const handleAvatarContextMenu = useCallback((e: React.MouseEvent) => {
    if (!agent) return;
    e.preventDefault();
    setMenuPos({ top: e.clientY, left: e.clientX });
    setShowMenu(true);
    setShowPopover(false);
  }, [agent]);

  const isFailed = message.status === "failed";
  const avatarCursor = agent ? "pointer" : "";

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 16px",
        flexDirection: isUser ? "row-reverse" : "row",
      }}
      title={formatFullTime(message.createdAt)}
    >
      {isFailed && isUser ? (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "var(--color-bg-hover)",
          color: "var(--color-danger)",
          fontSize: "var(--font-size-md)",
          fontWeight: "bold",
          flexShrink: 0,
        }}>
          !
        </div>
      ) : (
        <div
          ref={avatarRef}
          onClick={handleAvatarClick}
          onContextMenu={handleAvatarContextMenu}
          onMouseDown={(e) => {
            if (showPopover || showMenu) e.stopPropagation();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: "50%",
            fontSize: "var(--font-size-xs)",
            fontWeight: 500,
            color: "#fff",
            flexShrink: 0,
            background: isUser ? "var(--color-primary)" : "var(--color-success)",
            cursor: avatarCursor,
            userSelect: "none",
          }}
          title={agent ? `${agent.name} - ${agent.model}` : undefined}
        >
          {isUser ? "我" : (message.senderName || "A").charAt(0)}
        </div>
      )}

      {showPopover && agent && (
        <AgentDetailPopover agent={agent} position={popoverPos} onClose={closeAll} />
      )}
      {showMenu && agent && (
        <AgentAvatarContextMenu agentName={agent.name} position={menuPos} onClose={closeAll} />
      )}

      <div style={{ maxWidth: "75%", textAlign: isUser ? "right" : "left" }}>
        {!isUser && (
          <p style={{ marginBottom: 4, fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--color-text-secondary)" }}>
            {message.senderName || "Agent"}
          </p>
        )}
        <div style={{
          display: "inline-block",
          borderRadius: "var(--radius-lg)",
          padding: "8px 16px",
          fontSize: "var(--font-size-md)",
          lineHeight: 1.6,
          background: isFailed && isUser
            ? "var(--color-bg-hover)"
            : isUser
              ? "var(--color-bubble-user-bg)"
              : "var(--color-bubble-agent-bg)",
          color: isUser ? "var(--color-bubble-user-text)" : "var(--color-text-primary)",
          border: isFailed && isUser
            ? "1px solid var(--color-danger)"
            : !isUser
              ? "1px solid var(--color-bubble-agent-border)"
              : "none",
          boxShadow: !isUser ? "var(--shadow-sm)" : "none",
        }}>
          {thinkingSteps.length > 0 && <ThinkingBlock steps={thinkingSteps} />}
          {message.content && <MarkdownBubble text={message.content} />}
          {message.artifacts.map((a) => <CardRenderer key={a.id} artifact={a} />)}
        </div>
        {isFailed && isUser && (
          <p style={{ marginTop: 4, fontSize: "var(--font-size-xs)", color: "var(--color-danger)", display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
            发送失败
          </p>
        )}
      </div>
    </div>
  );
}

function StreamingMessageBubble({ messageId, agentName }: { messageId: string; agentName: string }) {
  const sc = useChatStore((s) => s.getStreamingContent(messageId));
  if (!sc) return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "var(--color-success)",
        color: "#fff",
        fontSize: "var(--font-size-xs)",
        fontWeight: 500,
        flexShrink: 0,
      }}>
        {(agentName || "A").charAt(0)}
      </div>
      <div style={{ maxWidth: "75%" }}>
        <p style={{ marginBottom: 4, fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--color-text-secondary)" }}>
          {agentName || "Agent"}
        </p>
        <div style={{
          display: "inline-block",
          borderRadius: "var(--radius-lg)",
          padding: "8px 16px",
          fontSize: "var(--font-size-md)",
          lineHeight: 1.6,
          background: "var(--color-bubble-agent-bg)",
          color: "var(--color-text-primary)",
          border: "1px solid var(--color-bubble-agent-border)",
          boxShadow: "var(--shadow-sm)",
        }}>
          {sc.thinkingSteps.length > 0 && <ThinkingBlock steps={sc.thinkingSteps} isStreaming />}
          {sc.content && <MarkdownBubble text={sc.content} isStreaming />}
          {sc.artifacts.map((a) => <CardRenderer key={a.id} artifact={a} />)}
        </div>
      </div>
    </div>
  );
}

function PendingMessageBubble() {
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "var(--color-success)",
        color: "#fff",
        fontSize: "var(--font-size-xs)",
        fontWeight: 500,
        flexShrink: 0,
      }}>
        A
      </div>
      <div style={{ maxWidth: "75%" }}>
        <div style={{
          display: "inline-block",
          borderRadius: "var(--radius-lg)",
          padding: "12px 20px",
          background: "var(--color-bubble-agent-bg)",
          border: "1px solid var(--color-bubble-agent-border)",
        }}>
          <span style={{ display: "inline-flex", gap: 4 }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--color-text-tertiary)",
              animation: "bounce 1.4s infinite",
              animationDelay: "0ms",
            }} />
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--color-text-tertiary)",
              animation: "bounce 1.4s infinite",
              animationDelay: "150ms",
            }} />
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--color-text-tertiary)",
              animation: "bounce 1.4s infinite",
              animationDelay: "300ms",
            }} />
          </span>
        </div>
      </div>
    </div>
  );
}

interface MessageListProps {
  messages: Message[];
  agents: Agent[];
  streamingMessageId?: string | null;
  streamingAgentName?: string;
  isWaiting?: boolean;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
}

export function MessageList({
  messages, agents, streamingMessageId, streamingAgentName,
  isWaiting, hasMore, isFetchingMore, onLoadMore,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevVisibleCountRef = useRef(0);
  const firstMsgIdRef = useRef<string | null>(null);

  const visibleCount =
    messages.length + (streamingMessageId ? 1 : 0) + (isWaiting ? 1 : 0);

  const scrollToBottom = useCallback(() => {
    bottomSentinelRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useLayoutEffect(() => {
    if (messages.length > 0 && firstMsgIdRef.current !== null && messages[0].id !== firstMsgIdRef.current) {
      setUnreadCount(0);
      setIsAtBottom(true);
      prevVisibleCountRef.current = 0;
    }
    firstMsgIdRef.current = messages.length > 0 ? messages[0].id : null;
  }, [messages]);

  useLayoutEffect(() => {
    if (prevVisibleCountRef.current === 0) {
      prevVisibleCountRef.current = visibleCount;
      requestAnimationFrame(() => scrollToBottom());
      return;
    }
    if (visibleCount > prevVisibleCountRef.current) {
      const delta = visibleCount - prevVisibleCountRef.current;
      if (isAtBottom) {
        scrollToBottom();
      } else {
        setUnreadCount((c) => c + delta);
      }
    }
    prevVisibleCountRef.current = visibleCount;
  }, [visibleCount, isAtBottom, scrollToBottom]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !onLoadMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isFetchingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isFetchingMore, onLoadMore]);

  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsAtBottom(entry.isIntersecting);
        if (entry.isIntersecting) setUnreadCount(0);
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, overflowY: "auto", position: "relative", background: "var(--color-bg-chat)" }}>
      {onLoadMore && <div ref={topSentinelRef} style={{ height: 1 }} />}
      {isFetchingMore && (
        <div style={{ display: "flex", justifyContent: "center", padding: 8 }}>
          <Spin size="small" />
        </div>
      )}
      {!hasMore && messages.length > 0 && onLoadMore && (
        <div style={{ display: "flex", justifyContent: "center", padding: 8 }}>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-disabled)" }}>
            已加载全部消息
          </span>
        </div>
      )}
      {messages.map((msg, i) => {
        const prevTime = i > 0 ? messages[i - 1].createdAt : null;
        const needSeparator = !prevTime
          || new Date(msg.createdAt).getTime() - new Date(prevTime).getTime() > FIVE_MINUTES;
        return (
          <div key={msg.id}>
            {needSeparator && <TimeSeparator time={msg.createdAt} />}
            <MessageBubble message={msg} agents={agents} />
          </div>
        );
      })}
      {streamingMessageId && streamingAgentName && (
        <StreamingMessageBubble messageId={streamingMessageId} agentName={streamingAgentName} />
      )}
      {isWaiting && !streamingMessageId && <PendingMessageBubble />}
      <div ref={bottomSentinelRef} style={{ height: 1 }} />
      {!isAtBottom && unreadCount > 0 && (
        <div style={{ position: "sticky", bottom: 24, display: "flex", justifyContent: "flex-end", paddingRight: 16, zIndex: 10 }}>
          <Badge count={unreadCount > 99 ? "99+" : unreadCount}>
            <button
              onClick={scrollToBottom}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "var(--color-primary)",
                color: "#fff",
                fontSize: "var(--font-size-xs)",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                boxShadow: "var(--shadow-md)",
                transition: "all var(--duration-fast) var(--ease-out)",
                animation: "slide-up 200ms ease-out",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </Badge>
        </div>
      )}
    </div>
  );
}
