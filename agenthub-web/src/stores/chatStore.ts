import { create } from "zustand";
import type { Artifact, ThinkingStep } from "@/types";

interface StreamingMessage {
  content: string;
  artifacts: Artifact[];
  thinkingSteps: ThinkingStep[];
}

interface ChatUIState {
  activeConversationId: string | null;
  searchQuery: string;
  isStreaming: boolean;
  streamingContent: Record<string, StreamingMessage>;
  pendingMention: string | null;

  setActiveConversation: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setIsStreaming: (v: boolean) => void;
  initStreamingMessage: (messageId: string) => void;
  appendStreamToken: (messageId: string, delta: string) => void;
  appendStreamArtifact: (messageId: string, artifact: Artifact) => void;
  appendThinkingStep: (messageId: string, step: ThinkingStep) => void;
  finalizeStreamingMessage: (messageId: string) => void;
  getStreamingContent: (messageId: string) => StreamingMessage | undefined;
  clearStreamingContent: (messageId: string) => void;
  setPendingMention: (name: string | null) => void;
}

export const useChatStore = create<ChatUIState>((set, get) => ({
  activeConversationId: null,
  searchQuery: "",
  isStreaming: false,
  streamingContent: {},
  pendingMention: null,

  setActiveConversation: (id) => set({ activeConversationId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
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
}));
