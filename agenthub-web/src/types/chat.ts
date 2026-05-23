// ========== 消息内容类型 ==========

export interface TextContent {
  type: "text";
  text: string;
}

export interface CodeContent {
  type: "code";
  language: string;
  code: string;
  fileName?: string;
}

export interface DiffContent {
  type: "diff";
  language: string;
  oldCode: string;
  newCode: string;
  fileName?: string;
}

export interface PreviewContent {
  type: "preview";
  url: string;
  title?: string;
  previewType: "web" | "doc" | "ppt";
}

export interface FileContent {
  type: "file";
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

export interface DeployStatusContent {
  type: "deploy_status";
  status: "building" | "deployed" | "failed";
  url?: string;
}

export type MessageContent =
  | TextContent
  | CodeContent
  | DiffContent
  | PreviewContent
  | FileContent
  | DeployStatusContent;

// ========== 消息 ==========

export type MessageRole = "user" | "agent" | "system" | "orchestrator";
export type MessageStatus = "pending" | "streaming" | "done" | "error";

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  agentId?: string;
  agentName?: string;
  content: MessageContent[];
  replyTo?: string;
  status: MessageStatus;
  createdAt: string;
}

// ========== 对话 ==========

export type ConversationType = "single" | "group";

export interface Conversation {
  id: string;
  title: string;
  type: ConversationType;
  agentIds: string[];
  lastMessage?: string;
  lastActiveAt: string;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
}

export interface CreateConversationParams {
  title: string;
  type: ConversationType;
  agentIds: string[];
  initialMessage?: string;
}

// ========== Artifact（产物）==========

export type ArtifactType = "code" | "diff" | "preview" | "file" | "deploy_status";

export interface Artifact {
  id: string;
  type: ArtifactType;
  title?: string;
  content: Record<string, unknown>;
}

export interface CodeArtifactContent {
  fileName?: string;
  language: string;
  code: string;
}

export interface DiffArtifactContent {
  fileName?: string;
  language: string;
  oldCode: string;
  newCode: string;
}

export interface PreviewArtifactContent {
  url: string;
  title?: string;
  previewType: "web" | "doc" | "ppt";
}

export interface FileArtifactContent {
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

export interface DeployStatusArtifactContent {
  status: "building" | "deployed" | "failed";
  url?: string;
}

// ========== SSE 事件 ==========

export type SSEEventType =
  | "message_start"
  | "token"
  | "artifact"
  | "agent_status"
  | "message_end"
  | "error";

export interface SSEMessageStart {
  version: string;
  event_id: string;
  conversation_id: string;
  message_id: string;
  sender: { type: string; id: string; name: string };
  timestamp: string;
}

export interface SSEToken {
  version: string;
  event_id: string;
  conversation_id: string;
  message_id: string;
  delta: string;
  index: number;
  timestamp: string;
}

export interface SSEArtifact {
  version: string;
  event_id: string;
  conversation_id: string;
  message_id: string;
  artifact: Artifact;
  timestamp: string;
}

export interface SSEAgentStatus {
  version: string;
  event_id: string;
  conversation_id: string;
  task_id: string;
  subtask_id: string;
  agent: { id: string; name: string };
  status: "queued" | "running" | "success" | "failed" | "timeout";
  progress: number;
  timestamp: string;
}

export interface SSEMessageEnd {
  version: string;
  event_id: string;
  conversation_id: string;
  message_id: string;
  finish_reason: string;
  usage?: { input_tokens: number; output_tokens: number };
  timestamp: string;
}

export interface SSEError {
  version: string;
  event_id: string;
  conversation_id: string;
  message_id: string;
  code: string;
  message: string;
  retryable: boolean;
  timestamp: string;
}
