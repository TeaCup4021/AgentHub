export interface Agent {
  id: string;
  name: string;
  avatarUrl: string | null;
  provider: string;
  model: string;
  systemPrompt?: string;
  capabilities: string[];
  toolConfig: Record<string, unknown>;
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
}
