import { useInfiniteQuery } from "@tanstack/react-query";
import { messageApi } from "@/lib/api";
import { normalizeArtifact } from "@/lib/utils";
import type { MessageListData, Message } from "@/types";

function normalizeMessageArtifacts(msg: Message): Message {
  if (!msg.artifacts || msg.artifacts.length === 0) return msg;
  return {
    ...msg,
    artifacts: msg.artifacts.map((a) => {
      const raw = a as unknown as Record<string, unknown>;
      const hasSnakeCase = ("artifact_type" in raw) && !("artifactType" in raw);
      if (!hasSnakeCase) return a;
      return normalizeArtifact(raw) as unknown as typeof a;
    }),
  };
}

export function useMessages(conversationId: string) {
  return useInfiniteQuery<MessageListData>({
    queryKey: ["messages", conversationId],
    queryFn: async ({ pageParam }) => {
      const res = await messageApi.list(
        conversationId,
        pageParam as string | undefined,
        50,
      );
      const data = res.data.data;
      data.items = data.items.map(normalizeMessageArtifacts);
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!conversationId,
  });
}
