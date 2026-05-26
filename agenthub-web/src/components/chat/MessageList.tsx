import { useState, useCallback, useEffect, useRef, useLayoutEffect } from "react";
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
    <div className="flex justify-center py-2" title={formatFullTime(time)}>
      <span className="text-xs text-gray-400 bg-white/80 px-3 py-0.5 rounded-full">
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
  const avatarCursor = agent ? "cursor-pointer" : "";

  return (
    <div className={`flex gap-3 px-4 py-3 ${isUser ? "flex-row-reverse" : ""}`}
      title={formatFullTime(message.createdAt)}>
      {isFailed && isUser ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-500 text-sm font-bold">
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
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white select-none ${
            isUser ? "bg-blue-500" : "bg-emerald-500"
          } ${avatarCursor}`}
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

      <div className={`max-w-[75%] ${isUser ? "text-right" : ""}`}>
        {!isUser && <p className="mb-1 text-xs font-medium text-gray-500">{message.senderName || "Agent"}</p>}
        <div className={`inline-block rounded-2xl px-4 py-2 text-sm leading-relaxed ${
          isFailed && isUser
            ? "bg-red-50 text-gray-800 border border-red-200"
            : isUser
              ? "bg-chat-bubble-user text-gray-900"
              : "bg-chat-bubble-agent text-gray-800"
        }`}>
          {thinkingSteps.length > 0 && <ThinkingBlock steps={thinkingSteps} />}
          {message.content && <MarkdownBubble text={message.content} />}
          {message.artifacts.map((a) => <CardRenderer key={a.id} artifact={a} />)}
        </div>
        {isFailed && isUser && (
          <p className="mt-1 text-xs text-red-500 flex items-center gap-1 justify-end">
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
    <div className="flex gap-3 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-medium text-white">
        {(agentName || "A").charAt(0)}
      </div>
      <div className="max-w-[75%]">
        <p className="mb-1 text-xs font-medium text-gray-500">{agentName || "Agent"}</p>
        <div className="inline-block rounded-2xl px-4 py-2 text-sm leading-relaxed bg-chat-bubble-agent text-gray-800">
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
    <div className="flex gap-3 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-medium text-white">A</div>
      <div className="max-w-[75%]">
        <div className="inline-block rounded-2xl px-4 py-2 bg-chat-bubble-agent">
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
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
    <div ref={containerRef} className="flex-1 overflow-y-auto relative">
      {onLoadMore && <div ref={topSentinelRef} className="h-1" />}
      {isFetchingMore && (
        <div className="flex justify-center py-2">
          <span className="text-xs text-gray-400">加载历史消息...</span>
        </div>
      )}
      {!hasMore && messages.length > 0 && onLoadMore && (
        <div className="flex justify-center py-2">
          <span className="text-xs text-gray-300">已加载全部消息</span>
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
      <div ref={bottomSentinelRef} className="h-1" />
      {!isAtBottom && unreadCount > 0 && (
        <div className="sticky bottom-6 flex justify-end pr-4 z-10">
          <button
            onClick={scrollToBottom}
            className="flex items-center justify-center
              bg-blue-500 text-white text-xs font-bold rounded-full w-10 h-10
              shadow-lg hover:bg-blue-600 transition-all
              animate-[slide-up_200ms_ease-out]"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </button>
        </div>
      )}
    </div>
  );
}
