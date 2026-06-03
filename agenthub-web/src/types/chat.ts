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

export interface ThinkingStep {
  phase: "thought" | "action" | "observation";
  text: string;
  toolName?: string;
  status?: "pending" | "running" | "done" | "error";
}

export interface ThinkingContent {
  type: "thinking";
  title: string;
  steps: ThinkingStep[];
}

export type MessageContent =
  | TextContent
  | CodeContent
  | DiffContent
  | PreviewContent
  | FileContent
  | DeployStatusContent
  | ThinkingContent;

// ========== 消息 ==========

export type SenderType = "user" | "agent" | "system" | "orchestrator";
export type MessageStatus = "pending" | "streaming" | "done" | "failed";

export interface Message {
  id: string;
  conversationId: string;
  senderType: SenderType;
  senderId?: string;
  senderName?: string;
  parentMessageId?: string;
  contentType: string;
  content: string;
  artifacts: Artifact[];
  status: MessageStatus;
  meta?: Record<string, unknown> | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

// ========== 对话 ==========

export type ConversationType = "single" | "group";

export interface Conversation {
  id: string;
  title: string;
  type: ConversationType;
  ownerId: string;
  agentIds: string[];
  projectId?: string;
  isPinned: boolean;
  isArchived: boolean;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConversationParams {
  title: string;
  type: ConversationType;
  agentIds: string[];
  projectId?: string;
}

export interface UpdateConversationParams {
  title?: string;
  type?: ConversationType;
  isPinned?: boolean;
  isArchived?: boolean;
  agentIds?: string[];
}

// ========== API 响应结构 ==========

export interface MessageListData {
  items: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ========== Artifact（产物）==========

export type ArtifactType = "code" | "diff" | "preview" | "file" | "deploy_status";

// artifactType via SSE is now normalized by ADKToSSETranslator._normalize_artifact_fields

export interface Artifact {
  id: string;
  artifactType: ArtifactType;
  title?: string;
  content: Record<string, unknown>;
  storageKey?: string | null;
  mimeType?: string | null;
  version: number;
  createdAt: string;
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
  | "thinking"
  | "message_end"
  | "error";

export interface PlanSubtask {
  subtask_id: string;
  agent: { id: string; name: string };
  instruction: string;
  priority: number;
}

export interface SummaryResult {
  subtask_id: string;
  status: "success" | "failed";
  message_id: string;
  error?: string;
}

export interface SSEMessageStartMeta {
  plan?: PlanSubtask[];
  subtask_id?: string;
  plan_id?: string;
  planner_agent_id?: string | null;
  planner_agent_name?: string | null;
  summary?: {
    total: number;
    success: number;
    failed: number;
    results: SummaryResult[];
  };
}

export interface SSEMessageStart {
  version: string;
  event_id: string;
  conversation_id: string;
  message_id: string;
  sender: { type: string; id: string; name: string };
  meta?: SSEMessageStartMeta | null;
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
  message_id: string;
  task_id?: string;
  subtask_id: string;
  agent: { id: string; name: string };
  status: "queued" | "running" | "success" | "failed" | "timeout";
  progress: number;
  timestamp: string;
}

export interface SSEThinking {
  version: string;
  event_id: string;
  conversation_id: string;
  message_id: string;
  phase: "thought" | "action" | "observation";
  text: string;
  tool_name?: string;
  status: "pending" | "running" | "done" | "error";
  step_index: number;
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

// ========== DAG 可视化 ==========

export interface DagNode {
  subtaskId: string;
  agentId: string;
  agentName: string;
  instruction: string;
  status: string;
  latencyMs?: number;
  outputMessageId?: string;
}

export interface DagEdge {
  from: string;
  to: string;
}

export interface PinInfo {
  pin_id: string;
  message_id: string;
  content_preview: string;
  sender_type: string;
  pinned_at: string | null;
  pinned_by: string;
}

export interface DagResponse {
  taskId: string;
  status: string;
  nodes: DagNode[];
  edges: DagEdge[];
}
