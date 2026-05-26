import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useChatStore } from "@/stores/chatStore";
import { useMessages } from "@/hooks/useMessages";
import { useAgents } from "@/hooks/useAgents";
import { useCreateConversation, useUpdateAnyConversation } from "@/hooks";
import { createSSEStream } from "@/lib/sse";
import { messageApi } from "@/lib/api";
import { ChatHeader, MessageList, ChatInput } from "@/components/chat";
import { AgentProgressBar } from "@/components/chat/AgentProgressBar";
import { AgentDashboard } from "@/components/chat/AgentDashboard";
import { MentionSwitchDialog } from "@/components/chat/MentionSwitchDialog";
import { useDashboardStore } from "@/stores/dashboardStore";
import { useTokenUsageStore, estimateCost } from "@/stores/tokenUsageStore";
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
  const retryRef = useRef({ count: 0, timeoutId: null as ReturnType<typeof setTimeout> | null });

  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const retryCount = useChatStore((s) => s.retryCount);
  const setConnectionStatus = useChatStore((s) => s.setConnectionStatus);
  const setRetryCount = useChatStore((s) => s.setRetryCount);

  const agentStatuses = useDashboardStore((s) => s.agentStatuses);
  const updateAgentStatus = useDashboardStore((s) => s.updateAgentStatus);
  const clearAgentStatuses = useDashboardStore((s) => s.clearStatuses);
  const dashboardOpen = useDashboardStore((s) => s.dashboardOpen);
  const toggleDashboard = useDashboardStore((s) => s.toggleDashboard);
  const setDashboardOpen = useDashboardStore((s) => s.setDashboardOpen);

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
    clearAgentStatuses();
    return () => disconnectRef.current?.();
  }, [activeId]);

  const executeSend = useCallback((convId: string, content: string, mentions: string[], conv: Conversation | undefined) => {
    setConnectionStatus('connected');
    setRetryCount(0);
    retryRef.current.count = 0;
    if (retryRef.current.timeoutId) {
      clearTimeout(retryRef.current.timeoutId);
      retryRef.current.timeoutId = null;
    }

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
    const optimisticId = optimisticMsg.id;
    messageApi.send(convId, { content, mentions, mode: msgMode }).catch(() => {
      qc.setQueryData(
        ["messages", activeId ?? convId],
        (old: InfiniteData<MessageListData> | undefined) => {
          if (!old) return old;
          const newPages = old.pages.map((page) => ({
            ...page,
            items: page.items.map((m) =>
              m.id === optimisticId ? { ...m, status: "failed" as const } : m,
            ),
          }));
          return { ...old, pages: newPages };
        },
      );
      toast.error("消息发送失败", {
        action: { label: "重试", onClick: () => executeSend(convId, content, mentions, conv) },
        duration: 5000,
      });
    });

    disconnectRef.current?.();
    setIsStreaming(true);

    disconnectRef.current = createSSEStream(convId, {
      onMessageStart: (data: SSEMessageStart) => {
        if (useChatStore.getState().connectionStatus === 'reconnecting') {
          setConnectionStatus('connected');
          setRetryCount(0);
          retryRef.current.count = 0;
        }
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
        updateAgentStatus({
          agentId: data.agent.id,
          agentName: data.agent.name,
          status: data.status,
          progress: data.progress,
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
      onMessageEnd: (data: SSEMessageEnd) => {
        if (streamMsgIdRef.current) {
          finalizeStreaming(streamMsgIdRef.current);
          streamMsgIdRef.current = null;
        }
        setIsStreaming(false);
        qc.invalidateQueries({ queryKey: ["messages", convId] });
        if (useDashboardStore.getState().allDone()) {
          clearAgentStatuses();
        }
        if (retryRef.current.timeoutId) {
          clearTimeout(retryRef.current.timeoutId);
          retryRef.current.timeoutId = null;
        }
        if (data.usage && conv) {
          useTokenUsageStore.getState().addUsage({
            conversationId: convId,
            conversationTitle: conv.title,
            inputTokens: data.usage.input_tokens,
            outputTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
            estimatedCost: estimateCost(data.usage.input_tokens, data.usage.output_tokens, conv.agentIds[0]),
          });
        }
      },
      onError: (data: SSEError) => {
        toast.error(data.message || "Agent 响应出错");
        setIsStreaming(false);
      },
      onConnectionError: () => {
        const MAX_RETRIES = 3;
        const delays = [1000, 2000, 4000];
        const attempt = retryRef.current.count;

        if (attempt >= MAX_RETRIES) {
          setConnectionStatus('failed');
          setIsStreaming(false);
          if (streamMsgIdRef.current) {
            finalizeStreaming(streamMsgIdRef.current);
            streamMsgIdRef.current = null;
          }
          qc.invalidateQueries({ queryKey: ["messages", convId] });
          return;
        }

        setConnectionStatus('reconnecting');
        setRetryCount(attempt + 1);
        retryRef.current.count = attempt + 1;

        const delay = delays[attempt];
        retryRef.current.timeoutId = setTimeout(() => {
          disconnectRef.current?.();
          disconnectRef.current = createSSEStream(convId, {
            onMessageStart: (data: SSEMessageStart) => {
              setConnectionStatus('connected');
              setRetryCount(0);
              retryRef.current.count = 0;
              streamMsgIdRef.current = data.message_id;
              streamAgentRef.current = data.sender.name;
              initStreaming(data.message_id);
            },
            onToken: (data: SSEToken) => {
              if (streamMsgIdRef.current) appendToken(streamMsgIdRef.current, data.delta);
            },
            onArtifact: (data: SSEArtifact) => {
              if (streamMsgIdRef.current) appendArtifact(streamMsgIdRef.current, data.artifact);
            },
            onAgentStatus: (data: SSEAgentStatus) => {
              updateAgentStatus({ agentId: data.agent.id, agentName: data.agent.name, status: data.status, progress: data.progress });
            },
            onThinking: (data: SSEThinking) => {
              if (streamMsgIdRef.current) {
                appendThinkingStep(streamMsgIdRef.current, { phase: data.phase, text: data.text, toolName: data.tool_name, status: data.status });
              }
            },
            onMessageEnd: (data: SSEMessageEnd) => {
              if (streamMsgIdRef.current) {
                finalizeStreaming(streamMsgIdRef.current);
                streamMsgIdRef.current = null;
              }
              setIsStreaming(false);
              qc.invalidateQueries({ queryKey: ["messages", convId] });
              if (useDashboardStore.getState().allDone()) clearAgentStatuses();
              if (retryRef.current.timeoutId) { clearTimeout(retryRef.current.timeoutId); retryRef.current.timeoutId = null; }
              if (data.usage && conv) {
                useTokenUsageStore.getState().addUsage({
                  conversationId: convId, conversationTitle: conv.title,
                  inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens,
                  totalTokens: data.usage.input_tokens + data.usage.output_tokens,
                  estimatedCost: estimateCost(data.usage.input_tokens, data.usage.output_tokens, conv.agentIds[0]),
                });
              }
            },
            onError: (data: SSEError) => {
              toast.error(data.message || "Agent 响应出错");
              setIsStreaming(false);
            },
            onConnectionError: () => {
              setConnectionStatus('failed');
              setIsStreaming(false);
              if (streamMsgIdRef.current) { finalizeStreaming(streamMsgIdRef.current); streamMsgIdRef.current = null; }
              qc.invalidateQueries({ queryKey: ["messages", convId] });
            },
          });
        }, delay);
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

  const handleManualReconnect = useCallback(() => {
    if (!activeId || !conversation) return;
    setConnectionStatus('connected');
    setRetryCount(0);
    retryRef.current.count = 0;
    executeSend(activeId, "", [], conversation);
  }, [activeId, conversation, setConnectionStatus, setRetryCount, executeSend]);

  const handleDismissBanner = useCallback(() => {
    setConnectionStatus('connected');
    setRetryCount(0);
  }, [setConnectionStatus, setRetryCount]);

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
      {connectionStatus === 'reconnecting' && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="flex-1">连接已断开，正在重连... ({retryCount}/3)</span>
        </div>
      )}
      {connectionStatus === 'failed' && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span className="flex-1">连接失败，请检查网络</span>
          <button onClick={handleManualReconnect} className="rounded px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">
            重连
          </button>
          <button onClick={handleDismissBanner} className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-100 transition-colors">
            关闭
          </button>
        </div>
      )}
      {conversation.type === "group" && (
        <>
          <div onClick={toggleDashboard} className="cursor-pointer">
            <AgentProgressBar agents={agentStatuses} />
          </div>
          <AgentDashboard
            agents={agentStatuses}
            open={dashboardOpen}
            onClose={() => setDashboardOpen(false)}
          />
        </>
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