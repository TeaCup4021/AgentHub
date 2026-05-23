## Phase 1: 类型对齐 + 基础设施

### Task 1.1: 对齐后端 SSE 事件类型

**Files:**
- Modify: `src/types/chat.ts`

后端 SSE 协议（见 AgentHub-架构设计.md 第 9 节）定义了 6 种事件。当前前端类型缺少 SSE 事件的完整定义。

- [ ] **Step 1: 在 chat.ts 末尾追加 SSE 事件类型和 Artifact 类型**

```typescript
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
```

- [ ] **Step 2: 验证编译通过**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 1.2: 创建 React Query hooks

**Files:**
- Create: `src/hooks/useConversations.ts`
- Create: `src/hooks/useMessages.ts`
- Create: `src/hooks/useAgents.ts`
- Create: `src/hooks/index.ts`

- [ ] **Step 1: 创建 useConversations hook**

```typescript
// src/hooks/useConversations.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { conversationApi } from "@/lib/api";
import type { Conversation, CreateConversationParams } from "@/types";

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const res = await conversationApi.list();
      return res.data.data;
    },
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ["conversations", id],
    queryFn: async () => {
      const res = await conversationApi.detail(id);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateConversationParams) =>
      conversationApi.create(params).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useUpdateConversation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: { title?: string; isPinned?: boolean; isArchived?: boolean }) =>
      conversationApi.update(id, updates).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations", id] });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => conversationApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}
```

- [ ] **Step 2: 创建 useMessages hook**

```typescript
// src/hooks/useMessages.ts
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { Message } from "@/types";

async function fetchMessages(conversationId: string): Promise<Message[]> {
  const res = await axios.get(`/api/v1/conversations/${conversationId}/messages`);
  return res.data.data ?? [];
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => fetchMessages(conversationId!),
    enabled: !!conversationId,
  });
}
```

- [ ] **Step 3: 创建 useAgents hook**

```typescript
// src/hooks/useAgents.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentApi } from "@/lib/api";
import type { CreateAgentParams } from "@/types";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await agentApi.list();
      return res.data.data;
    },
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateAgentParams) =>
      agentApi.create(params).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}
```

- [ ] **Step 4: 创建 hooks barrel 导出**

```typescript
// src/hooks/index.ts
export { useConversations, useConversation, useCreateConversation, useUpdateConversation, useDeleteConversation } from "./useConversations";
export { useMessages } from "./useMessages";
export { useAgents, useCreateAgent } from "./useAgents";
```

---

### Task 1.3: 重构 SSE 工具（POST → GET，匹配后端协议）

**Files:**
- Modify: `src/lib/sse.ts`

后端 SSE 使用 `GET /api/v1/conversations/{conversation_id}/stream` + `Authorization` header。

- [ ] **Step 1: 重写 sse.ts**

```typescript
// src/lib/sse.ts

export interface SSECallbacks {
  onMessageStart?: (data: import("@/types").SSEMessageStart) => void;
  onToken?: (data: import("@/types").SSEToken) => void;
  onArtifact?: (data: import("@/types").SSEArtifact) => void;
  onAgentStatus?: (data: import("@/types").SSEAgentStatus) => void;
  onMessageEnd?: (data: import("@/types").SSEMessageEnd) => void;
  onError?: (data: import("@/types").SSEError) => void;
  onConnectionError?: (error: Event) => void;
}

export function createSSEStream(
  conversationId: string,
  callbacks: SSECallbacks
): () => void {
  const controller = new AbortController();
  const token = localStorage.getItem("token");

  const eventHandlers: Record<string, (data: unknown) => void> = {
    message_start: (d) => callbacks.onMessageStart?.(d as import("@/types").SSEMessageStart),
    token: (d) => callbacks.onToken?.(d as import("@/types").SSEToken),
    artifact: (d) => callbacks.onArtifact?.(d as import("@/types").SSEArtifact),
    agent_status: (d) => callbacks.onAgentStatus?.(d as import("@/types").SSEAgentStatus),
    message_end: (d) => callbacks.onMessageEnd?.(d as import("@/types").SSEMessageEnd),
    error: (d) => callbacks.onError?.(d as import("@/types").SSEError),
  };

  fetch(`/api/v1/conversations/${conversationId}/stream`, {
    headers: {
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok || !response.body) {
        throw new Error(`SSE 连接失败: ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        let currentData = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            currentData = line.slice(5).trim();
          } else if (line === "" && currentData) {
            const handler = eventHandlers[currentEvent || "message"];
            if (handler) {
              try { handler(JSON.parse(currentData)); } catch { /* 跳过解析失败 */ }
            }
            currentEvent = "";
            currentData = "";
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onConnectionError?.(err);
      }
    });

  return () => controller.abort();
}
```

---

### Task 1.4: 重构 chatStore — 移除 Mock 数据，React Query 接管

**Files:**
- Modify: `src/stores/chatStore.ts`

- [ ] **Step 1: 重写 chatStore 为纯 UI 状态**

```typescript
// src/stores/chatStore.ts
import { create } from "zustand";

