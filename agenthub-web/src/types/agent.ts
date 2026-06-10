export interface Agent {
  id: string;
  name: string;
  avatarUrl: string;
  provider: string;
  model: string;
  systemPrompt?: string;
  capabilities: string[];
  toolConfig: Record<string, unknown>;
  baseUrl: string;       // 模型基址（匹配后端 to_camel 输出）
  apiKey: string;         // API Key（匹配后端 to_camel 输出）
  isBuiltin: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentParams {
  name: string;
  avatarUrl?: string;
  provider: string;
  model: string;
  systemPrompt?: string;
  capabilities?: string[];
  toolConfig?: Record<string, unknown>;
  baseUrl: string;       // 必填 — 模型基址
  apiKey: string;         // 必填 — API Key
}

export interface UpdateAgentParams {
  name?: string;
  avatarUrl?: string;
  provider?: string;
  model?: string;
  systemPrompt?: string;
  capabilities?: string[];
  toolConfig?: Record<string, unknown>;
  isActive?: boolean;
  baseUrl?: string;
  apiKey?: string;
}
