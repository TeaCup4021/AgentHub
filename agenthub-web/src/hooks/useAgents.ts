import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentApi } from "@/lib/api";
import type { CreateAgentParams, UpdateAgentParams } from "@/types";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await agentApi.list();
      return res.data.data;
    },
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ["agents", id],
    queryFn: async () => {
      const res = await agentApi.detail(id);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: CreateAgentParams) => {
      const res = await agentApi.create(params);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useUpdateAgent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: UpdateAgentParams) => {
      const res = await agentApi.update(id, params);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agents", id] });
    },
  });
}

export function useAgentCapabilities() {
  return useQuery({
    queryKey: ["agents", "capabilities"],
    queryFn: async () => {
      const res = await agentApi.capabilities();
      return res.data.data;
    },
    staleTime: 60000,
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await agentApi.delete(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}
