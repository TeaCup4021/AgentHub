import type { Artifact, Conversation, CreateConversationParams, UpdateConversationParams, MessageListData } from "./chat";
import type { Agent, CreateAgentParams, UpdateAgentParams } from "./agent";
import type { Project, CreateProjectParams, UpdateProjectParams } from "./project";

// ========== 通用响应 ==========

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  code: number;
  data: PaginatedData<T>;
  message: string;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// ========== 对话 API ==========

export type CreateConversationRequest = CreateConversationParams;
export type CreateConversationResponse = ApiResponse<Conversation>;

export type GetConversationListResponse = ApiResponse<PaginatedData<Conversation>>;

export type GetConversationDetailResponse = ApiResponse<Conversation>;

export type UpdateConversationRequest = UpdateConversationParams;
export type UpdateConversationResponse = ApiResponse<Conversation>;

export type DeleteConversationResponse = ApiResponse<void>;

export interface ConversationListParams {
  keyword?: string;
  projectId?: string;
  page?: number;
  pageSize?: number;
}

// ========== Agent API ==========

export type CreateAgentRequest = CreateAgentParams;
export type UpdateAgentRequest = UpdateAgentParams;
export type CreateAgentResponse = ApiResponse<Agent>;
export type UpdateAgentResponse = ApiResponse<Agent>;
export type GetAgentListResponse = ApiResponse<Agent[]>;
export type GetAgentDetailResponse = ApiResponse<Agent>;

// ========== Artifact API ==========

export type GetArtifactsResponse = ApiResponse<Artifact[]>;
export type UpdateArtifactResponse = ApiResponse<Artifact>;

// ========== Project API ==========

export type CreateProjectRequest = CreateProjectParams;
export type CreateProjectResponse = ApiResponse<Project>;
export type GetProjectListResponse = ApiResponse<Project[]>;
export type GetProjectDetailResponse = ApiResponse<Project>;
export type UpdateProjectRequest = UpdateProjectParams;
export type UpdateProjectResponse = ApiResponse<Project>;

// ========== Orchestrator API ==========

export type GetDagResponse = ApiResponse<import("./chat").DagResponse>;

// ========== Message API ==========

export type GetMessageListResponse = ApiResponse<MessageListData>;

// ========== Pin API ==========

export interface PinnedMessage {
  messageId: string;
  conversationId: string;
  content: string;
  senderName: string;
  createdAt: string;
}
export type GetPinsResponse = ApiResponse<PinnedMessage[]>;

// ========== File API ==========

export type UploadFileResponse = ApiResponse<{
  id: string;
  url: string;
  filename: string;
  size: number;
  mime_type: string;
  width?: number;
  height?: number;
  preview_url?: string | null;
  preview_file_id?: string | null;
}>;
