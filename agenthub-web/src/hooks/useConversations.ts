import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { conversationApi } from "@/lib/api";
import type { CreateConversationParams, UpdateConversationParams, ConversationListParams } from "@/types";

export function useConversations(params?: ConversationListParams) {
  const safeParams = params?.projectId && !uuidRe.test(params.projectId)
    ? { ...params, projectId: undefined }
    : params;
  return useQuery({
    queryKey: ["conversations", safeParams],
    queryFn: async () => {
      const res = await conversationApi.list(safeParams);
      return res.data.data;
    },
  });
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useConversationsByProject(projectId?: string) {
  const validId = projectId && uuidRe.test(projectId) ? projectId : undefined;
  return useQuery({
    queryKey: ["conversations", { projectId: validId }],
    queryFn: async () => {
      const res = await conversationApi.list({ projectId: validId });
      return res.data.data;
    },
    enabled: !!validId,
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
