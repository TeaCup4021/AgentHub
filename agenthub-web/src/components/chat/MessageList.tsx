import { useState, useCallback, useEffect, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import { CardRenderer } from "@/components/cards";
import { AgentDetailPopover } from "./AgentDetailPopover";
import { AgentAvatarContextMenu } from "./AgentAvatarContextMenu";
import type { Agent, Message, ThinkingStep } from "@/types";
import { ThinkingBlock } from "./ThinkingBlock";

function TextBubble({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap">{text}</p>;
}

function StreamingTextBubble({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap">
      {text}
      <span className="ml-0.5 inline-block w-1.5 h-4 bg-blue-500 animate-pulse align-text-bottom" />
    </p>
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

  const avatarCursor = agent ? "cursor-pointer" : "";

  return (
    <div className={`flex gap-3 px-4 py-3 ${isUser ? "flex-row-reverse" : ""}`}>
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

      {showPopover && agent && (
        <AgentDetailPopover agent={agent} position={popoverPos} onClose={closeAll} />
      )}
      {showMenu && agent && (
        <AgentAvatarContextMenu agentName={agent.name} position={menuPos} onClose={closeAll} />
      )}

      <div className={`max-w-[75%] ${isUser ? "text-right" : ""}`}>
        {!isUser && <p className="mb-1 text-xs font-medium text-gray-500">{message.senderName || "Agent"}</p>}
        <div className={`inline-block rounded-2xl px-4 py-2 text-sm leading-relaxed ${
          isUser ? "bg-chat-bubble-user text-gray-900" : "bg-chat-bubble-agent text-gray-800"}`}>
          {thinkingSteps.length > 0 && <ThinkingBlock steps={thinkingSteps} />}
          {message.content && <TextBubble text={message.content} />}
          {message.artifacts.map((a) => <CardRenderer key={a.id} artifact={a} />)}
        </div>
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
          {sc.content && <StreamingTextBubble text={sc.content} />}
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

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
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
      {messages.map((msg) => <MessageBubble key={msg.id} message={msg} agents={agents} />)}
      {streamingMessageId && streamingAgentName && (
        <StreamingMessageBubble messageId={streamingMessageId} agentName={streamingAgentName} />
      )}
      {isWaiting && !streamingMessageId && <PendingMessageBubble />}
    </div>
  );
}
