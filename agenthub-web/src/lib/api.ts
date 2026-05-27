import axios from "axios";
import type { AxiosInstance, AxiosError } from "axios";
import type {
  CreateConversationRequest,
  CreateConversationResponse,
  GetConversationListResponse,
  GetConversationDetailResponse,
  UpdateConversationRequest,
  UpdateConversationResponse,
  DeleteConversationResponse,
  ConversationListParams,
  GetAgentListResponse,
  GetAgentDetailResponse,
  CreateAgentRequest,
  CreateAgentResponse,
  UpdateAgentRequest,
  UpdateAgentResponse,
  GetArtifactsResponse,
  GetMessageListResponse,
  ApiResponse,
  Message,
} from "@/types";

// [后端对接] Vite 代理 /api → localhost:8080，见 vite.config.ts
const api: AxiosInstance = axios.create({
  baseURL: "/api/v1",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// [后端对接] Token 从 localStorage 读取，存的时候用 localStorage.setItem("token", "xxx")
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body.code === "number" && body.code >= 400) {
      return Promise.reject(new Error(body.message || "请求失败"));
    }
    return response;
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
    }
    return Promise.reject(error);
  },
);

export const conversationApi = {
  create(data: CreateConversationRequest) {
    return api.post<CreateConversationResponse>("/conversations", data);
  },

  list(params?: ConversationListParams) {
    return api.get<GetConversationListResponse>("/conversations", { params });
  },

  detail(id: string) {
    return api.get<GetConversationDetailResponse>(`/conversations/${id}`);
  },

  update(id: string, data: UpdateConversationRequest) {
    return api.patch<UpdateConversationResponse>(`/conversations/${id}`, data);
  },

  delete(id: string) {
    return api.delete<DeleteConversationResponse>(`/conversations/${id}`);
  },

  streamUrl(id: string): string {
    return `/api/v1/conversations/${id}/stream`;
  },

  pinMessage(conversationId: string, messageId: string) {
    return api.post<ApiResponse<{ status: string }>>(`/conversations/${conversationId}/pins`, { message_id: messageId });
  },

  unpinMessage(conversationId: string, messageId: string) {
    return api.delete<ApiResponse<void>>(`/conversations/${conversationId}/pins/${messageId}`);
  },
};

export const agentApi = {
  list() {
    return api.get<GetAgentListResponse>("/agents");
  },

  detail(id: string) {
    return api.get<GetAgentDetailResponse>(`/agents/${id}`);
  },

  create(data: CreateAgentRequest) {
    return api.post<CreateAgentResponse>("/agents", data);
  },

  update(id: string, data: UpdateAgentRequest) {
    return api.patch<UpdateAgentResponse>(`/agents/${id}`, data);
  },

  verify(data: AgentVerifyRequest) {
    return api.post<ApiResponse<{ status: string; message: string }>>("/agents/verify", data);
  },

  delete(id: string) {
    return api.delete<ApiResponse<void>>(`/agents/${id}`);
  },
};

export interface AgentVerifyRequest {
  provider: string;
  model: string;
  systemPrompt?: string;
}

// [后端对接] mode: direct(单聊) / auto_orchestrate(群聊) / confirm_plan(确认计划)
export interface SendMessageRequest {
  content: string;
  contentType?: string;
  mentions?: string[];
  parentMessageId?: string;
  mode?: "auto_orchestrate" | "direct" | "confirm_plan";
}

export interface SendMessageResponse extends ApiResponse<Message> {}

export const messageApi = {
  send(conversationId: string, data: SendMessageRequest) {
    return api.post<SendMessageResponse>(`/conversations/${conversationId}/messages`, data);
  },

  list(conversationId: string, cursor?: string, limit = 50) {
    return api.get<GetMessageListResponse>(`/conversations/${conversationId}/messages`, {
      params: { cursor, limit },
    });
  },

  regenerate(messageId: string) {
    return api.post<SendMessageResponse>(`/messages/${messageId}/regenerate`);
  },

  getArtifacts(messageId: string) {
    return api.get<GetArtifactsResponse>(`/messages/${messageId}/artifacts`);
  },
};

export default api;
