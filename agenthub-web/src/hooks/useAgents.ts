import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentApi } from "@/lib/api";
import type { CreateAgentParams } from "@/types";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await agentApi.list();
      return res.data.data;
    },
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateAgentParams) =>
      agentApi.create(params).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}
