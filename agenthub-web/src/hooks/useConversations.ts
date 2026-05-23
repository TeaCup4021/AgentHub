import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { conversationApi } from "@/lib/api";
import type { CreateConversationParams } from "@/types";

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const res = await conversationApi.list();
      return res.data.data;
    },
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ["conversations", id],
    queryFn: async () => {
      const res = await conversationApi.detail(id);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateConversationParams) =>
      conversationApi.create(params).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useUpdateConversation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: { title?: string; isPinned?: boolean; isArchived?: boolean }) =>
      conversationApi.update(id, updates).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations", id] });
    },
  });
}

export function useUpdateAnyConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: { id: string; title?: string; isPinned?: boolean; isArchived?: boolean }) =>
      conversationApi.update(id, updates).then((r) => r.data.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations", vars.id] });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => conversationApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}
