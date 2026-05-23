import { create } from "zustand";
import type { MessageContent } from "@/types";

interface ChatUIState {
  activeConversationId: string | null;
  searchQuery: string;
  isStreaming: boolean;
  streamingContent: Record<string, MessageContent[]>;

  setActiveConversation: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setIsStreaming: (v: boolean) => void;

  initStreamingMessage: (messageId: string) => void;
  appendStreamToken: (messageId: string, delta: string) => void;
  appendStreamArtifact: (messageId: string, content: MessageContent) => void;
  finalizeStreamingMessage: (messageId: string) => void;
  getStreamingContent: (messageId: string) => MessageContent[];
  clearStreamingContent: (messageId: string) => void;
}

export const useChatStore = create<ChatUIState>((set, get) => ({
  activeConversationId: null,
  searchQuery: "",
  isStreaming: false,
  streamingContent: {},

  setActiveConversation: (id) => set({ activeConversationId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsStreaming: (v) => set({ isStreaming: v }),

  initStreamingMessage: (messageId) =>
    set((s) => ({
      streamingContent: { ...s.streamingContent, [messageId]: [] },
      isStreaming: true,
    })),

  appendStreamToken: (messageId, delta) =>
    set((s) => {
      const contents = [...(s.streamingContent[messageId] || [])];
      const last = contents[contents.length - 1];
      if (last && last.type === "text") {
        contents[contents.length - 1] = { ...last, text: last.text + delta };
      } else {
        contents.push({ type: "text", text: delta });
      }
      return { streamingContent: { ...s.streamingContent, [messageId]: contents } };
    }),

  appendStreamArtifact: (messageId, content) =>
    set((s) => ({
      streamingContent: {
        ...s.streamingContent,
        [messageId]: [...(s.streamingContent[messageId] || []), content],
      },
    })),

  finalizeStreamingMessage: (messageId) =>
    set((s) => {
      const { [messageId]: _, ...rest } = s.streamingContent;
      return { streamingContent: rest, isStreaming: false };
    }),

  getStreamingContent: (messageId) => get().streamingContent[messageId] || [],

  clearStreamingContent: (messageId) =>
    set((s) => {
      const { [messageId]: _, ...rest } = s.streamingContent;
      return { streamingContent: rest };
    }),
}));
