import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banner, Button, Spin } from "@douyinfe/semi-ui";
import { useChatStore, type ConnectionStatus, type OrchestratorPendingPlan } from "@/stores/chatStore";
import { useMessages } from "@/hooks/useMessages";
import { useAgents } from "@/hooks/useAgents";
import { useCreateConversation, useUpdateAnyConversation } from "@/hooks";
import { createSSEStream } from "@/lib/sse";
import { messageApi, conversationApi } from "@/lib/api";
import { ChatHeader, MessageList, ChatInput, WelcomePage } from "@/components/chat";
import { AgentProgressBar, type AgentProgress } from "@/components/chat/AgentProgressBar";
import { AgentDashboard } from "@/components/chat/AgentDashboard";
import { MentionSwitchDialog } from "@/components/chat/MentionSwitchDialog";
import { ReActPanel } from "@/components/chat/ReActPanel";
import { ArtifactWorkbench } from "@/components/chat/ArtifactWorkbench";
import { useDashboardStore } from "@/stores/dashboardStore";
import { useUIStore } from "@/stores/uiStore";
import { useTokenUsageStore, estimateCost } from "@/stores/tokenUsageStore";
import type { InfiniteData } from "@tanstack/react-query";
import type { SSEMessageStart, SSEToken, SSEArtifact, SSEAgentStatus, SSEThinking, SSEMessageEnd, SSEError, Conversation, Message, MessageListData, PlanSubtask, Attachment } from "@/types";

interface ChatAreaProps {
  conversations: Conversation[];
}

type PlanMeta = {
  plan: PlanSubtask[];
  plannerAgentId?: string | null;
  plannerAgentName?: string | null;
};

interface ConversationStreamSnapshot {
  messageId: string | null;
  agentName: string;
  senderId: string;
  isStreaming: boolean;
  connectionStatus: ConnectionStatus;
  retryCount: number;
  dagTaskId: string | null;
  agentStatuses: AgentProgress[];
  pendingPlan: OrchestratorPendingPlan | null;
}

interface ConversationStreamRuntime extends ConversationStreamSnapshot {
  disconnect: (() => void) | null;
  lastPrompt: string;
  planMeta: PlanMeta | null;
  retryTimeoutId: ReturnType<typeof setTimeout> | null;
}

function createStreamRuntime(): ConversationStreamRuntime {
  return {
    disconnect: null,
    messageId: null,
    agentName: "",
    senderId: "",
    lastPrompt: "",
    planMeta: null,
    retryTimeoutId: null,
    isStreaming: false,
    connectionStatus: "connected",
    retryCount: 0,
    dagTaskId: null,
    agentStatuses: [],
    pendingPlan: null,
  };
}

function clearRuntimeRetry(runtime: ConversationStreamRuntime) {
  if (runtime.retryTimeoutId) {
    clearTimeout(runtime.retryTimeoutId);
    runtime.retryTimeoutId = null;
  }
}

function streamSnapshot(runtime: ConversationStreamRuntime): ConversationStreamSnapshot {
  return {
    messageId: runtime.messageId,
    agentName: runtime.agentName,
    senderId: runtime.senderId,
    isStreaming: runtime.isStreaming,
    connectionStatus: runtime.connectionStatus,
    retryCount: runtime.retryCount,
    dagTaskId: runtime.dagTaskId,
    agentStatuses: runtime.agentStatuses,
    pendingPlan: runtime.pendingPlan,
  };
}

function upsertAgentStatus(statuses: AgentProgress[], status: AgentProgress): AgentProgress[] {
  const idx = statuses.findIndex((agent) => agent.agentId === status.agentId);
  if (idx < 0) return [...statuses, status];
  const updated = [...statuses];
  updated[idx] = status;
  return updated;
}

function normalizePlanSubtask(task: PlanSubtask, index: number): PlanSubtask {
  return {
    ...task,
    subtask_id: task.subtask_id ?? task.subtaskId ?? `stage-${index + 1}`,
    instruction: task.instruction ?? "",
    priority: task.priority ?? index + 1,
    agent_config: task.agent_config ?? task.agentConfig,
    recommended_capabilities: task.recommended_capabilities ?? task.recommendedCapabilities ?? [],
    acceptance_criteria: task.acceptance_criteria ?? task.acceptanceCriteria ?? [],
    can_parallel: task.can_parallel ?? task.canParallel ?? true,
    depends_on: task.depends_on ?? task.dependsOn ?? [],
    output_key: task.output_key ?? task.outputKey ?? null,
  };
}

