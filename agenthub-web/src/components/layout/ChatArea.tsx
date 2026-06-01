import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banner, Button, Spin, Select } from "@douyinfe/semi-ui";
import { useChatStore } from "@/stores/chatStore";
import { useMessages } from "@/hooks/useMessages";
import { useAgents } from "@/hooks/useAgents";
import { useCreateConversation, useUpdateAnyConversation } from "@/hooks";
import { createSSEStream } from "@/lib/sse";
import { messageApi } from "@/lib/api";
import { ChatHeader, MessageList, ChatInput, WelcomePage } from "@/components/chat";
import { AgentProgressBar } from "@/components/chat/AgentProgressBar";
import { AgentDashboard } from "@/components/chat/AgentDashboard";
import { MentionSwitchDialog } from "@/components/chat/MentionSwitchDialog";
import { ReActPanel } from "@/components/chat/ReActPanel";
import { ArtifactWorkbench } from "@/components/chat/ArtifactWorkbench";
import { useDashboardStore } from "@/stores/dashboardStore";
import { useUIStore } from "@/stores/uiStore";
import { useTokenUsageStore, estimateCost } from "@/stores/tokenUsageStore";
import type { InfiniteData } from "@tanstack/react-query";
import type { SSEMessageStart, SSEToken, SSEArtifact, SSEAgentStatus, SSEThinking, SSEMessageEnd, SSEError, Conversation, Message, MessageListData, PlanSubtask } from "@/types";

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
  const streamSenderIdRef = useRef<string>("");
  const lastPromptRef = useRef<string>("");
  const planMetaRef = useRef<{ plan: PlanSubtask[]; plannerAgentId?: string | null; plannerAgentName?: string | null } | null>(null);
  const [plannerAgentId, setPlannerAgentId] = useState<string | null>(null);
  const plannerAgentIdRef = useRef<string | null>(null);
  useEffect(() => { plannerAgentIdRef.current = plannerAgentId; }, [plannerAgentId]);
  const retryRef = useRef({ timeoutId: null as ReturnType<typeof setTimeout> | null });

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
  const dagTaskId = useChatStore((s) => s.dagTaskId);

  const taskSummary = useMemo(() => {
    const agents = agentStatuses;
    if (agents.length === 0) return null;
    const total = agents.length;
    const completed = agents.filter((a) => a.status === "success").length;
    const failed = agents.filter((a) => a.status === "failed" || a.status === "timeout").length;
    const running = agents.filter((a) => a.status === "running" || a.status === "queued").length;
    return { total, completed, failed, running, hasDag: !!dagTaskId };
  }, [agentStatuses, dagTaskId]);

  const qc = useQueryClient();
  const {
    data: messagesData,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isMessagesLoading,
    isError: isMessagesError,
    error: messagesError,
    refetch: refetchMessages,
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
  const pendingPlan = useChatStore((s) => s.pendingPlan);
  const displayMessages = useMemo(() => {
    if (!pendingPlan) return filteredMessages;
    const planMsg: Message = {
      id: `plan-${pendingPlan.planId}`,
      conversationId: activeId ?? "",
      senderType: "orchestrator",
      senderId: "orchestrator",
      senderName: pendingPlan.plannerAgentName ?? "Orchestrator",
      contentType: "plan",
      content: "",
      artifacts: [],
      status: "done",
      meta: {
        planId: pendingPlan.planId,
        subtasks: pendingPlan.subtasks,
        plannerAgentName: pendingPlan.plannerAgentName,
        plannerAgentId: pendingPlan.plannerAgentId,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return [...filteredMessages, planMsg];
  }, [filteredMessages, pendingPlan, activeId]);
  const { data: agents = [] } = useAgents();
  const createConversation = useCreateConversation();
  const updateConversation = useUpdateAnyConversation();

  const triggerNewConv = useUIStore((s) => s.triggerNewConv);
  const setManageAgentsOpen = useUIStore((s) => s.setManageAgentsOpen);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const setDagTaskId = useChatStore((s) => s.setDagTaskId);

  const conversation = conversations.find((c) => c.id === activeId);
  const artifactCount = useMemo(
    () => rawMessages.reduce((sum, m) => sum + (m.artifacts?.length ?? 0), 0),
    [rawMessages],
  );

  interface SwitchData {
    content: string;
    mentions: string[];
    externalAgentIds: string[];
    externalAgentNames: string[];
  }
  const [switchData, setSwitchData] = useState<SwitchData | null>(null);
  const [viewMode, setViewMode] = useState<"chat" | "artifacts">("chat");
  const [planFocusKey, setPlanFocusKey] = useState(0);
  const handleRefinePlan = useCallback(() => {
    setPlanFocusKey((k) => k + 1);
  }, []);
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
    setDagTaskId(null);
    useChatStore.getState().setPersistedThinkingSteps([]);

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
      }
      streamMsgIdRef.current = data.message_id;
      streamAgentRef.current = data.sender.name;
      streamSenderIdRef.current = data.sender.id;
      initStreaming(data.message_id);
      if (data.sender.type === "orchestrator" && data.meta?.plan) {
        planMetaRef.current = {
          plan: data.meta.plan,
          plannerAgentId: data.meta.planner_agent_id,
          plannerAgentName: data.meta.planner_agent_name,
        };
      }
    },
    onToken: (data: SSEToken) => {
      if (streamMsgIdRef.current) appendToken(streamMsgIdRef.current, data.delta);
    },
    onArtifact: (data: SSEArtifact) => {
      if (streamMsgIdRef.current) appendArtifact(streamMsgIdRef.current, data.artifact);
    },
    onAgentStatus: (data: SSEAgentStatus) => {
      if (data.task_id) {
        useChatStore.getState().setDagTaskId(data.task_id);
      }
      updateAgentStatus({
        agentId: data.agent.id,
        agentName: data.agent.name,
        status: data.status,
        progress: data.progress,
      });
    },
    onThinking: (data: SSEThinking) => {
      if (streamMsgIdRef.current) {
        const step = {
          phase: data.phase,
          text: data.text,
          toolName: data.tool_name,
          status: data.status,
        };
        appendThinkingStep(streamMsgIdRef.current, step);
        useChatStore.getState().appendPersistedThinkingStep(step);
      }
    },
    onMessageEnd: (data: SSEMessageEnd) => {
      if (data.finish_reason === "plan_draft" && planMetaRef.current) {
        useChatStore.getState().setPendingPlan({
          planId: streamMsgIdRef.current ?? "",
          subtasks: planMetaRef.current.plan,
          plannerAgentId: planMetaRef.current.plannerAgentId,
          plannerAgentName: planMetaRef.current.plannerAgentName,
        });
        planMetaRef.current = null;
      }
      if (streamMsgIdRef.current) {
        finalizeStreaming(streamMsgIdRef.current);
        streamMsgIdRef.current = null;
      }
      setIsStreaming(false);
      qc.invalidateQueries({ queryKey: ["messages", convId] });
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
          estimatedCost: estimateCost(
            data.usage.input_tokens,
            data.usage.output_tokens,
            agents.find((a) => a.id === streamSenderIdRef.current)?.model,
          ),
        });
      }
    },
    onError: (data: SSEError) => {
      toast.error(data.message || "Agent 响应出错");
      setIsStreaming(false);
      setDagTaskId(null);
      clearAgentStatuses();
    },
  }), [qc, setIsStreaming, initStreaming, appendToken, appendArtifact, appendThinkingStep, finalizeStreaming, setConnectionStatus, setRetryCount, updateAgentStatus, clearAgentStatuses]);

  const executeSend = useCallback((convId: string, content: string, mentions: string[], conv: Conversation | undefined) => {
    setConnectionStatus('connected');
    setRetryCount(0);
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

    const _pendingPlan = useChatStore.getState().pendingPlan;
    const msgMode = _pendingPlan
      ? "refine_plan"
      : conv?.type === "group"
        ? "auto_orchestrate"
        : "direct";
    const optimisticId = optimisticMsg.id;
    const streamMode = conv?.type === "group" ? "auto_orchestrate" : undefined;

    messageApi.send(convId, {
      content,
      mentions,
      mode: msgMode,
      plannerAgentId: conv?.type === "group" ? plannerAgentIdRef.current : undefined,
      plan_id: _pendingPlan?.planId,
    }).then((response) => {
      const realMsg = response.data?.data as Message | undefined;
      if (realMsg) {
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
      }

      disconnectRef.current?.();
      setIsStreaming(true);
      lastPromptRef.current = content;

      const onConnectionError = () => {
        const MAX_RETRIES = 3;
        const delays = [1000, 2000, 4000];
        const attempt = useChatStore.getState().retryCount;

        if (attempt >= MAX_RETRIES) {
          setConnectionStatus('failed');
          setIsStreaming(false);
          qc.invalidateQueries({ queryKey: ["messages", convId] });
          return;
        }

        setConnectionStatus('reconnecting');
        setRetryCount(attempt + 1);

        const delay = delays[attempt];
        retryRef.current.timeoutId = setTimeout(() => {
          disconnectRef.current?.();
          const reconnectCallbacks = buildCallbacks(convId, conv);
          disconnectRef.current = createSSEStream(convId, {
            ...reconnectCallbacks,
            onConnectionError: () => {
              setConnectionStatus('failed');
              setIsStreaming(false);
              qc.invalidateQueries({ queryKey: ["messages", convId] });
            },
          }, lastPromptRef.current, streamMode);
        }, delay);
      };

      disconnectRef.current = createSSEStream(convId, {
        ...buildCallbacks(convId, conv),
        onConnectionError,
      }, content, streamMode);
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

    let contentToResend: string;
    if (failedMsg.senderType === "user") {
      contentToResend = failedMsg.content;
    } else {
      const parentUserMsg = allMessages.find(
        (m) => m.senderType === "user" && m.id === failedMsg.parentMessageId,
      );
      if (!parentUserMsg) return;
      contentToResend = parentUserMsg.content;
    }

    if (convId !== useChatStore.getState().activeConversationId) {
      useChatStore.getState().setActiveConversation(convId);
      setTimeout(() => {
        sendRef.current?.(convId, contentToResend, []);
      }, 100);
    } else {
      sendRef.current?.(convId, contentToResend, []);
    }
  }, [qc, activeId, conversations, executeSend]);

  useEffect(() => {
    const onRegenerate = (e: Event) => {
      const { messageId, conversationId } = (e as CustomEvent).detail as {
        messageId: string;
        conversationId: string;
      };
      handleRegenerate(conversationId, messageId);
    };
    window.addEventListener("regenerate-message", onRegenerate);
    return () => window.removeEventListener("regenerate-message", onRegenerate);
  }, [handleRegenerate]);

  const handleConfirmPlan = useCallback((planId: string, subtasks: PlanSubtask[]) => {
    if (!activeId || !conversation) return;
    const plan = subtasks.map((st) => ({
      subtask_id: st.subtask_id,
      agent_id: st.agent.id,
      instruction: st.instruction,
    }));
    messageApi.send(activeId, { content: "", mode: "confirm_plan", plan_id: planId, plan }).then(() => {
      useChatStore.getState().setPendingPlan(null);
      qc.invalidateQueries({ queryKey: ["messages", activeId] });
      disconnectRef.current?.();
      setIsStreaming(true);
      const callbacks = buildCallbacks(activeId, conversation);
      disconnectRef.current = createSSEStream(activeId, {
        ...callbacks,
        onConnectionError: () => {
          setConnectionStatus("failed");
          setIsStreaming(false);
        },
      }, undefined, "auto_orchestrate");
    }).catch(() => {
      toast.error("确认计划失败，请重试");
    });
  }, [activeId, conversation, qc, setIsStreaming, buildCallbacks, setConnectionStatus]);

  const handleAdjustPlan = useCallback((subtasks: PlanSubtask[]) => {
    const current = useChatStore.getState().pendingPlan;
    if (current) {
      useChatStore.getState().setPendingPlan({ ...current, subtasks });
    }
  }, []);

  useEffect(() => {
    const onConfirm = (e: Event) => {
      const { planId, subtasks } = (e as CustomEvent).detail as { planId: string; subtasks: PlanSubtask[] };
      handleConfirmPlan(planId, subtasks);
    };
    const onAdjust = (e: Event) => {
      const { subtasks } = (e as CustomEvent).detail as { subtasks: PlanSubtask[] };
      handleAdjustPlan(subtasks);
    };
    window.addEventListener("orchestrator-confirm", onConfirm);
    window.addEventListener("orchestrator-adjust", onAdjust);
    return () => {
      window.removeEventListener("orchestrator-confirm", onConfirm);
      window.removeEventListener("orchestrator-adjust", onAdjust);
    };
  }, [handleConfirmPlan, handleAdjustPlan]);

  const handleSend = useCallback(async (content: string, mentions: string[]) => {
    if (!activeId || !conversation) return;

    // In group chat, auto-include all conversation agents when no @mentions
    if (conversation.type === "group" && mentions.length === 0) {
      mentions = conversation.agentIds;
    }

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
    setDagTaskId(null);
    if (retryRef.current.timeoutId) {
      clearTimeout(retryRef.current.timeoutId);
      retryRef.current.timeoutId = null;
    }
  }, [finalizeStreaming, setIsStreaming, clearAgentStatuses]);

  if (!conversation) {
    return (
      <WelcomePage
        conversations={conversations}
        agents={agents}
        onSelectConversation={setActiveConversation}
        onNewConversation={triggerNewConv}
        onManageAgents={() => setManageAgentsOpen(true)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader conversation={conversation} agents={agents} messageHitCount={messageSearch ? filteredMessages.length : undefined} taskSummary={taskSummary} />
      <div style={{ display: "flex", borderBottom: "1px solid var(--color-border-light)", background: "var(--color-bg-elevated)" }}>
        <TabButton active={viewMode === "chat"} count={rawMessages.length} onClick={() => setViewMode("chat")}>聊天</TabButton>
        <TabButton active={viewMode === "artifacts"} count={artifactCount} onClick={() => setViewMode("artifacts")}>产物</TabButton>
      </div>
      {viewMode === "artifacts" ? (
        <ArtifactWorkbench messages={rawMessages} agents={agents.map((a) => ({ id: a.id, name: a.name }))} />
      ) : (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
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
          {/* Planner Selector */}
          <div style={{
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: "1px solid var(--color-border-light)",
            background: "var(--color-bg-subtle)",
          }}>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
              任务分配:
            </span>
            <Select
              value={plannerAgentId ?? ""}
              onChange={(v) => setPlannerAgentId(v ? String(v) : null)}
              placeholder="自动 (Orchestrator)"
              size="small"
              style={{ flex: 1, minWidth: 140 }}
            >
              <Select.Option value="">自动 (Orchestrator)</Select.Option>
              {conversation.agentIds
                .map((id) => agents.find((a) => a.id === id))
                .filter(Boolean)
                .map((a) => (
                  <Select.Option key={a!.id} value={a!.id}>
                    {a!.name}
                  </Select.Option>
                ))}
            </Select>
          </div>
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
      {isMessagesError ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
          <p style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)" }}>
            加载消息失败
          </p>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-disabled)", maxWidth: 320, textAlign: "center" }}>
            {messagesError instanceof Error ? messagesError.message : "请检查网络连接后重试"}
          </p>
          <Button size="small" onClick={() => refetchMessages()}>重试</Button>
        </div>
      ) : isMessagesLoading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spin size="large" />
        </div>
      ) : (
        <MessageList
          messages={displayMessages}
          agents={agents}
          streamingMessageId={streamMsgIdRef.current}
          streamingAgentName={streamAgentRef.current}
          isWaiting={isStreaming && !streamMsgIdRef.current}
          hasMore={!!hasNextPage}
          isFetchingMore={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
          searchText={messageSearch}
          onConfirmPlan={handleConfirmPlan}
          onAdjustPlan={handleAdjustPlan}
          onRefinePlan={handleRefinePlan}
          dagTaskId={dagTaskId}
        />
      )}
      {filteredMessages.length === 0 && !isStreaming && messageSearch && rawMessages.length > 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center" }}>
          <p style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-tertiary)" }}>
            未找到匹配的消息
          </p>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-disabled)", marginTop: 4 }}>
            尝试其他关键词
          </p>
        </div>
      ) : filteredMessages.length === 0 && !isStreaming && !messageSearch ? (
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
      ) : null}
      <ChatInput key={activeId} onSend={handleSend} onStop={handleStop} disabled={isStreaming} agents={agents} focusKey={planFocusKey} />
      </div>
      )}

      <ReActPanel />

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

function TabButton({ active, count, onClick, children }: { active: boolean; count: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        fontSize: "var(--font-size-sm)",
        fontWeight: active ? 600 : 400,
        color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
        borderBottom: `2px solid ${active ? "var(--color-primary)" : "transparent"}`,
        background: "transparent",
        cursor: "pointer",
        transition: "color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)",
        borderTop: "none",
        borderLeft: "none",
        borderRight: "none",
      }}
    >
      {children}
      {count > 0 && (
        <span style={{ marginLeft: 4, fontSize: 10, color: "var(--color-text-tertiary)" }}>
          {count}
        </span>
      )}
    </button>
  );
}