interface ChatUIState {
  activeConversationId: string | null;
  searchQuery: string;
  isStreaming: boolean;
  streamingContent: Record<string, import("@/types").MessageContent[]>;

  setActiveConversation: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setIsStreaming: (v: boolean) => void;

  initStreamingMessage: (messageId: string) => void;
  appendStreamToken: (messageId: string, delta: string) => void;
  appendStreamArtifact: (messageId: string, content: import("@/types").MessageContent) => void;
  finalizeStreamingMessage: (messageId: string) => void;
  getStreamingContent: (messageId: string) => import("@/types").MessageContent[];
  clearStreamingContent: (messageId: string) => void;
}

export const useChatStore = create<ChatUIState>((set, get) => ({
  activeConversationId: null,
  searchQuery: "",
  isStreaming: false,
  streamingContent: {},

  setActiveConversation: (id) => set({ activeConversationId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsStreaming: (v) => set({ isStreaming: v }),

  initStreamingMessage: (messageId) =>
    set((s) => ({
      streamingContent: { ...s.streamingContent, [messageId]: [] },
      isStreaming: true,
    })),

  appendStreamToken: (messageId, delta) =>
    set((s) => {
      const contents = [...(s.streamingContent[messageId] || [])];
      const last = contents[contents.length - 1];
      if (last && last.type === "text") {
        contents[contents.length - 1] = { ...last, text: last.text + delta };
      } else {
        contents.push({ type: "text", text: delta });
      }
      return { streamingContent: { ...s.streamingContent, [messageId]: contents } };
    }),

  appendStreamArtifact: (messageId, content) =>
    set((s) => ({
      streamingContent: {
        ...s.streamingContent,
        [messageId]: [...(s.streamingContent[messageId] || []), content],
      },
    })),

  finalizeStreamingMessage: (messageId) =>
    set((s) => {
      const { [messageId]: _, ...rest } = s.streamingContent;
      return { streamingContent: rest, isStreaming: false };
    }),

  getStreamingContent: (messageId) => get().streamingContent[messageId] || [],

  clearStreamingContent: (messageId) =>
    set((s) => {
      const { [messageId]: _, ...rest } = s.streamingContent;
      return { streamingContent: rest };
    }),
}));
```

---

### Task 1.5: 移除 agentStore Mock 数据

**Files:**
- Modify: `src/stores/agentStore.ts`

- [ ] **Step 1: 简化为仅保留选择器工具函数**

```typescript
// src/stores/agentStore.ts
import { create } from "zustand";

interface AgentUIState {
  selectedAgentIds: string[];
  toggleSelectedAgent: (id: string) => void;
  setSelectedAgents: (ids: string[]) => void;
}

export const useAgentStore = create<AgentUIState>((set) => ({
  selectedAgentIds: [],
  toggleSelectedAgent: (id) =>
    set((s) => ({
      selectedAgentIds: s.selectedAgentIds.includes(id)
        ? s.selectedAgentIds.filter((a) => a !== id)
        : [...s.selectedAgentIds, id],
    })),
  setSelectedAgents: (ids) => set({ selectedAgentIds: ids }),
}));
```

---

### Task 1.6: 更新 api.ts — 添加消息 API + 对齐 v1 路径

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: 追加消息 API 并更新 streamUrl 路径**

```typescript
// 在 conversationApi 中将 streamUrl 改为:
streamUrl(id: string): string {
  return `/api/v1/conversations/${id}/stream`;
},

// 在文件末尾追加:

export interface SendMessageRequest {
  content: string;
  mentions?: string[];
  mode?: "auto_orchestrate" | "direct";
}

export const messageApi = {
  send(conversationId: string, data: SendMessageRequest) {
    return api.post(`/v1/conversations/${conversationId}/messages`, data);
  },
  list(conversationId: string, cursor?: string, limit = 50) {
    return api.get(`/v1/conversations/${conversationId}/messages`, { params: { cursor, limit } });
  },
  regenerate(messageId: string) {
    return api.post(`/v1/messages/${messageId}/regenerate`);
  },
  getArtifacts(messageId: string) {
    return api.get(`/v1/messages/${messageId}/artifacts`);
  },
};
```

---