function normalizePlanSubtasks(subtasks: PlanSubtask[]): PlanSubtask[] {
  return subtasks.map((task, index) => normalizePlanSubtask(task, index));
}

function extractPlanMessage(message: Message): Message | null {
  const meta = (message.meta ?? {}) as Record<string, unknown>;
  const planArtifact = message.artifacts.find((artifact) => artifact.artifactType === "plan");
  const planContent = (planArtifact?.content ?? {}) as Record<string, unknown>;
  const rawSubtasks = meta.subtasks ?? meta.plan ?? planContent.subtasks;
  if (!Array.isArray(rawSubtasks) || rawSubtasks.length === 0) return null;

  const plannerAgentName =
    (meta.plannerAgentName as string | undefined) ??
    (meta.planner_agent_name as string | undefined) ??
    (planContent.planner_agent_name as string | undefined) ??
    message.senderName ??
    null;
  const plannerAgentId =
    (meta.plannerAgentId as string | null | undefined) ??
    (meta.planner_agent_id as string | null | undefined) ??
    (planContent.planner_agent_id as string | null | undefined) ??
    null;

  return {
    ...message,
    contentType: "plan",
    meta: {
      ...meta,
      planId:
        (meta.planId as string | undefined) ??
        (meta.plan_id as string | undefined) ??
        message.id,
      subtasks: normalizePlanSubtasks(rawSubtasks as PlanSubtask[]),
      plannerAgentName,
      plannerAgentId,
    },
  };
}

