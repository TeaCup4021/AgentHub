import { useState, useCallback, useEffect, useRef, useLayoutEffect, memo } from "react";
import { Spin, Badge, Tooltip } from "@douyinfe/semi-ui";
import { motion } from "framer-motion";
import { IconBookmark } from "@douyinfe/semi-icons";
import { useChatStore } from "@/stores/chatStore";
import { AgentDetailPopover } from "./AgentDetailPopover";
import { AgentAvatarContextMenu } from "./AgentAvatarContextMenu";
import { MarkdownBubble } from "./MarkdownBubble";
import { MessageActions } from "./MessageActions";
import { formatTime, formatFullTime } from "@/lib/formatTime";
import { getAgentColor } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CardRenderer } from "@/components/cards";
import type { Agent, Message, ThinkingStep, PlanSubtask, Artifact } from "@/types";
import { ThinkingBlock } from "./ThinkingBlock";
import { MessageContextMenu } from "./MessageContextMenu";
import { OrchestratorPlan } from "./OrchestratorPlan";

function renderFallbackCards(content: string, existingArtifacts: Artifact[]) {
  const hasArtifactType = (type: string) => existingArtifacts.some((a) => a.artifactType === type);
  const cards: React.ReactNode[] = [];

  if (!hasArtifactType("diff")) {
    let idx = 0;
    const makeDiffCard = (oldCode: string, newCode: string, title: string) => {
      const fallback: Artifact = {
        id: `fallback-diff-${idx++}`,
        artifactType: "diff",
        title,
        content: { oldCode, newCode, language: "diff", fileName: "" },
        version: 1,
        createdAt: new Date().toISOString(),
      };
      cards.push(<CardRenderer key={fallback.id} artifact={fallback} />);
    };

    // 1. Explicit ```diff blocks
    const diffRe = /```diff\n([\s\S]*?)```/g;
    let match;
    while ((match = diffRe.exec(content)) !== null) {
      const oldLines: string[] = [];
      const newLines: string[] = [];
      for (const line of match[1].split("\n")) {
        if (line.startsWith("-")) oldLines.push(line.slice(1));
        else if (line.startsWith("+")) newLines.push(line.slice(1));
        else { oldLines.push(line); newLines.push(line); }
      }
      makeDiffCard(oldLines.join("\n"), newLines.join("\n"), "变更对比");
    }

    // 2. Paired code blocks: "修改前/before" followed by "修改后/after"
    if (idx === 0) {
      const pairRe = /(?:修改前|before|原始|旧代码|old)[\s\S]*?```\w*\n([\s\S]*?)```[\s\S]*?(?:修改后|after|修改|新代码|new)[\s\S]*?```\w*\n([\s\S]*?)```/gi;
      let pm;
      while ((pm = pairRe.exec(content)) !== null) {
        makeDiffCard(pm[1].trim(), pm[2].trim(), "变更对比");
      }
    }

    // 3. Any code block with +/- diff lines (even without diff language tag)
    if (idx === 0) {
      const codeRe = /```(\w*)\n([\s\S]*?)```/g;
      let cm;
      while ((cm = codeRe.exec(content)) !== null) {
        const lang = cm[1];
        if (lang === "diff") continue;
        const body = cm[2];
        const hasDiffMarkers = /^[+-]/m.test(body) && (body.includes("\n-") || body.includes("\n+"));
        if (!hasDiffMarkers) continue;
        const oldLines: string[] = [];
        const newLines: string[] = [];
        for (const line of body.split("\n")) {
          if (line.startsWith("-")) oldLines.push(line.slice(1));
          else if (line.startsWith("+")) newLines.push(line.slice(1));
          else { oldLines.push(line); newLines.push(line); }
        }
        if (oldLines.length > 0) {
          makeDiffCard(oldLines.join("\n"), newLines.join("\n"), "变更对比");
        }
      }
    }
  }

  if (!hasArtifactType("link_preview")) {
    const urlRe = /https?:\/\/[^\s\)\]>]+/g;
    let match;
    const seen = new Set<string>();
    let idx = 0;
    while ((match = urlRe.exec(content)) !== null) {
      const url = match[0].replace(/[.,;:!?\"')\]]*$/, "");
      if (seen.has(url)) continue;
      seen.add(url);
      const fallback: Artifact = {
        id: `fallback-link-${idx++}`,
        artifactType: "link_preview",
        title: url,
        content: { url },
        version: 1,
        createdAt: new Date().toISOString(),
      };
      cards.push(<CardRenderer key={fallback.id} artifact={fallback} />);
    }
  }

  return cards;
}

