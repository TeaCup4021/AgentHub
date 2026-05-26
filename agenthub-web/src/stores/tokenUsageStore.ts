import { create } from "zustand";

export interface TokenUsage {
  conversationId: string;
  conversationTitle: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

interface TokenUsageState {
  usageMap: Record<string, TokenUsage>;
  addUsage: (usage: TokenUsage) => void;
  getByConversation: (convId: string) => TokenUsage | undefined;
  getAll: () => TokenUsage[];
}

const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "claude-opus-4-7": { input: 15, output: 75 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-5": { input: 1.25, output: 10 },
};

export function estimateCost(inputTokens: number, outputTokens: number, model?: string): number {
  const price = MODEL_PRICES[model ?? ""] ?? { input: 2.5, output: 10 };
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

export const useTokenUsageStore = create<TokenUsageState>((set, get) => ({
  usageMap: {},
  addUsage: (usage) =>
    set((s) => {
      const existing = s.usageMap[usage.conversationId];
      if (existing) {
        return {
          usageMap: {
            ...s.usageMap,
            [usage.conversationId]: {
              ...existing,
              inputTokens: existing.inputTokens + usage.inputTokens,
              outputTokens: existing.outputTokens + usage.outputTokens,
              totalTokens: existing.totalTokens + usage.totalTokens,
              estimatedCost: existing.estimatedCost + usage.estimatedCost,
            },
          },
        };
      }
      return { usageMap: { ...s.usageMap, [usage.conversationId]: usage } };
    }),
  getByConversation: (convId) => get().usageMap[convId],
  getAll: () => Object.values(get().usageMap),
}));
