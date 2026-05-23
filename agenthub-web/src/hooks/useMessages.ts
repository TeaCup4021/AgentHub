import { useQuery } from "@tanstack/react-query";
import { messageApi } from "@/lib/api";
import type { Message } from "@/types";

async function fetchMessages(conversationId: string): Promise<Message[]> {
  const res = await messageApi.list(conversationId);
  return res.data.data ?? [];
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => fetchMessages(conversationId!),
    enabled: !!conversationId,
  });
}
