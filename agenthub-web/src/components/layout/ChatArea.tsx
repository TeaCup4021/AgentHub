import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banner, Button, Empty, Skeleton } from "@douyinfe/semi-ui";
import { IconComment } from "@douyinfe/semi-icons";
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
  const lastPromptRef = useRef<string>("");
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
    isLoading,
    fetchNextPage,
  } = useMessages(activeId ?? "");
  const messageSearch = useChatStore((s) => s.messageSearch);
  const rawMessages = useMemo(
    () => messagesData?.pages.flatMap((p) => p.items).reverse() ?? [],
    [messagesData],
  );
  const filteredMessages = useMemo(() => {
    if (!messageSearch) return rawMessages;
    const q = messageSearch.toLowerCase();
    return rawMessages.filter((m) => m.content.toLowerCase().includes(q));
  }, [rawMessages, messageSearch]);
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
    disconnectRef.current?.();
    if (streamMsgIdRef.current) {
      finalizeStreaming(streamMsgIdRef.current);
    }
    streamMsgIdRef.current = null;
    streamAgentRef.current = "";
    setIsStreaming(false);
    clearAgentStatuses();

    return () => {
      disconnectRef.current?.();
      if (streamMsgIdRef.current) {
        finalizeStreaming(streamMsgIdRef.current);
        streamMsgIdRef.current = null;
        streamAgentRef.current = "";
      }
      setIsStreaming(false);
    };
  }, [activeId]);

  const buildCallbacks = useCallback((convId: string, conv: Conversation | undefined) => ({
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
      if (streamMsgIdRef.current) appendArtifact(streamMsgIdRef.current, data.artifact);
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
          agentName: streamAgentRef.current || "Agent",
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
  }), [qc, setIsStreaming, initStreaming, appendToken, appendArtifact, appendThinkingStep, finalizeStreaming, setConnectionStatus, setRetryCount, updateAgentStatus, clearAgentStatuses]);

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
    messageApi.send(convId, { content, mentions, mode: msgMode }).then((response) => {
      const realMsg = response.data?.data as Message | undefined;
      if (!realMsg) return;
      qc.setQueryData(
        ["messages", activeId ?? convId],
        (old: InfiniteData<MessageListData> | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((m) => (m.id === optimisticId ? realMsg : m)),
            })),
          };
        },
      );
    }).catch(() => {
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
    lastPromptRef.current = content;

    const onConnectionError = () => {
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
        const reconnectCallbacks = buildCallbacks(convId, conv);
        disconnectRef.current = createSSEStream(convId, {
          ...reconnectCallbacks,
          onConnectionError: () => {
            setConnectionStatus('failed');
            setIsStreaming(false);
            if (streamMsgIdRef.current) { finalizeStreaming(streamMsgIdRef.current); streamMsgIdRef.current = null; }
            qc.invalidateQueries({ queryKey: ["messages", convId] });
          },
        }, lastPromptRef.current);
      }, delay);
    };

    disconnectRef.current = createSSEStream(convId, {
      ...buildCallbacks(convId, conv),
      onConnectionError,
    }, content);
  }, [activeId, qc, setIsStreaming, initStreaming, appendToken, appendArtifact, appendThinkingStep, finalizeStreaming, setConnectionStatus, setRetryCount, updateAgentStatus, clearAgentStatuses]);

  sendRef.current = (convId: string, content: string, mentions: string[]) => {
    const conv = conversations.find((c) => c.id === convId);
    executeSend(convId, content, mentions, conv);
  };

  const handleRegenerate = useCallback((convId: string, msgId: string) => {
    const messagesData = qc.getQueryData(["messages", convId]) as
      | { pages?: { items: Message[] }[] }
      | undefined;
    const allMessages = messagesData?.pages?.flatMap((p) => p.items) ?? [];
    const failedMsg = allMessages.find((m) => m.id === msgId);
    if (!failedMsg) return;

    const parentUserMsg = allMessages.find(
      (m) => m.senderType === "user" && m.id === failedMsg.parentMessageId,
    );

    if (parentUserMsg) {
      const conv = conversations.find((c) => c.id === convId);
      if (convId !== activeId) {
        useChatStore.getState().setActiveConversation(convId);
        setTimeout(() => {
          executeSend(convId, parentUserMsg.content, [], conv);
        }, 100);
      } else {
        executeSend(convId, parentUserMsg.content, [], conv);
      }
    }
  }, [qc, activeId, conversations, executeSend]);

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

  const handleStop = useCallback(() => {
    disconnectRef.current?.();
    if (streamMsgIdRef.current) {
      finalizeStreaming(streamMsgIdRef.current);
      streamMsgIdRef.current = null;
    }
    setIsStreaming(false);
    clearAgentStatuses();
    if (retryRef.current.timeoutId) {
      clearTimeout(retryRef.current.timeoutId);
      retryRef.current.timeoutId = null;
    }
  }, [finalizeStreaming, setIsStreaming, clearAgentStatuses]);

  if (!conversation) {
    return (
      <div style={{ display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Empty
          image={<IconComment style={{ fontSize: 64, color: "var(--color-text-disabled)" }} />}
          title="选择或创建一个对话开始"
          description="与 AI Agent 协作，生成代码、文档和更多产出"
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <ChatHeader conversation={conversation} agents={agents} />
        <div style={{ flex: 1, padding: 24 }}>
          <Skeleton placeholder={<Skeleton.Paragraph rows={8} />} loading={true} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader conversation={conversation} agents={agents} />
      {connectionStatus === 'reconnecting' && (
        <Banner
          type="warning"
          closeIcon={null}
          title={`连接已断开，正在重连... (${retryCount}/3)`}
          style={{ borderRadius: 0 }}
        />
      )}
      {connectionStatus === 'failed' && (
        <Banner
          type="danger"
          title="连接失败，请检查网络"
          style={{ borderRadius: 0 }}
        >
          <Button size="small" onClick={handleManualReconnect}>重连</Button>
          <Button size="small" theme="borderless" onClick={handleDismissBanner} style={{ marginLeft: 8 }}>关闭</Button>
        </Banner>
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
        messages={filteredMessages}
        agents={agents}
        streamingMessageId={streamMsgIdRef.current}
        streamingAgentName={streamAgentRef.current}
        isWaiting={isStreaming && !streamMsgIdRef.current}
        hasMore={!!hasNextPage}
        isFetchingMore={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        searchText={messageSearch}
        onRegenerate={handleRegenerate}
      />
      {filteredMessages.length === 0 && !isStreaming && (
        <div style={{
          padding: "0 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}>
          <p style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--color-text-tertiary)",
            textAlign: "center",
            marginBottom: 4,
          }}>
            试试这些话题：
          </p>
          {["帮我写一个 React 组件", "解释一下这段代码", "帮我设计一个 API 接口"].map((starter) => (
            <button
              key={starter}
              onClick={() => handleSend(starter, [])}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 16px",
                border: "1px solid var(--color-border-light)",
                borderRadius: "var(--radius-md)",
                background: "var(--color-bg-elevated)",
                fontSize: "var(--font-size-md)",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                transition: "all var(--duration-fast) var(--ease-out)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
                e.currentTarget.style.color = "var(--color-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-light)";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
            >
              {starter}
            </button>
          ))}
        </div>
      )}
      <ChatInput key={activeId} onSend={handleSend} onStop={handleStop} disabled={isStreaming} agents={agents} />

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