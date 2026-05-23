import { useQuery } from "@tanstack/react-query";
import { messageApi } from "@/lib/api";

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const res = await messageApi.list(conversationId);
      return res.data.data ?? [];
    },
    enabled: !!conversationId,
  });
}
