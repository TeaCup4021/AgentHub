import { useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/stores/chatStore";
import { useMessages } from "@/hooks/useMessages";
import { useAgents } from "@/hooks/useAgents";
import { createSSEStream } from "@/lib/sse";
import { messageApi } from "@/lib/api";
import { ChatHeader, MessageList, ChatInput } from "@/components/chat";
import type { SSEMessageStart, SSEToken, SSEArtifact, SSEMessageEnd, SSEError, Conversation } from "@/types";

interface ChatAreaProps {
  conversations: Conversation[];
}

export function ChatArea({ conversations }: ChatAreaProps) {
  const activeId = useChatStore((s) => s.activeConversationId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const setIsStreaming = useChatStore((s) => s.setIsStreaming);
  const initStreaming = useChatStore((s) => s.initStreamingMessage);
  const appendToken = useChatStore((s) => s.appendStreamToken);
  const appendArtifact = useChatStore((s) => s.appendStreamArtifact);
  const finalizeStreaming = useChatStore((s) => s.finalizeStreamingMessage);

  const disconnectRef = useRef<(() => void) | null>(null);
  const streamMsgIdRef = useRef<string | null>(null);
  const streamAgentRef = useRef<string>("");

  const qc = useQueryClient();
  const { data: rawMessages = [] } = useMessages(activeId ?? "");
  const { data: agents = [] } = useAgents();

  const conversation = conversations.find((c) => c.id === activeId);

  useEffect(() => { return () => disconnectRef.current?.(); }, [activeId]);

  const handleSend = useCallback(async (content: string) => {
    if (!activeId) return;
    try {
      await messageApi.send(activeId, { content, mode: "direct" });
    } catch (err) {
      console.error("消息发送失败:", err);
      setIsStreaming(false);
      return;
    }

    disconnectRef.current?.();
    setIsStreaming(true);

    disconnectRef.current = createSSEStream(activeId, {
      onMessageStart: (data: SSEMessageStart) => {
        streamMsgIdRef.current = data.message_id;
        streamAgentRef.current = data.sender.name;
        initStreaming(data.message_id);
      },
      onToken: (data: SSEToken) => {
        if (streamMsgIdRef.current) appendToken(streamMsgIdRef.current, data.delta);
      },
      onArtifact: (data: SSEArtifact) => {
        if (streamMsgIdRef.current) {
          appendArtifact(streamMsgIdRef.current, data.artifact);
        }
      },
      onMessageEnd: (_data: SSEMessageEnd) => {
        if (streamMsgIdRef.current) {
          finalizeStreaming(streamMsgIdRef.current);
          streamMsgIdRef.current = null;
        }
        setIsStreaming(false);
        qc.invalidateQueries({ queryKey: ["messages", activeId] });
      },
      onError: (data: SSEError) => {
        console.error("SSE 错误:", data.message);
        setIsStreaming(false);
      },
    });
  }, [activeId, qc, setIsStreaming, initStreaming, appendToken, appendArtifact, finalizeStreaming]);

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-400">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 opacity-40">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        <p className="text-lg">选择或创建一个对话开始</p>
        <p className="mt-1 text-sm">与 AI Agent 协作，生成代码、文档和更多产出</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader conversation={conversation} agents={agents} />
      <MessageList
        messages={rawMessages}
        streamingMessageId={streamMsgIdRef.current}
        streamingAgentName={streamAgentRef.current}
        isWaiting={isStreaming && !streamMsgIdRef.current}
      />
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}