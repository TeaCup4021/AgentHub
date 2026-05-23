import axios from "axios";
import type { AxiosInstance, AxiosError } from "axios";
import type {
  CreateConversationRequest,
  CreateConversationResponse,
  GetConversationListResponse,
  GetConversationDetailResponse,
  UpdateConversationRequest,
  UpdateConversationResponse,
  GetAgentListResponse,
  GetAgentDetailResponse,
  CreateAgentRequest,
  CreateAgentResponse,
  ApiResponse,
} from "@/types";

const api: AxiosInstance = axios.create({
  baseURL: "/api/v1",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// 请求拦截器 — 注入 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        localStorage.removeItem("token");
        console.warn("未登录，需要跳转到登录页");
      } else if (status === 500) {
        console.error("服务器错误");
      }
    } else if (error.request) {
      console.error("网络错误，无法连接到服务器");
    }
    return Promise.reject(error);
  },
);

// ========== 对话 API ==========

export const conversationApi = {
  create(data: CreateConversationRequest) {
    return api.post<CreateConversationResponse>("/conversations", data);
  },

  list() {
    return api.get<GetConversationListResponse>("/conversations");
  },

  detail(id: string) {
    return api.get<GetConversationDetailResponse>(`/conversations/${id}`);
  },

  update(id: string, data: UpdateConversationRequest) {
    return api.patch<UpdateConversationResponse>(`/conversations/${id}`, data);
  },

  delete(id: string) {
    return api.delete<ApiResponse<null>>(`/conversations/${id}`);
  },

  streamUrl(id: string): string {
    return `/api/v1/conversations/${id}/stream`;
  },
};

// ========== Agent API ==========

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
};

// ========== 消息 API ==========

export interface SendMessageRequest {
  content: string;
  mentions?: string[];
  mode?: "auto_orchestrate" | "direct";
}

export const messageApi = {
  send(conversationId: string, data: SendMessageRequest) {
    return api.post(`/conversations/${conversationId}/messages`, data);
  },

  list(conversationId: string, cursor?: string, limit = 50) {
    return api.get(`/conversations/${conversationId}/messages`, {
      params: { cursor, limit },
    });
  },

  regenerate(messageId: string) {
    return api.post(`/messages/${messageId}/regenerate`);
  },

  getArtifacts(messageId: string) {
    return api.get(`/messages/${messageId}/artifacts`);
  },
};

export default api;
