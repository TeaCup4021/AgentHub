import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { conversationApi } from "@/lib/api";
import type { CreateConversationParams, UpdateConversationParams, ConversationListParams } from "@/types";

export function useConversations(params?: ConversationListParams) {
  return useQuery({
    queryKey: ["conversations", params],
    queryFn: async () => {
      const res = await conversationApi.list(params);
      return res.data.data;
    },
  });
}

export function useConversationsByProject(projectId?: string) {
  return useQuery({
    queryKey: ["conversations", { projectId }],
    queryFn: async () => {
      const res = await conversationApi.list({ projectId });
      return res.data.data;
    },
    enabled: !!projectId,
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
    mutationFn: async (params: CreateConversationParams) => {
      const res = await conversationApi.create(params);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useUpdateConversation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: UpdateConversationParams) => {
      const res = await conversationApi.update(id, updates);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations", id] });
    },
  });
}

export function useUpdateAnyConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & UpdateConversationParams) => {
      const res = await conversationApi.update(id, updates);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await conversationApi.delete(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
