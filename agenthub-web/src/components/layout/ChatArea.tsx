import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/stores/chatStore";
import { useMessages } from "@/hooks/useMessages";
import { useAgents } from "@/hooks/useAgents";
import { useCreateConversation, useUpdateAnyConversation } from "@/hooks";
import { createSSEStream } from "@/lib/sse";
import { messageApi } from "@/lib/api";
import { ChatHeader, MessageList, ChatInput } from "@/components/chat";
import { AgentProgressBar } from "@/components/chat/AgentProgressBar";
import { MentionSwitchDialog } from "@/components/chat/MentionSwitchDialog";
import type { AgentProgress } from "@/components/chat/AgentProgressBar";
import type { InfiniteData } from "@tanstack/react-query";
import type { SSEMessageStart, SSEToken, SSEArtifact, SSEAgentStatus, SSEThinking, SSEMessageEnd, SSEError, Conversation, Message, MessageListData } from "@/types";

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
  const appendThinkingStep = useChatStore((s) => s.appendThinkingStep);
  const finalizeStreaming = useChatStore((s) => s.finalizeStreamingMessage);

  const disconnectRef = useRef<(() => void) | null>(null);
  const streamMsgIdRef = useRef<string | null>(null);
  const streamAgentRef = useRef<string>("");
  const [agentStatuses, setAgentStatuses] = useState<AgentProgress[]>([]);

  const qc = useQueryClient();
  const {
    data: messagesData,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useMessages(activeId ?? "");
  const rawMessages = useMemo(
    () => messagesData?.pages.flatMap((p) => p.items).reverse() ?? [],
    [messagesData],
  );
  const { data: agents = [] } = useAgents();
  const createConversation = useCreateConversation();
  const updateConversation = useUpdateAnyConversation();

  const conversation = conversations.find((c) => c.id === activeId);

  interface SwitchData {
    content: string;
    mentions: string[];
    externalAgentIds: string[];
    externalAgentNames: string[];
  }
  const [switchData, setSwitchData] = useState<SwitchData | null>(null);
  const sendRef = useRef<(convId: string, content: string, mentions: string[]) => void>(null!);

  useEffect(() => {
    setAgentStatuses([]);
    return () => disconnectRef.current?.();
  }, [activeId]);

  const executeSend = useCallback((convId: string, content: string, mentions: string[], conv: Conversation | undefined) => {
    const now = new Date().toISOString();
    const optimisticMsg: Message = {
      id: `msg-opt-${Date.now()}`,
      conversationId: convId,
      senderType: "user",
      senderId: "user-1",
      senderName: "我",
      contentType: "text",
      content,
      artifacts: [],
      status: "done",
      meta: null,
      createdAt: now,
      updatedAt: now,
    };

    qc.setQueryData(
      ["messages", activeId ?? convId],
      (old: InfiniteData<MessageListData> | undefined) => {
        if (!old) return old;
        const newPages = old.pages.map((page, i) => {
          if (i === 0) {
            return { ...page, items: [optimisticMsg, ...page.items] };
          }
          return page;
        });
        return { ...old, pages: newPages };
      },
    );

    const msgMode = conv?.type === "group" ? "auto_orchestrate" : "direct";
    messageApi.send(convId, { content, mentions, mode: msgMode }).catch((err) => {
      console.error("消息发送失败:", err);
      qc.invalidateQueries({ queryKey: ["messages", convId] });
    });

    disconnectRef.current?.();
    setIsStreaming(true);

    disconnectRef.current = createSSEStream(convId, {
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
      onAgentStatus: (data: SSEAgentStatus) => {
        setAgentStatuses((prev) => {
          const idx = prev.findIndex((p) => p.agentId === data.agent.id);
          const entry: AgentProgress = {
            agentId: data.agent.id,
            agentName: data.agent.name,
            status: data.status,
            progress: data.progress,
          };
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = entry;
            return updated;
          }
          return [...prev, entry];
        });
      },
      onThinking: (data: SSEThinking) => {
        if (streamMsgIdRef.current) {
          appendThinkingStep(streamMsgIdRef.current, {
            phase: data.phase,
            text: data.text,
            toolName: data.tool_name,
            status: data.status,
          });
        }
      },
      onMessageEnd: (_data: SSEMessageEnd) => {
        if (streamMsgIdRef.current) {
          finalizeStreaming(streamMsgIdRef.current);
          streamMsgIdRef.current = null;
        }
        setIsStreaming(false);
        qc.invalidateQueries({ queryKey: ["messages", convId] });
        setAgentStatuses((prev) => {
          if (prev.length === 0) return prev;
          if (prev.every((a) => a.status === "success" || a.status === "failed" || a.status === "timeout")) {
            return [];
          }
          return prev;
        });
      },
      onError: (data: SSEError) => {
        console.error("SSE 错误:", data.message);
        setIsStreaming(false);
      },
    });
  }, [activeId, qc, setIsStreaming, initStreaming, appendToken, appendArtifact, appendThinkingStep, finalizeStreaming]);

  sendRef.current = (convId: string, content: string, mentions: string[]) => {
    const conv = conversations.find((c) => c.id === convId);
    executeSend(convId, content, mentions, conv);
  };

  const handleSend = useCallback(async (content: string, mentions: string[]) => {
    if (!activeId || !conversation) return;

    const currentIds = conversation.agentIds;
    const externalIds = mentions.filter((id) => !currentIds.includes(id));

    if (externalIds.length > 0 && conversation.type === "single") {
      const externalNames = externalIds
        .map((id) => agents.find((a) => a.id === id))
        .filter(Boolean)
        .map((a) => a!.name);

      setSwitchData({
        content,
        mentions,
        externalAgentIds: externalIds,
        externalAgentNames: externalNames,
      });
      return;
    }

    executeSend(activeId, content, mentions, conversation);
  }, [activeId, conversation, agents, executeSend]);

  const handleSwitchToSingle = useCallback(() => {
    if (!switchData || !activeId || !conversation) return;
    const externalId = switchData.externalAgentIds[0];
    const externalName = switchData.externalAgentNames[0];
    createConversation.mutate(
      { title: `与 ${externalName} 的对话`, type: "single", agentIds: [externalId] },
      {
        onSuccess: (newConv) => {
          useChatStore.getState().setActiveConversation(newConv.id);
          qc.invalidateQueries({ queryKey: ["conversations"] });
          setTimeout(() => {
            sendRef.current?.(newConv.id, switchData.content, switchData.mentions);
          }, 50);
          setSwitchData(null);
        },
      },
    );
  }, [switchData, activeId, conversation, createConversation, qc]);

  const handleConvertToGroup = useCallback(() => {
    if (!switchData || !activeId || !conversation) return;
    const allAgentIds = [...new Set([...conversation.agentIds, ...switchData.externalAgentIds])];
    updateConversation.mutate(
      { id: activeId, type: "group", agentIds: allAgentIds },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["conversations"] });
          sendRef.current?.(activeId, switchData.content, switchData.mentions);
          setSwitchData(null);
        },
      },
    );
  }, [switchData, activeId, conversation, updateConversation, qc]);

  const handleIgnore = useCallback(() => {
    if (!switchData || !activeId || !conversation) return;
    const filteredMentions = switchData.mentions.filter(
      (id) => !switchData.externalAgentIds.includes(id),
    );
    sendRef.current?.(activeId, switchData.content, filteredMentions);
    setSwitchData(null);
  }, [switchData, activeId, conversation]);

  const handleCloseSwitchDialog = useCallback(() => {
    setSwitchData(null);
  }, []);

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
      {conversation.type === "group" && (
        <AgentProgressBar agents={agentStatuses} />
      )}
      <MessageList
        messages={rawMessages}
        agents={agents}
        streamingMessageId={streamMsgIdRef.current}
        streamingAgentName={streamAgentRef.current}
        isWaiting={isStreaming && !streamMsgIdRef.current}
        hasMore={!!hasNextPage}
        isFetchingMore={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
      />
      <ChatInput key={activeId} onSend={handleSend} disabled={isStreaming} agents={agents} />

      {switchData && conversation && (
        <MentionSwitchDialog
          currentAgentName={agents.find((a) => conversation.agentIds.includes(a.id))?.name ?? "当前 Agent"}
          mentionedAgentNames={switchData.externalAgentNames}
          onSwitchToSingle={handleSwitchToSingle}
          onConvertToGroup={handleConvertToGroup}
          onIgnore={handleIgnore}
          onClose={handleCloseSwitchDialog}
        />
      )}
    </div>
  );
}