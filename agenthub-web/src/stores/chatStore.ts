import { create } from "zustand";
import type { Artifact, ThinkingStep, PlanSubtask } from "@/types";

interface StreamingMessage {
  content: string;
  artifacts: Artifact[];
  thinkingSteps: ThinkingStep[];
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'failed';

export interface OrchestratorPendingPlan {
  planId: string;
  subtasks: PlanSubtask[];
  plannerAgentId?: string | null;
  plannerAgentName?: string | null;
}

interface ChatUIState {
  activeConversationId: string | null;
  searchQuery: string;
  isStreaming: boolean;
  streamingContent: Record<string, StreamingMessage>;
  pendingMention: string | null;
  connectionStatus: ConnectionStatus;
  retryCount: number;
  pendingQuote: { messageId: string; content: string } | null;
  messageSearch: string;
  pendingPlan: OrchestratorPendingPlan | null;
  dagTaskId: string | null;

  setActiveConversation: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setMessageSearch: (query: string) => void;
  setIsStreaming: (v: boolean) => void;
  initStreamingMessage: (messageId: string) => void;
  appendStreamToken: (messageId: string, delta: string) => void;
  appendStreamArtifact: (messageId: string, artifact: Artifact) => void;
  appendThinkingStep: (messageId: string, step: ThinkingStep) => void;
  finalizeStreamingMessage: (messageId: string) => void;
  getStreamingContent: (messageId: string) => StreamingMessage | undefined;
  clearStreamingContent: (messageId: string) => void;
  setPendingMention: (name: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setRetryCount: (n: number) => void;
  setPendingQuote: (quote: { messageId: string; content: string } | null) => void;
  setPendingPlan: (plan: OrchestratorPendingPlan | null) => void;
  setDagTaskId: (id: string | null) => void;
}

export const useChatStore = create<ChatUIState>((set, get) => ({
  activeConversationId: null,
  searchQuery: "",
  isStreaming: false,
  streamingContent: {},
  pendingMention: null,
  connectionStatus: 'connected',
  retryCount: 0,
  pendingQuote: null,
  messageSearch: "",
  pendingPlan: null,
  dagTaskId: null,

  setActiveConversation: (id) => set({ activeConversationId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setMessageSearch: (q) => set({ messageSearch: q }),
  setIsStreaming: (v) => set({ isStreaming: v }),

  initStreamingMessage: (messageId) =>
    set((s) => ({
      isStreaming: true,
      streamingContent: {
        ...s.streamingContent,
        [messageId]: { content: "", artifacts: [], thinkingSteps: [] },
      },
    })),

  appendStreamToken: (messageId, delta) =>
    set((s) => {
      const entry = s.streamingContent[messageId];
      if (!entry) return s;
      return {
        streamingContent: {
          ...s.streamingContent,
          [messageId]: { ...entry, content: entry.content + delta },
        },
      };
    }),

  appendStreamArtifact: (messageId, artifact) =>
    set((s) => {
      const entry = s.streamingContent[messageId];
      if (!entry) return s;
      return {
        streamingContent: {
          ...s.streamingContent,
          [messageId]: {
            ...entry,
            artifacts: [...entry.artifacts, artifact],
          },
        },
      };
    }),

  appendThinkingStep: (messageId, step) =>
    set((s) => {
      const entry = s.streamingContent[messageId];
      if (!entry) return s;
      const existingIdx = entry.thinkingSteps.findIndex(
        (st) => st.phase === step.phase && st.text === step.text,
      );
      let updatedSteps: ThinkingStep[];
      if (existingIdx >= 0) {
        updatedSteps = [...entry.thinkingSteps];
        updatedSteps[existingIdx] = step;
      } else {
        updatedSteps = [...entry.thinkingSteps, step];
      }
      return {
        streamingContent: {
          ...s.streamingContent,
          [messageId]: { ...entry, thinkingSteps: updatedSteps },
        },
      };
    }),

  finalizeStreamingMessage: (messageId) =>
    set((s) => {
      const { [messageId]: _, ...rest } = s.streamingContent;
      return { isStreaming: false, streamingContent: rest };
    }),

  getStreamingContent: (messageId) => get().streamingContent[messageId],

  clearStreamingContent: (messageId) =>
    set((s) => {
      const { [messageId]: _, ...rest } = s.streamingContent;
      return { streamingContent: rest };
    }),

  setPendingMention: (name) => set({ pendingMention: name }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setRetryCount: (n) => set({ retryCount: n }),

  setPendingQuote: (quote) => set({ pendingQuote: quote }),

  setPendingPlan: (plan) => set({ pendingPlan: plan }),
  setDagTaskId: (id) => set({ dagTaskId: id }),
}));
