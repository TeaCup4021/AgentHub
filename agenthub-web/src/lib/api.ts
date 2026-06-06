import axios from "axios";
import type { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from "axios";
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
  CreateProjectRequest,
  CreateProjectResponse,
  GetProjectListResponse,
  GetProjectDetailResponse,
  UpdateProjectRequest,
  UpdateProjectResponse,
  GetDagResponse,
  PinInfo,
  UploadFileResponse,
} from "@/types";

// [后端对接] Vite 代理 /api → localhost:8080，见 vite.config.ts
const api: AxiosInstance = axios.create({
  baseURL: "/api/v1",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body.code === "number" && body.code >= 400) {
      return Promise.reject(new Error(body.message || "请求失败"));
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem("refresh_token");

      if (!refreshToken) {
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");
        return Promise.reject(error);
      }

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const res = await axios.post("/api/v1/auth/refresh", null, {
            params: { refresh_token: refreshToken },
          });
          const newToken = res.data.data.accessToken;
          localStorage.setItem("token", newToken);
          isRefreshing = false;
          onRefreshed(newToken);
        } catch {
          isRefreshing = false;
          refreshSubscribers = [];
          localStorage.removeItem("token");
          localStorage.removeItem("refresh_token");
          return Promise.reject(error);
        }
      }

      return new Promise((resolve) => {
        addRefreshSubscriber((newToken: string) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          originalRequest._retry = true;
          resolve(api(originalRequest));
        });
      });
    }

    return Promise.reject(error);
  },
);

export const conversationApi = {
  create(data: CreateConversationRequest) {
    return api.post<CreateConversationResponse>("/conversations", {
      title: data.title,
      type: data.type,
      agentIds: data.agentIds,
      projectId: data.projectId,
    });
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

  getPins(conversationId: string) {
    return api.get<ApiResponse<PinInfo[]>>(`/conversations/${conversationId}/pins`);
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

  capabilities() {
    return api.get<ApiResponse<string[]>>("/agents/capabilities");
  },
};

export interface AgentVerifyRequest {
  provider: string;
  model: string;
  systemPrompt?: string;
}

export interface ConfirmPlanItem {
  subtask_id: string;
  agent_id: string;
  instruction: string;
}

// mode: direct / auto_orchestrate / refine_plan / confirm_plan
export interface SendMessageRequest {
  content: string;
  contentType?: string;
  mentions?: string[];
  parentMessageId?: string;
  mode?: "auto_orchestrate" | "direct" | "refine_plan" | "confirm_plan";
  plannerAgentId?: string | null;
  plan_id?: string;
  plan?: ConfirmPlanItem[];
  attachments?: import("@/types").Attachment[];
}

export interface SendMessageResponse extends ApiResponse<Message> {}

export const messageApi = {
  send(conversationId: string, data: SendMessageRequest) {
    return api.post<SendMessageResponse>(`/conversations/${conversationId}/messages`, data);
  },

  list(conversationId: string, cursor?: string, limit = 50, senderType?: string, senderId?: string) {
    return api.get<GetMessageListResponse>(`/conversations/${conversationId}/messages`, {
      params: { cursor, limit, senderType, senderId },
    });
  },

  regenerate(messageId: string) {
    return api.post<SendMessageResponse>(`/messages/${messageId}/regenerate`);
  },

  getArtifacts(messageId: string) {
    return api.get<GetArtifactsResponse>(`/messages/${messageId}/artifacts`);
  },
};

export const projectApi = {
  list() {
    return api.get<GetProjectListResponse>("/projects");
  },

  detail(id: string) {
    return api.get<GetProjectDetailResponse>(`/projects/${id}`);
  },

  create(data: CreateProjectRequest) {
    return api.post<CreateProjectResponse>("/projects", data);
  },

  update(id: string, data: UpdateProjectRequest) {
    return api.patch<UpdateProjectResponse>(`/projects/${id}`, data);
  },

  delete(id: string) {
    return api.delete<void>(`/projects/${id}`);
  },
};

export const orchestratorApi = {
  dag(taskId: string) {
    return api.get<GetDagResponse>(`/orchestrator/tasks/${taskId}/dag`);
  },
};

export const artifactApi = {
  getVersions(convId: string, mergeKey: string, page = 1, pageSize = 20) {
    return api.get<
      ApiResponse<import("@/types").ArtifactVersionListResponse>
    >(`/conversations/${convId}/artifacts/${encodeURIComponent(mergeKey)}/versions`, {
      params: { page, pageSize },
    });
  },

  updateContent(convId: string, artifactId: string, content: Record<string, unknown>) {
    return api.patch<
      ApiResponse<{ artifact: import("@/types").Artifact; version: number }>
    >(`/conversations/${convId}/artifacts/${artifactId}`, { content });
  },
};

export const authApi = {
  changePassword(oldPassword: string, newPassword: string) {
    return api.patch<ApiResponse<{ status: string; message: string }>>("/auth/password", {
      old_password: oldPassword,
      new_password: newPassword,
    });
  },

  updateProfile(data: { name?: string; avatarUrl?: string }) {
    return api.patch<ApiResponse<import("@/stores/authStore").User>>("/auth/me", data);
  },
};

interface ApplyDiffParams {
  fileName: string;
  code: string;
  language?: string;
}

interface ApplyDiffResult {
  fileId: string;
  downloadUrl: string;
}

export const fileApi = {
  upload(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<UploadFileResponse>("/files/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  updateContent(fileId: string, content: string) {
    return api.put(`/files/${fileId}/content`, { content });
  },

  applyDiff(data: ApplyDiffParams) {
    return api.post<ApiResponse<ApplyDiffResult>>("/files/apply-diff", data);
  },

  getDownloadUrl(fileId: string): string {
    return `/api/v1/files/${fileId}/download`;
  },
};

export default api;
