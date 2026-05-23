import type { Conversation, CreateConversationParams } from "./chat";
import type { Agent, CreateAgentParams } from "./agent";

// ========== 通用响应 ==========

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

export interface PaginatedResponse<T> {
  code: number;
  data: {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
  };
  message: string;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// ========== 对话 API ==========

export type CreateConversationRequest = CreateConversationParams;
export type CreateConversationResponse = ApiResponse<Conversation>;

export type GetConversationListResponse = ApiResponse<Conversation[]>;

export type GetConversationDetailResponse = ApiResponse<Conversation>;

export interface UpdateConversationRequest {
  title?: string;
  isPinned?: boolean;
  isArchived?: boolean;
}
export type UpdateConversationResponse = ApiResponse<Conversation>;

// ========== Agent API ==========

export type GetAgentListResponse = ApiResponse<Agent[]>;
export type GetAgentDetailResponse = ApiResponse<Agent>;
export type CreateAgentRequest = CreateAgentParams;
export type CreateAgentResponse = ApiResponse<Agent>;
