import { useInfiniteQuery } from "@tanstack/react-query";
import { messageApi } from "@/lib/api";
import type { MessageListData } from "@/types";

export function useMessages(conversationId: string) {
  return useInfiniteQuery<MessageListData>({
    queryKey: ["messages", conversationId],
    queryFn: async ({ pageParam }) => {
      const res = await messageApi.list(
        conversationId,
        pageParam as string | undefined,
        50,
      );
      return res.data.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!conversationId,
  });
}
