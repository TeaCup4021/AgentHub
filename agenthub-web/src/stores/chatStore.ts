import { create } from "zustand";
import type { Artifact } from "@/types";

interface StreamingMessage {
  content: string;
  artifacts: Artifact[];
}

interface ChatUIState {
  activeConversationId: string | null;
  searchQuery: string;
  isStreaming: boolean;
  streamingContent: Record<string, StreamingMessage>;

  setActiveConversation: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setIsStreaming: (v: boolean) => void;
  initStreamingMessage: (messageId: string) => void;
  appendStreamToken: (messageId: string, delta: string) => void;
  appendStreamArtifact: (messageId: string, artifact: Artifact) => void;
  finalizeStreamingMessage: (messageId: string) => void;
  getStreamingContent: (messageId: string) => StreamingMessage | undefined;
  clearStreamingContent: (messageId: string) => void;
}

export const useChatStore = create<ChatUIState>((set, get) => ({
  activeConversationId: null,
  searchQuery: "",
  isStreaming: false,
  streamingContent: {},

  setActiveConversation: (id) => set({ activeConversationId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setIsStreaming: (v) => set({ isStreaming: v }),

  initStreamingMessage: (messageId) =>
    set((s) => ({
      isStreaming: true,
      streamingContent: {
        ...s.streamingContent,
        [messageId]: { content: "", artifacts: [] },
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
}));
