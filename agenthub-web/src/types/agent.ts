export interface AgentTool {
  name: string;
  description: string;
}

export interface Agent {
  id: string;
  name: string;
  avatar: string;
  provider: "claude-code" | "codex" | "opencode" | "custom";
  capabilities: string[];
  systemPrompt?: string;
  tools: AgentTool[];
  createdAt: string;
}

export interface CreateAgentParams {
  name: string;
  avatar: string;
  systemPrompt: string;
  tools: string[];
}