const FIVE_MINUTES = 5 * 60 * 1000;

const TimeSeparator = memo(function TimeSeparator({ time }: { time: string }) {
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
});

const MessageBubble = memo(function MessageBubble({ message, agents, searchText, onRegenerate, onConfirmPlan, onAdjustPlan, onRefinePlan, dagTaskId, onPin, onUnpin }: {
  message: Message;
  agents: Agent[];
  searchText?: string;
  onRegenerate?: (convId: string, msgId: string) => void;
  onConfirmPlan?: (planId: string, subtasks: PlanSubtask[]) => void;
  onAdjustPlan?: (subtasks: PlanSubtask[]) => void;
  onRefinePlan?: () => void;
  dagTaskId?: string | null;
  onPin?: (msgId: string) => void;
  onUnpin?: (msgId: string) => void;
  scrollToMessageId?: string | null;
}) {
  const isUser = message.senderType === "user";
  const isOrchestrator = message.senderType === "orchestrator";
  const isPlan = message.contentType === "plan";
  const planMeta = isPlan ? (message.meta as { planId: string; subtasks: PlanSubtask[]; plannerAgentName?: string | null; plannerAgentId?: string | null } | null) : null;
  const hasSummary = message.meta?.summary != null;
  const agent = !isUser && !isOrchestrator && message.senderId
    ? agents.find((a) => a.id === message.senderId)
    : null;

  const avatarRef = useRef<HTMLDivElement>(null);
  const [showPopover, setShowPopover] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showMsgMenu, setShowMsgMenu] = useState(false);
  const [msgMenuPos, setMsgMenuPos] = useState({ top: 0, left: 0 });
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
  const pinnedIds = useChatStore((s) => s.pinnedMessageIds);
  const isPinned = !isUser && !isOrchestrator && pinnedIds.includes(message.id);
  const avatarCursor = agent ? "pointer" : "";

  return (
    <div
      id={`msg-${message.id}`}
      style={{
        display: "flex",
        gap: 12,
        padding: isPinned ? "12px 16px 12px 13px" : "12px 16px",
        flexDirection: isUser ? "row-reverse" : "row",
        borderLeft: isPinned ? "3px solid var(--color-primary)" : "3px solid transparent",
      }}
      title={formatFullTime(message.createdAt)}
      onContextMenu={(e) => { if (onPin && onUnpin) { e.preventDefault(); setMsgMenuPos({ top: e.clientY, left: e.clientX }); setShowMsgMenu(true); } }}
    >
      {isFailed ? (
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
            background: isUser
              ? "var(--color-gray-600)"
              : isOrchestrator
                ? "var(--color-gray-400)"
                : getAgentColor(message.senderName || "A"),
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
      {showMsgMenu && onPin && onUnpin && (
          <MessageContextMenu
            isPinned={message.isPinned}
            position={msgMenuPos}
            onPin={() => onPin(message.id)}
            onUnpin={() => onUnpin(message.id)}
            onClose={() => setShowMsgMenu(false)}
          />
        )}
        {showMenu && agent && (
        <AgentAvatarContextMenu agentName={agent.name} position={menuPos} onClose={closeAll} />
      )}

      <div style={{ maxWidth: "75%", textAlign: isUser ? "right" : "left" }}>
        {!isUser && (
          <p style={{ marginBottom: 4, fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
            {message.senderName || "Agent"}
            {isFailed && (
              <span style={{ color: "var(--color-danger)", fontWeight: 400 }}>
                响应失败
              </span>
            )}
          </p>
        )}
        <div className="message-bubble-wrap" style={{ position: "relative", display: "inline-block" }}>
          {message.isPinned && (
            <div style={{ position: "absolute", top: 6, right: 8, zIndex: 4 }}>
              <Tooltip content="已 Pin 为长期上下文">
                <IconBookmark style={{ color: "var(--color-warning)", fontSize: 14 }} />
              </Tooltip>
            </div>
          )}
          <div style={{
            borderRadius: "var(--radius-lg)",
            padding: "8px 16px",
            fontSize: "var(--font-size-md)",
            lineHeight: 1.6,
            background: isFailed
              ? "var(--color-bg-hover)"
              : isUser
                ? "var(--color-bubble-user-bg)"
                : "var(--color-bubble-agent-bg)",
            color: isUser ? "var(--color-bubble-user-text)" : "var(--color-text-primary)",
            border: isFailed
              ? "1px solid var(--color-danger)"
              : !isUser
                ? "1px solid var(--color-bubble-agent-border)"
                : "none",
            boxShadow: !isUser ? "var(--shadow-sm)" : "none",
          }}>
            <ErrorBoundary label="消息渲染">
              {isPlan && planMeta ? (
                <OrchestratorPlan
                  planId={planMeta.planId}
                  subtasks={planMeta.subtasks}
                  plannerAgentName={planMeta.plannerAgentName}
                  agents={agents.map((a) => ({ id: a.id, name: a.name }))}
                  onConfirm={() => onConfirmPlan?.(planMeta.planId, planMeta.subtasks)}
                  onAdjust={(subtasks) => onAdjustPlan?.(subtasks)}
                  onRefine={onRefinePlan}
                />
              ) : (
                <>
                  {thinkingSteps.length > 0 && <ThinkingBlock steps={thinkingSteps} />}
                  {message.content && (
                    <MarkdownBubble
                      text={searchText ? highlightText(message.content, searchText) : message.content}
                    />
                  )}
                  {message.attachments && message.attachments.map((att) => (
                    <div key={att.id} style={{ marginTop: 8 }}>
                      {att.fileType.startsWith("image/") ? (
                        <img src={att.fileUrl} alt={att.fileName} style={{ maxWidth: 320, maxHeight: 240, borderRadius: "var(--radius-sm)", cursor: "pointer" }} />
                      ) : (
                        <a href={att.fileUrl} download={att.fileName} style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                          border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)",
                          color: "var(--color-text-secondary)", textDecoration: "none", fontSize: "var(--font-size-sm)",
                        }}>
                          {att.fileName} ({att.fileSize > 0 ? `${(att.fileSize / 1024).toFixed(1)} KB` : "未知大小"})
                        </a>
                      )}
                    </div>
                  ))}
                  {message.artifacts.map((a) => <CardRenderer key={a.id} artifact={a} />)}
                  {message.status === "done" && renderFallbackCards(message.content, message.artifacts)}
                </>
              )}
            </ErrorBoundary>
          </div>
          {hasSummary && dagTaskId && (
            <div
              onClick={() => window.dispatchEvent(new CustomEvent("open-react-panel", { detail: { tab: "dag" } }))}
              style={{
                fontSize: 11,
                color: "var(--color-primary)",
                cursor: "pointer",
                marginTop: 4,
                userSelect: "none",
              }}
            >
              查看任务图 →
            </div>
          )}
          <MessageActions
            message={message}
            isStreaming={message.status === "streaming"}
            isFailed={message.status === "failed"}
            onRegenerate={onRegenerate}
          />
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
});

const StreamingMessageBubble = memo(function StreamingMessageBubble({ messageId, agentName }: { messageId: string; agentName: string }) {
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
        background: getAgentColor(agentName),
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
          <ErrorBoundary label="流式消息渲染">
            {sc.thinkingSteps.length > 0 && <ThinkingBlock steps={sc.thinkingSteps} isStreaming />}
            {sc.content && <MarkdownBubble text={sc.content} isStreaming />}
            {sc.artifacts.map((a) => <CardRenderer key={a.id} artifact={a} />)}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
});

const PendingMessageBubble = memo(function PendingMessageBubble() {
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "var(--color-primary)",
        color: "#fff",
        fontSize: "var(--font-size-sm)",
        fontWeight: 600,
        flexShrink: 0,
      }}>
        <span className="pending-dot-bounce">···</span>
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
});

