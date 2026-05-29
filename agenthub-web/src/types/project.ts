export interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  defaultAgentIds: string[];
  conversationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectParams {
  name: string;
  description?: string;
  defaultAgentIds?: string[];
}

export interface UpdateProjectParams {
  name?: string;
  description?: string;
  defaultAgentIds?: string[];
}