export function ChatArea({ conversations }: ChatAreaProps) {
  const activeId = useChatStore((s) => s.activeConversationId);
  const setIsStreaming = useChatStore((s) => s.setIsStreaming);
  const initStreaming = useChatStore((s) => s.initStreamingMessage);
  const appendToken = useChatStore((s) => s.appendStreamToken);
  const appendArtifact = useChatStore((s) => s.appendStreamArtifact);
  const appendThinkingStep = useChatStore((s) => s.appendThinkingStep);
  const finalizeStreaming = useChatStore((s) => s.finalizeStreamingMessage);
  const setConnectionStatus = useChatStore((s) => s.setConnectionStatus);
  const setRetryCount = useChatStore((s) => s.setRetryCount);
  const setDagTaskId = useChatStore((s) => s.setDagTaskId);

  const streamRuntimesRef = useRef<Record<string, ConversationStreamRuntime>>({});
  const [streamVersion, setStreamVersion] = useState(0);

  const dashboardOpen = useDashboardStore((s) => s.dashboardOpen);
  const toggleDashboard = useDashboardStore((s) => s.toggleDashboard);
  const setDashboardOpen = useDashboardStore((s) => s.setDashboardOpen);

  const getRuntime = useCallback((convId: string) => {
    if (!streamRuntimesRef.current[convId]) {
      streamRuntimesRef.current[convId] = createStreamRuntime();
    }
    return streamRuntimesRef.current[convId];
  }, []);

  const syncActiveStreamState = useCallback((forceRender = false) => {
    const currentId = useChatStore.getState().activeConversationId;
    const runtime = currentId ? streamRuntimesRef.current[currentId] : null;
    const snapshot = runtime ? streamSnapshot(runtime) : streamSnapshot(createStreamRuntime());

    setIsStreaming(snapshot.isStreaming);
    setConnectionStatus(snapshot.connectionStatus);
    setRetryCount(snapshot.retryCount);
    setDagTaskId(snapshot.dagTaskId);
    useChatStore.getState().setPendingPlan(snapshot.pendingPlan);
    useDashboardStore.setState({ agentStatuses: snapshot.agentStatuses });

    if (forceRender) {
      setStreamVersion((version) => version + 1);
    }
  }, [setConnectionStatus, setDagTaskId, setIsStreaming, setRetryCount]);

  const markRuntimeChanged = useCallback((convId: string) => {
    syncActiveStreamState(convId === useChatStore.getState().activeConversationId);
  }, [syncActiveStreamState]);

  const currentStream = useMemo(() => {
    const runtime = activeId ? streamRuntimesRef.current[activeId] : null;
    return runtime ? streamSnapshot(runtime) : streamSnapshot(createStreamRuntime());
  }, [activeId, streamVersion]);

  const isStreaming = currentStream.isStreaming;
  const connectionStatus = currentStream.connectionStatus;
  const retryCount = currentStream.retryCount;
  const agentStatuses = currentStream.agentStatuses;
  const dagTaskId = currentStream.dagTaskId;

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

  const handlePin = useCallback(async (msgId: string) => {
    if (!activeId) return;
    try {
      await conversationApi.pinMessage(activeId, msgId);
      useChatStore.getState().addPinnedMessage(msgId);
      toast.success("已 Pin，将作为长期上下文");
      qc.invalidateQueries({ queryKey: ["messages", activeId] });
      qc.invalidateQueries({ queryKey: ["pins", activeId] });
    } catch {
      toast.error("Pin 失败");
    }
  }, [activeId, qc]);

  const handleUnpin = useCallback(async (msgId: string) => {
    if (!activeId) return;
    try {
      await conversationApi.unpinMessage(activeId, msgId);
      useChatStore.getState().removePinnedMessage(msgId);
      toast.success("已取消 Pin");
      qc.invalidateQueries({ queryKey: ["messages", activeId] });
      qc.invalidateQueries({ queryKey: ["pins", activeId] });
    } catch {
      toast.error("取消 Pin 失败");
    }
  }, [activeId, qc]);


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
  const normalizedMessages = useMemo(
    () => rawMessages.map((message) => extractPlanMessage(message) ?? message),
    [rawMessages],
  );
  const filteredMessages = useMemo(() => {
    if (!messageSearch) return normalizedMessages;
    const q = messageSearch.toLowerCase();
    return normalizedMessages.filter((m) => m.content.toLowerCase().includes(q));
  }, [normalizedMessages, messageSearch]);
  const pendingPlan = currentStream.pendingPlan;
  const displayMessages = useMemo(() => {
    if (!pendingPlan) return filteredMessages;

    // Avoid duplicating the plan message: if the persisted plan message
    // (by planId) already exists in the fetched messages, convert it to
    // a "plan" card instead of appending a second synthetic entry.
    const existingIdx = filteredMessages.findIndex(
      (m) => m.id === pendingPlan.planId,
    );
    if (existingIdx >= 0) {
      return filteredMessages.map((m, i) =>
        i === existingIdx
          ? {
              ...m,
              contentType: "plan",
              meta: {
                ...m.meta,
                planId: pendingPlan.planId,
                subtasks: pendingPlan.subtasks,
                plannerAgentName: pendingPlan.plannerAgentName,
                plannerAgentId: pendingPlan.plannerAgentId,
              },
            }
          : m,
      );
    }

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
      isPinned: false,
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
  const sendRef = useRef<(convId: string, content: string, mentions: string[], attachments?: Attachment[]) => void>(null!);

  useEffect(() => {
    syncActiveStreamState(true);

    if (activeId) {
      conversationApi.getPins(activeId).then((res) => {
        const pins = res.data?.data;
        if (pins) {
          useChatStore.getState().setPinnedMessages(pins.map((p) => p.message_id));
        }
      }).catch(() => {});
    }
  }, [activeId, syncActiveStreamState]);

  useEffect(() => () => {
    for (const runtime of Object.values(streamRuntimesRef.current)) {
      runtime.disconnect?.();
      clearRuntimeRetry(runtime);
    }
  }, []);

  const buildCallbacks = useCallback((convId: string, conv: Conversation | undefined) => ({
    onMessageStart: (data: SSEMessageStart) => {
      const runtime = getRuntime(convId);
      clearRuntimeRetry(runtime);
      runtime.connectionStatus = "connected";
      runtime.retryCount = 0;
      runtime.messageId = data.message_id;
      runtime.agentName = data.sender.name;
      runtime.senderId = data.sender.id;
      runtime.isStreaming = true;

      if (data.sender.type === "orchestrator" && data.meta?.plan) {
        const plan = normalizePlanSubtasks(data.meta.plan);
        runtime.planMeta = {
          plan,
          plannerAgentId: data.meta.planner_agent_id,
          plannerAgentName: data.meta.planner_agent_name,
        };
        runtime.pendingPlan = {
          planId: data.message_id,
          subtasks: plan,
          plannerAgentId: data.meta.planner_agent_id,
          plannerAgentName: data.meta.planner_agent_name,
        };
        markRuntimeChanged(convId);
        return;
      }

      initStreaming(data.message_id);
      markRuntimeChanged(convId);
    },
    onToken: (data: SSEToken) => {
      const messageId = data.message_id || getRuntime(convId).messageId;
      if (messageId) appendToken(messageId, data.delta);
    },
    onArtifact: (data: SSEArtifact) => {
      const messageId = data.message_id || getRuntime(convId).messageId;
      if (messageId) appendArtifact(messageId, data.artifact);
    },
    onAgentStatus: (data: SSEAgentStatus) => {
      const runtime = getRuntime(convId);
      if (data.task_id) {
        runtime.dagTaskId = data.task_id;
      }
      runtime.agentStatuses = upsertAgentStatus(runtime.agentStatuses, {
        agentId: data.agent.id,
        agentName: data.agent.name,
        status: data.status,
        progress: data.progress,
      });
      markRuntimeChanged(convId);
    },
    onThinking: (data: SSEThinking) => {
      const messageId = data.message_id || getRuntime(convId).messageId;
      if (messageId) {
        const step = {
          phase: data.phase,
          text: data.text,
          toolName: data.tool_name,
          status: data.status,
        };
        appendThinkingStep(messageId, step);
        useChatStore.getState().appendPersistedThinkingStep(step);
      }
    },
    onMessageEnd: (data: SSEMessageEnd) => {
      const runtime = getRuntime(convId);
      const messageId = data.message_id || runtime.messageId;

      if (data.finish_reason === "plan_draft" && runtime.planMeta) {
        runtime.pendingPlan = {
          planId: messageId ?? "",
          subtasks: runtime.planMeta.plan,
          plannerAgentId: runtime.planMeta.plannerAgentId,
          plannerAgentName: runtime.planMeta.plannerAgentName,
        };
        runtime.planMeta = null;
      }

      if (messageId) {
        finalizeStreaming(messageId);
      }
      runtime.messageId = null;
      runtime.isStreaming = false;
      runtime.disconnect = null;
      clearRuntimeRetry(runtime);
      qc.invalidateQueries({ queryKey: ["messages", convId] });

      if (data.usage && conv) {
        useTokenUsageStore.getState().addUsage({
          conversationId: convId,
          conversationTitle: conv.title,
          agentName: runtime.agentName || "Agent",
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          estimatedCost: estimateCost(
            data.usage.input_tokens,
            data.usage.output_tokens,
            agents.find((a) => a.id === runtime.senderId)?.model,
          ),
        });
      }

      markRuntimeChanged(convId);
    },
    onError: (data: SSEError) => {
      const runtime = getRuntime(convId);
      runtime.isStreaming = false;
      runtime.messageId = null;
      runtime.disconnect = null;
      runtime.dagTaskId = null;
      runtime.agentStatuses = [];
      clearRuntimeRetry(runtime);
      toast.error(data.message || "Agent 响应出错");
      markRuntimeChanged(convId);
    },
  }), [appendArtifact, appendThinkingStep, appendToken, agents, finalizeStreaming, getRuntime, initStreaming, markRuntimeChanged, qc]);

  const executeSend = useCallback((convId: string, content: string, mentions: string[], conv: Conversation | undefined, attachments?: Attachment[]) => {
    const runtime = getRuntime(convId);
    runtime.connectionStatus = "connected";
    runtime.retryCount = 0;
    clearRuntimeRetry(runtime);
    markRuntimeChanged(convId);

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
      attachments: attachments ?? [],
      status: "done",
      isPinned: false,
      meta: null,
      createdAt: now,
      updatedAt: now,
    };

    qc.setQueryData(
      ["messages", convId],
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

    const _pendingPlan = getRuntime(convId).pendingPlan;
    const isAgentBuilder = conv?.purpose === "agent_builder";
    const msgMode = _pendingPlan
      ? "refine_plan"
      : isAgentBuilder
        ? "agent_builder"
      : conv?.type === "group"
        ? "auto_orchestrate"
        : "direct";
    const optimisticId = optimisticMsg.id;
    const streamMode = isAgentBuilder ? "agent_builder" : conv?.type === "group" ? "auto_orchestrate" : undefined;

    messageApi.send(convId, {
      content,
      mentions,
      mode: msgMode,
      plan_id: _pendingPlan?.planId,
      attachments: attachments ?? [],
    }).then((response) => {
      const realMsg = response.data?.data as Message | undefined;
      if (realMsg) {
        qc.setQueryData(
          ["messages", convId],
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

      const runtime = getRuntime(convId);
      runtime.disconnect?.();
      clearRuntimeRetry(runtime);
      runtime.isStreaming = true;
      runtime.connectionStatus = "connected";
      runtime.retryCount = 0;
      runtime.lastPrompt = content;
      runtime.messageId = null;
      runtime.agentName = "";
      runtime.senderId = "";
      runtime.agentStatuses = [];
      runtime.dagTaskId = null;
      markRuntimeChanged(convId);

      const onConnectionError = () => {
        const MAX_RETRIES = 3;
        const delays = [1000, 2000, 4000];
        const runtime = getRuntime(convId);
        const attempt = runtime.retryCount;

        if (attempt >= MAX_RETRIES) {
          runtime.connectionStatus = "failed";
          runtime.isStreaming = false;
          runtime.disconnect = null;
          markRuntimeChanged(convId);
          qc.invalidateQueries({ queryKey: ["messages", convId] });
          return;
        }

        runtime.connectionStatus = "reconnecting";
        runtime.retryCount = attempt + 1;
        markRuntimeChanged(convId);

        const delay = delays[attempt];
        runtime.retryTimeoutId = setTimeout(() => {
          const retryRuntime = getRuntime(convId);
          retryRuntime.disconnect?.();
          const reconnectCallbacks = buildCallbacks(convId, conv);
          retryRuntime.disconnect = createSSEStream(convId, {
            ...reconnectCallbacks,
            onConnectionError: () => {
              const failedRuntime = getRuntime(convId);
              failedRuntime.connectionStatus = "failed";
              failedRuntime.isStreaming = false;
              failedRuntime.disconnect = null;
              clearRuntimeRetry(failedRuntime);
              markRuntimeChanged(convId);
              qc.invalidateQueries({ queryKey: ["messages", convId] });
            },
          }, retryRuntime.lastPrompt, streamMode);
        }, delay);
      };

      runtime.disconnect = createSSEStream(convId, {
        ...buildCallbacks(convId, conv),
        onConnectionError,
      }, content, streamMode);
    }).catch(() => {
      qc.setQueryData(
        ["messages", convId],
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
      const runtime = getRuntime(convId);
      runtime.isStreaming = false;
      runtime.connectionStatus = "failed";
      markRuntimeChanged(convId);
      toast.error("消息发送失败", {
        action: { label: "重试", onClick: () => executeSend(convId, content, mentions, conv) },
        duration: 5000,
      });
    });
  }, [buildCallbacks, getRuntime, markRuntimeChanged, qc]);

  sendRef.current = (convId: string, content: string, mentions: string[], attachments?: Attachment[]) => {
    const conv = conversations.find((c) => c.id === convId);
    executeSend(convId, content, mentions, conv, attachments);
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
    const convId = activeId;
    const plan = normalizePlanSubtasks(subtasks).map((st) => ({
      subtask_id: st.subtask_id,
      instruction: st.instruction,
      recommended_capabilities: st.recommended_capabilities ?? [],
      acceptance_criteria: st.acceptance_criteria ?? [],
      can_parallel: st.can_parallel ?? true,
      depends_on: st.depends_on ?? [],
      mode: st.mode ?? "single_turn",
      output_key: st.output_key ?? null,
    }));
    messageApi.send(convId, { content: "", mode: "confirm_plan", plan_id: planId, plan }).then(() => {
      const runtime = getRuntime(convId);
      runtime.pendingPlan = null;
      runtime.disconnect?.();
      clearRuntimeRetry(runtime);
      runtime.isStreaming = true;
      runtime.connectionStatus = "connected";
      runtime.retryCount = 0;
      qc.invalidateQueries({ queryKey: ["messages", convId] });
      markRuntimeChanged(convId);

      const callbacks = buildCallbacks(convId, conversation);
      runtime.disconnect = createSSEStream(convId, {
        ...callbacks,
        onConnectionError: () => {
          const failedRuntime = getRuntime(convId);
          failedRuntime.connectionStatus = "failed";
          failedRuntime.isStreaming = false;
          failedRuntime.disconnect = null;
          markRuntimeChanged(convId);
          qc.invalidateQueries({ queryKey: ["messages", convId] });
        },
      }, runtime.lastPrompt, "confirm_plan");
    }).catch(() => {
      toast.error("确认计划失败，请重试");
    });
  }, [activeId, buildCallbacks, conversation, getRuntime, markRuntimeChanged, qc]);

  const handleAdjustPlan = useCallback((subtasks: PlanSubtask[]) => {
    if (!activeId) return;
    const runtime = getRuntime(activeId);
    const current = runtime.pendingPlan;
    if (current) {
      runtime.pendingPlan = { ...current, subtasks };
      markRuntimeChanged(activeId);
    }
  }, [activeId, getRuntime, markRuntimeChanged]);

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

  const handleSend = useCallback(async (content: string, mentions: string[], attachments: Attachment[] = []) => {
    if (!activeId || !conversation) return;

    const isAgentBuilder = conversation.purpose === "agent_builder";
    if (conversation.type === "group" && conversation.agentIds.length === 0 && !isAgentBuilder) {
      toast.warning("Group chat needs at least one member agent before orchestration.");
      return;
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

    executeSend(activeId, content, mentions, conversation, attachments);
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
    const runtime = getRuntime(activeId);
    runtime.connectionStatus = "connected";
    runtime.retryCount = 0;
    runtime.disconnect?.();
    clearRuntimeRetry(runtime);
    runtime.isStreaming = true;
    markRuntimeChanged(activeId);

    const streamMode = conversation.type === "group" ? "auto_orchestrate" : undefined;
    const callbacks = buildCallbacks(activeId, conversation);
    runtime.disconnect = createSSEStream(activeId, {
      ...callbacks,
      onConnectionError: () => {
        const failedRuntime = getRuntime(activeId);
        failedRuntime.connectionStatus = "failed";
        failedRuntime.isStreaming = false;
        failedRuntime.disconnect = null;
        markRuntimeChanged(activeId);
        qc.invalidateQueries({ queryKey: ["messages", activeId] });
      },
    }, runtime.lastPrompt, streamMode);
  }, [activeId, buildCallbacks, conversation, getRuntime, markRuntimeChanged, qc]);

  const handleDismissBanner = useCallback(() => {
    if (!activeId) return;
    const runtime = getRuntime(activeId);
    runtime.connectionStatus = "connected";
    runtime.retryCount = 0;
    markRuntimeChanged(activeId);
  }, [activeId, getRuntime, markRuntimeChanged]);

  const handleStop = useCallback(() => {
    if (!activeId) return;
    const runtime = getRuntime(activeId);
    runtime.disconnect?.();
    runtime.disconnect = null;
    clearRuntimeRetry(runtime);
    if (runtime.messageId) {
      useChatStore.getState().clearStreamingContent(runtime.messageId);
    }
    runtime.messageId = null;
    runtime.isStreaming = false;
    runtime.agentStatuses = [];
    runtime.dagTaskId = null;
    markRuntimeChanged(activeId);
  }, [activeId, getRuntime, markRuntimeChanged]);

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
      {agentStatuses.length > 0 && (
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
          streamingMessageId={currentStream.messageId}
          streamingAgentName={currentStream.agentName}
          isWaiting={isStreaming && !currentStream.messageId}
          hasMore={!!hasNextPage}
          isFetchingMore={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
          searchText={messageSearch}
          onConfirmPlan={handleConfirmPlan}
          onAdjustPlan={handleAdjustPlan}
          onRefinePlan={handleRefinePlan}
          dagTaskId={dagTaskId}
          onPin={handlePin}
          onUnpin={handleUnpin}
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
        <div style={{ padding: "32px 16px", textAlign: "center" }}>
          <p style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-tertiary)" }}>
            发送第一条消息开始对话
          </p>
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