function highlightText(text: string, query: string): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), "<mark>$1</mark>");
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
  searchText?: string;
  onRegenerate?: (convId: string, msgId: string) => void;
  onConfirmPlan?: (planId: string, subtasks: PlanSubtask[]) => void;
  onAdjustPlan?: (subtasks: PlanSubtask[]) => void;
  onRefinePlan?: () => void;
  dagTaskId?: string | null;
  onPin?: (msgId: string) => void;
  onUnpin?: (msgId: string) => void;
  scrollToMessageId?: string | null;
}

export function MessageList({
  messages, agents, streamingMessageId, streamingAgentName,
  isWaiting, hasMore, isFetchingMore, onLoadMore, searchText, onRegenerate,
  onConfirmPlan, onAdjustPlan, onRefinePlan, dagTaskId, onPin, onUnpin, scrollToMessageId,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevVisibleCountRef = useRef(0);
  const firstMsgIdRef = useRef<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleCount =
    messages.length + (streamingMessageId ? 1 : 0) + (isWaiting ? 1 : 0);

  const scrollToBottom = useCallback(() => {
    bottomSentinelRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Scroll to a specific message by id
  useEffect(() => {
    if (!scrollToMessageId) return;
    const el = document.querySelector(`[data-message-id="${scrollToMessageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Use ref so the timer survives React cleanup when scrollToMessageId
      // is reset by handleJumpToMessage (which clears it after 100ms).
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        el.classList.add("message-flash");
        setTimeout(() => {
          el.classList.remove("message-flash");
          flashTimerRef.current = null;
        }, 1500);
      }, 400);
    }
  }, [scrollToMessageId]);

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

  useEffect(() => {
    const handleScrollTo = (e: Event) => {
      const { messageId } = (e as CustomEvent<{ messageId: string }>).detail;
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.style.transition = "background 0.3s";
        el.style.background = "var(--color-bg-active)";
        setTimeout(() => { el.style.background = ""; }, 1500);
      }
    };
    window.addEventListener("scroll-to-message", handleScrollTo);
    return () => window.removeEventListener("scroll-to-message", handleScrollTo);
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
          <motion.div
            key={msg.id}
            data-message-id={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
          >
            {needSeparator && <TimeSeparator time={msg.createdAt} />}
            <MessageBubble message={msg} agents={agents} searchText={searchText} onRegenerate={onRegenerate} onConfirmPlan={onConfirmPlan} onAdjustPlan={onAdjustPlan} onRefinePlan={onRefinePlan} dagTaskId={dagTaskId} onPin={onPin} onUnpin={onUnpin} />
          </motion.div>
        );
      })}
      {streamingMessageId && streamingAgentName && (
        <StreamingMessageBubble messageId={streamingMessageId} agentName={streamingAgentName} />
      )}
      {isWaiting && !streamingMessageId && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
        >
          <PendingMessageBubble />
        </motion.div>
      )}
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
                background: "var(--color-bg-chat)",
                color: "var(--color-gray-600)",
                fontSize: "var(--font-size-xs)",
                fontWeight: 700,
                border: "1px solid var(--color-gray-200)",
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
