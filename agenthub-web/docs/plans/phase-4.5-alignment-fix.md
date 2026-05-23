# Phase 4.5: 前后端对齐修复

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将前端类型定义、API 层、Hooks 和后端接口完全对齐，消除 12 个已识别的数据模型和 API 契约不一致。

**Architecture:** 分三层修复 —— (1) 类型层：统一 Agent/Message/Conversation 数据模型，(2) API 层：修复端点路径、请求体、响应格式解包，(3) 组件层：适配新的数据结构。先改类型定义（零运行时成本），再改 API 和 Hooks，最后适配组件。

**Tech Stack:** TypeScript, React Query, Axios, Zustand

---

## 文件结构

```
修改:
  src/types/agent.ts          — Agent 类型重构
  src/types/chat.ts           — Message 内容结构改为后端对齐的存储格式
  src/types/api.ts            — API 请求/响应类型修复
  src/lib/api.ts              — API 端点和对齐修复
  src/hooks/useAgents.ts      — 适配新 Agent 类型
  src/hooks/useConversations.ts — 适配分页响应
  src/hooks/useMessages.ts    — 适配新 Message 类型
  src/stores/chatStore.ts     — content 结构适配
  src/mocks/data.ts           — Mock 数据适配新类型
  src/mocks/handlers.ts       — Mock handler 响应格式修复
  src/mocks/sse.ts            — Mock SSE 适配
  src/components/agent/CreateAgentModal.tsx — 新增 provider/model 字段
  src/components/chat/ChatHeader.tsx        — Agent 类型适配
  src/components/chat/MessageList.tsx        — Message content 适配
  src/components/cards/CardRenderer.tsx      — content type 适配
  src/components/layout/ChatArea.tsx         — SSE 数据流适配
  src/components/layout/Sidebar.tsx          — Conversation 类型适配
```

---

### Task 4.5.1: Agent 类型定义对齐

**Files:**
- Modify: `src/types/agent.ts`
- Modify: `src/types/api.ts`

**说明:** 前端 Agent 类型与后端 AgentResponse schema 不一致。需要添加 `model`、`isBuiltin`、`isActive`、`updatedAt` 字段；将 `avatar` 改为 `avatarUrl`；将 `tools: AgentTool[]` 改为 `toolConfig: Record<string, unknown>`；扩展 `provider` 为后端实际使用的字符串值。

- [ ] **Step 1: 重写 Agent 类型定义**

```typescript
// src/types/agent.ts

export interface Agent {
  id: string;
  name: string;
  avatarUrl: string;
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
```

- [ ] **Step 2: 更新 api.ts 中的 Agent 相关类型别名**

```typescript
// src/types/api.ts — 修改以下类型别名

export type CreateAgentRequest = CreateAgentParams;
export type UpdateAgentRequest = UpdateAgentParams;
export type CreateAgentResponse = ApiResponse<Agent>;
export type UpdateAgentResponse = ApiResponse<Agent>;
export type GetAgentListResponse = ApiResponse<Agent[]>;
export type GetAgentDetailResponse = ApiResponse<Agent>;
```

- [ ] **Step 3: 删除旧的 api.ts 中不再需要的类型**

确保 `src/types/api.ts` 中移除任何旧的 agent 相关别名（如指向旧 `CreateAgentParams` 的别名），替换为以上新定义。

- [ ] **Step 4: 类型检查**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

Expected: 由于其他文件尚未更新，会有类型错误——这属于预期行为。

---

### Task 4.5.2: Conversation 类型定义对齐

**Files:**
- Modify: `src/types/chat.ts`
- Modify: `src/types/api.ts`

**说明:** Conversation 需要添加 `ownerId`、移除不在后端 schema 中的 `lastMessage`。API 响应类型需要从数组改为分页结构。

- [ ] **Step 1: 重写 Conversation 类型**

```typescript
// src/types/chat.ts — 修改 Conversation 接口

export interface Conversation {
  id: string;
  title: string;
  type: ConversationType;
  ownerId: string;
  agentIds: string[];
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
  initialMessage?: string;
}

export interface UpdateConversationParams {
  title?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  agentIds?: string[];
}
```

- [ ] **Step 2: 定义分页响应类型**

```typescript
// src/types/api.ts — 添加（如果还不存在）或确认存在

export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GetConversationListResponse extends ApiResponse<PaginatedData<Conversation>> {}
export interface GetConversationDetailResponse extends ApiResponse<Conversation> {}
export interface CreateConversationResponse extends ApiResponse<Conversation> {}
export interface UpdateConversationResponse extends ApiResponse<Conversation> {}
export interface DeleteConversationResponse extends ApiResponse<null> {}
```

- [ ] **Step 3: Conversation query params 类型**

```typescript
// src/types/api.ts

export interface ConversationListParams {
  keyword?: string;
  page?: number;
  pageSize?: number;
}
```

- [ ] **Step 4: 类型检查**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 4.5.3: Message 类型定义对齐

**Files:**
- Modify: `src/types/chat.ts`

**说明:** Message 模型需要与后端对齐。核心变更：`content` 从 `MessageContent[]` 改为分为 `contentType` + `content`（文本），富媒体产物通过 artifacts 关联而非内联。状态值从 `"error"` 改为 `"failed"`。字段名 `role` 改为 `senderType`。

> **设计决策:** 前端保持富媒体渲染能力，但在 API 层增加转换逻辑。服务端消息的 `content` 字段承载纯文本，`artifacts` 表承载富媒体卡片。前端在呈现时将 artifacts 重新关联到消息的 content 数组中。这样既与后端 schema 对齐，又不放弃用户体验。

- [ ] **Step 1: 重写 Message 类型**

```typescript
// src/types/chat.ts — Message 接口

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
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: 删除或降级 MessageContent 联合类型**

`MessageContent` 联合类型（text/code/diff/preview/file/deploy_status）从前端 Message 的 content 字段中移除。保留类型定义但不再作为 `Message.content` 的类型，改为由 `CardRenderer` 消费从 `Artifact[]` 转换而来的数据。

`Artifact` 和 `ArtifactType` 保持不变，继续作为 SSE artifact 事件和 artifact API 的类型。

- [ ] **Step 3: 新增 Artifact list API 响应类型**

```typescript
// src/types/api.ts

export type GetArtifactsResponse = ApiResponse<Artifact[]>;
```

- [ ] **Step 4: 类型检查**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 4.5.4: API 层端点修复

**Files:**
- Modify: `src/lib/api.ts`

**说明:** 修复 API 端点路径、请求/响应类型签名，添加缺失的端点。code=0 → code 为 2xx 范围。

- [ ] **Step 1: 修复 Axios 拦截器中的 code 判断**

```typescript
// src/lib/api.ts — 响应拦截器

api.interceptors.response.use(
  (response) => {
    // 后端中间件返回 code: 200 表示成功，非 2xx code 表示业务错误
    const body = response.data;
    if (body && typeof body.code === "number" && body.code >= 400) {
      return Promise.reject(new Error(body.message || "请求失败"));
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
```

- [ ] **Step 2: 修复 conversationApi**

```typescript
// src/lib/api.ts — conversationApi 对象

export const conversationApi = {
  create(data: CreateConversationRequest): Promise<AxiosResponse<CreateConversationResponse>> {
    return api.post("/conversations/", data);
  },

  list(params?: ConversationListParams): Promise<AxiosResponse<GetConversationListResponse>> {
    return api.get("/conversations/", { params });
  },

  detail(id: string): Promise<AxiosResponse<GetConversationDetailResponse>> {
    return api.get(`/conversations/${id}`);
  },

  update(id: string, data: UpdateConversationRequest): Promise<AxiosResponse<UpdateConversationResponse>> {
    return api.patch(`/conversations/${id}`, data);
  },

  delete(id: string): Promise<AxiosResponse<DeleteConversationResponse>> {
    return api.delete(`/conversations/${id}`);
  },

  streamUrl(id: string): string {
    return `/api/v1/conversations/${id}/stream`;
  },

  pinMessage(conversationId: string, messageId: string): Promise<AxiosResponse<ApiResponse<null>>> {
    return api.post(`/conversations/${conversationId}/pins`, { message_id: messageId });
  },

  unpinMessage(conversationId: string, messageId: string): Promise<AxiosResponse<ApiResponse<null>>> {
    return api.delete(`/conversations/${conversationId}/pins/${messageId}`);
  },
};
```

- [ ] **Step 3: 修复 agentApi**

```typescript
// src/lib/api.ts — agentApi 对象

export const agentApi = {
  list(): Promise<AxiosResponse<GetAgentListResponse>> {
    return api.get("/agents");
  },

  detail(id: string): Promise<AxiosResponse<GetAgentDetailResponse>> {
    return api.get(`/agents/${id}`);
  },

  create(data: CreateAgentRequest): Promise<AxiosResponse<CreateAgentResponse>> {
    return api.post("/agents", data);
  },

  update(id: string, data: UpdateAgentRequest): Promise<AxiosResponse<UpdateAgentResponse>> {
    return api.patch(`/agents/${id}`, data);
  },

  verify(data: AgentVerifyRequest): Promise<AxiosResponse<{ status: string; message: string }>> {
    return api.post("/agents/verify", data);
  },
};
```

- [ ] **Step 4: 扩展 messageApi 返回类型**

```typescript
// src/lib/api.ts

export interface SendMessageRequest {
  content: string;
  mentions?: string[];
  mode?: "auto_orchestrate" | "direct";
}

export interface SendMessageResponse extends ApiResponse<Message> {}
export interface GetMessageListResponse extends ApiResponse<Message[]> {}

export const messageApi = {
  send(conversationId: string, data: SendMessageRequest): Promise<AxiosResponse<SendMessageResponse>> {
    return api.post(`/conversations/${conversationId}/messages`, data);
  },

  list(conversationId: string, cursor?: string, limit = 50): Promise<AxiosResponse<GetMessageListResponse>> {
    return api.get(`/conversations/${conversationId}/messages`, {
      params: { cursor, limit },
    });
  },

  regenerate(messageId: string): Promise<AxiosResponse<SendMessageResponse>> {
    return api.post(`/messages/${messageId}/regenerate`);
  },

  getArtifacts(messageId: string): Promise<AxiosResponse<GetArtifactsResponse>> {
    return api.get(`/messages/${messageId}/artifacts`);
  },
};
```

- [ ] **Step 5: 类型检查**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 4.5.5: Hooks 适配修复

**Files:**
- Modify: `src/hooks/useAgents.ts`
- Modify: `src/hooks/useConversations.ts`
- Modify: `src/hooks/useMessages.ts`

**说明:** Hooks 需要适配新的 API 响应格式（分页 vs 数组）、新的类型名和字段名。

- [ ] **Step 1: 修复 useAgents.ts**

```typescript
// src/hooks/useAgents.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentApi } from "@/lib/api";
import type { CreateAgentParams, UpdateAgentParams } from "@/types";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await agentApi.list();
      return res.data.data;
    },
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ["agents", id],
    queryFn: async () => {
      const res = await agentApi.detail(id);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: CreateAgentParams) => {
      const res = await agentApi.create(params);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useUpdateAgent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: UpdateAgentParams) => {
      const res = await agentApi.update(id, params);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agents", id] });
    },
  });
}
```

- [ ] **Step 2: 修复 useConversations.ts 适配分页响应**

```typescript
// src/hooks/useConversations.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { conversationApi } from "@/lib/api";
import type { CreateConversationParams, UpdateConversationParams, ConversationListParams } from "@/types";

export function useConversations(params?: ConversationListParams) {
  return useQuery({
    queryKey: ["conversations", params],
    queryFn: async () => {
      const res = await conversationApi.list(params);
      return res.data.data; // { list, total, page, pageSize }
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
    mutationFn: async (params: CreateConversationParams) => {
      const res = await conversationApi.create(params);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useUpdateConversation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: UpdateConversationParams) => {
      const res = await conversationApi.update(id, updates);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations", id] });
    },
  });
}

export function useUpdateAnyConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & UpdateConversationParams) => {
      const res = await conversationApi.update(id, updates);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await conversationApi.delete(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
```

- [ ] **Step 3: 修复 useMessages.ts**

```typescript
// src/hooks/useMessages.ts

import { useQuery } from "@tanstack/react-query";
import { messageApi } from "@/lib/api";

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const res = await messageApi.list(conversationId);
      return res.data.data ?? [];
    },
    enabled: !!conversationId,
  });
}
```

- [ ] **Step 4: 类型检查**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 4.5.6: Store 适配

**Files:**
- Modify: `src/stores/chatStore.ts`

**说明:** chatStore 中的 streamingContent 需要适配新的 Message 结构。content 从 `MessageContent[]` 改为字符串拼接方式（SSE token 逐个追加到文本中），artifacts 通过 appendStreamArtifact 单独追加。

- [ ] **Step 1: 更新 chatStore streamingContent 结构**

```typescript
// src/stores/chatStore.ts

import { create } from "zustand";
import type { Artifact } from "@/types";

interface StreamingMessage {
  content: string;
  artifacts: Artifact[];
}

interface ChatUIState {
  activeConversationId: string | null;
  searchQuery: string;
  isStreaming: boolean;
  streamingContent: Record<string, StreamingMessage>;

  setActiveConversation: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setIsStreaming: (v: boolean) => void;
  initStreamingMessage: (messageId: string) => void;
  appendStreamToken: (messageId: string, delta: string) => void;
  appendStreamArtifact: (messageId: string, artifact: Artifact) => void;
  finalizeStreamingMessage: (messageId: string) => void;
  getStreamingContent: (messageId: string) => StreamingMessage | undefined;
  clearStreamingContent: (messageId: string) => void;
}

export const useChatStore = create<ChatUIState>((set, get) => ({
  activeConversationId: null,
  searchQuery: "",
  isStreaming: false,
  streamingContent: {},

  setActiveConversation: (id) => set({ activeConversationId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setIsStreaming: (v) => set({ isStreaming: v }),

  initStreamingMessage: (messageId) =>
    set((s) => ({
      isStreaming: true,
      streamingContent: {
        ...s.streamingContent,
        [messageId]: { content: "", artifacts: [] },
      },
    })),

  appendStreamToken: (messageId, delta) =>
    set((s) => {
      const entry = s.streamingContent[messageId];
      if (!entry) return s;
      return {
        streamingContent: {
          ...s.streamingContent,
          [messageId]: { ...entry, content: entry.content + delta },
        },
      };
    }),

  appendStreamArtifact: (messageId, artifact) =>
    set((s) => {
      const entry = s.streamingContent[messageId];
      if (!entry) return s;
      return {
        streamingContent: {
          ...s.streamingContent,
          [messageId]: {
            ...entry,
            artifacts: [...entry.artifacts, artifact],
          },
        },
      };
    }),

  finalizeStreamingMessage: (messageId) =>
    set((s) => {
      const { [messageId]: _, ...rest } = s.streamingContent;
      return { isStreaming: false, streamingContent: rest };
    }),

  getStreamingContent: (messageId) => get().streamingContent[messageId],

  clearStreamingContent: (messageId) =>
    set((s) => {
      const { [messageId]: _, ...rest } = s.streamingContent;
      return { streamingContent: rest };
    }),
}));
```

- [ ] **Step 2: 类型检查**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 4.5.7: Mock 数据适配

**Files:**
- Modify: `src/mocks/data.ts`
- Modify: `src/mocks/handlers.ts`
- Modify: `src/mocks/sse.ts`

**说明:** Mock 数据必须反映新的类型定义，包括 agent 的 provider/model/toolConfig、conversation 的分页结构、message 的 contentType/content/artifacts 结构。

- [ ] **Step 1: 更新 mock data.ts 中的 Agent**

```typescript
// src/mocks/data.ts — 替换 mockAgents

export const mockAgents: Agent[] = [
  {
    id: "agent-claude-code",
    name: "Claude Code",
    avatarUrl: "",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    capabilities: ["coding", "review", "refactoring", "debugging"],
    systemPrompt: "你是一个专业的前端代码助手。",
    toolConfig: {
      tools: ["read_file", "write_file", "execute_command", "web_search"],
    },
    isBuiltin: true,
    isActive: true,
    createdAt: "2026-05-20T08:00:00Z",
    updatedAt: "2026-05-20T08:00:00Z",
  },
  {
    id: "agent-codex",
    name: "Codex",
    avatarUrl: "",
    provider: "litellm",
    model: "openai/gpt-5",
    capabilities: ["coding", "autocomplete", "docs"],
    systemPrompt: "你是一个全栈代码生成助手。",
    toolConfig: {
      tools: ["read_file", "write_file", "execute_command"],
    },
    isBuiltin: true,
    isActive: true,
    createdAt: "2026-05-20T08:00:00Z",
    updatedAt: "2026-05-20T08:00:00Z",
  },
  {
    id: "agent-opencode",
    name: "OpenCode",
    avatarUrl: "",
    provider: "litellm",
    model: "anthropic/claude-haiku-4-5",
    capabilities: ["coding", "review", "docs"],
    systemPrompt: "你是一个代码审查和文档生成助手。",
    toolConfig: {
      tools: ["read_file", "write_file", "web_search"],
    },
    isBuiltin: true,
    isActive: true,
    createdAt: "2026-05-20T08:00:00Z",
    updatedAt: "2026-05-20T08:00:00Z",
  },
];
```

- [ ] **Step 2: 更新 mock data.ts 中的 Conversation**

```typescript
// src/mocks/data.ts — 替换 mockConversations

export const mockConversations: Conversation[] = [
  {
    id: "conv-1",
    title: "用 React 写一个登录页面",
    type: "single",
    ownerId: "00000000-0000-0000-0000-000000000001",
    agentIds: ["agent-claude-code"],
    isPinned: true,
    isArchived: false,
    lastActiveAt: "2026-05-21T14:00:00Z",
    createdAt: "2026-05-21T10:00:00Z",
    updatedAt: "2026-05-21T14:00:00Z",
  },
  // ... conv-2, conv-3 类似结构
];
```

- [ ] **Step 3: 更新 mock data.ts 中的 Message**

```typescript
// src/mocks/data.ts — 替换 mockMessages，使用新的 Message 结构

export const mockMessages: Record<string, Message[]> = {
  "conv-1": [
    {
      id: "msg-1",
      conversationId: "conv-1",
      senderType: "user",
      senderId: "user-1",
      senderName: "我",
      contentType: "text",
      content: "用 React 写一个带表单验证的登录页面",
      artifacts: [],
      status: "done",
      createdAt: "2026-05-21T14:00:00Z",
      updatedAt: "2026-05-21T14:00:00Z",
    },
    {
      id: "msg-2",
      conversationId: "conv-1",
      senderType: "agent",
      senderId: "agent-claude-code",
      senderName: "Claude Code",
      contentType: "text",
      content: "我来为你创建一个完整的 React 登录页面组件：",
      artifacts: [
        {
          id: "artifact-1",
          type: "code",
          title: "LoginPage.tsx",
          content: {
            language: "tsx",
            code: `import React, { useState } from "react";\n\nexport function LoginPage() {\n  const [email, setEmail] = useState("");\n  const [password, setPassword] = useState("");\n  const [errors, setErrors] = useState<string[]>([]);\n\n  const validate = () => {\n    const errs: string[] = [];\n    if (!email.includes("@")) errs.push("邮箱格式不正确");\n    if (password.length < 6) errs.push("密码至少6位");\n    return errs;\n  };\n\n  const handleSubmit = (e: React.FormEvent) => {\n    e.preventDefault();\n    const errs = validate();\n    if (errs.length > 0) { setErrors(errs); return; }\n    console.log("登录", { email, password });\n  };\n\n  return (\n    <form onSubmit={handleSubmit} className=\"max-w-sm mx-auto mt-20\">\n      <input value={email} onChange={e => setEmail(e.target.value)} placeholder=\"邮箱\" />\n      <input type=\"password\" value={password} onChange={e => setPassword(e.target.value)} placeholder=\"密码\" />\n      {errors.map(e => <p key={e} className=\"text-red-500\">{e}</p>)}\n      <button type=\"submit\">登录</button>\n    </form>\n  );\n}`,
            fileName: "LoginPage.tsx",
          },
        },
      ],
      status: "done",
      createdAt: "2026-05-21T14:00:05Z",
      updatedAt: "2026-05-21T14:00:05Z",
    },
  ],
  // ... conv-2, conv-3 类似重构
};
```

- [ ] **Step 4: 更新 mock handlers.ts 响应格式**

```typescript
// src/mocks/handlers.ts — 关键修改点

// 1. 分页响应包装
function paginatedResponse<T>(list: T[], page = 1, pageSize = 20) {
  return {
    code: 200,
    data: { list, total: list.length, page, pageSize },
    message: "success",
  };
}

// 2. 成功响应包装（code: 200 而非 code: 0）
function successResponse<T>(data: T) {
  return { code: 200, data, message: "success" };
}

// 3. conversation list 返回分页
mock.onGet("/api/v1/conversations/").reply((config) => {
  return [200, paginatedResponse(mockConversations)];
});

// 4. agent list 返回数组
mock.onGet("/api/v1/agents").reply(() => {
  return [200, successResponse(mockAgents)];
});
```

- [ ] **Step 5: 更新 mock sse.ts artifact 格式**

artifacts 保持与 `SSEArtifact` 事件结构一致，type 字段已对齐，无需额外修改。

- [ ] **Step 6: 类型检查**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 4.5.8: 组件适配

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/ChatArea.tsx`
- Modify: `src/components/layout/AppLayout.tsx`
- Modify: `src/components/chat/ChatHeader.tsx`
- Modify: `src/components/chat/MessageList.tsx`
- Modify: `src/components/cards/CardRenderer.tsx`

**说明:** 组件需要适配新的 props 类型，特别是 Conversation 不再有 `lastMessage`、Message 的 content 从数组变为字符串+artifacts。

- [ ] **Step 1: 修复 Sidebar.tsx**

主要变更：
- `conversation.lastMessage` → 移除（后端没有此字段），侧边栏预览用 `conversation.title` 替代
- Conversation list 从分页对象获取：`conversations.list` 而非 `conversations`
- `agentIds` 访问方式不变

```typescript
// Sidebar.tsx — 关键修改点

// conversation 排序逻辑中，移除 lastMessage 引用
const sortedConversations = useMemo(() => {
  const list = conversations?.list ?? [];
  return [...list].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
  });
}, [conversations]);

// 对话列表项的预览文本
// 旧: {conversation.lastMessage || "暂无消息"}
// 新: 直接显示标题或空状态
<span className="text-xs text-sidebar-muted truncate">
  {conversation.type === "group" ? "群聊" : "单聊"}
</span>
```

- [ ] **Step 2: 修复 AppLayout.tsx**

```typescript
// AppLayout.tsx — conversations 从分页对象获取
const { data: conversationsData } = useConversations();
const conversations = conversationsData?.list ?? [];

// 传递给 Sidebar 时保持不变（仍然是 Conversation[]）
```

- [ ] **Step 3: 修复 ChatHeader.tsx**

Agent 属性名变更：`agent.avatar` → `agent.avatarUrl`，新增 `agent.model` 展示。

```typescript
// ChatHeader.tsx — avatar 改为 avatarUrl
<img
  src={agent.avatarUrl || "/default-avatar.svg"}
  alt={agent.name}
  className="h-5 w-5 rounded-full"
/>
```

- [ ] **Step 4: 修复 MessageList.tsx**

核心变更：Message content 从 `MessageContent[]` 改为 `{ content: string; artifacts: Artifact[] }`。

```typescript
// MessageList.tsx — MessageBubble 渲染逻辑

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.senderType === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* 文本内容 */}
      {message.content && (
        <TextBubble text={message.content} isUser={isUser} />
      )}

      {/* Artifacts 转卡片 */}
      {message.artifacts.map((artifact) => (
        <CardRenderer key={artifact.id} artifact={artifact} />
      ))}
    </div>
  );
}

// StreamingMessageBubble 适配
function StreamingMessageBubble({ messageId }: { messageId: string }) {
  const streamingContent = useChatStore((s) => s.getStreamingContent(messageId));

  if (!streamingContent) return null;

  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white text-xs">
        AI
      </div>
      <div className="max-w-[80%]">
        {streamingContent.content && (
          <TextBubble text={streamingContent.content} isUser={false} cursor />
        )}
        {streamingContent.artifacts.map((artifact) => (
          <CardRenderer key={artifact.id} artifact={artifact} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 修复 ChatArea.tsx — SSE 处理逻辑**

```typescript
// ChatArea.tsx — mapArtifactToContent 函数不再需要
// 直接存储 artifact 到 chatStore

const sseCallbacks: SSECallbacks = {
  onMessageStart: (data) => {
    chatStore.initStreamingMessage(data.message_id);
  },
  onToken: (data) => {
    chatStore.appendStreamToken(data.message_id, data.delta);
  },
  onArtifact: (data) => {
    chatStore.appendStreamArtifact(data.message_id, data.artifact);
  },
  onMessageEnd: () => {
    chatStore.finalizeStreamingMessage(streamMsgId);
    queryClient.invalidateQueries({ queryKey: ["messages", activeConversationId] });
  },
  // ...
};
```

- [ ] **Step 6: 修复 CardRenderer — 改为接收 Artifact**

```typescript
// CardRenderer.tsx — props 从 { content: MessageContent } 改为 { artifact: Artifact }

interface CardRendererProps {
  artifact: Artifact;
}

const cardRegistry: Record<string, React.FC<CardRendererProps>> = {
  code: CodeCard,
  diff: DiffCard,
  preview: PreviewCard,
  file: FileCard,
  deploy_status: DeployStatusCard,
};

export function CardRenderer({ artifact }: CardRendererProps) {
  const Card = cardRegistry[artifact.type];
  if (!Card) return null;
  return <Card artifact={artifact} />;
}
```

- [ ] **Step 7: 修复各子卡片组件 props 类型**

每个卡片组件（CodeCard、DiffCard、PreviewCard、FileCard）从接收 `content: XxxContent` 改为接收 `artifact: Artifact`，内部通过 `artifact.content as XxxArtifactContent` 获取具体内容。

```typescript
// CodeCard.tsx 示例
import type { Artifact, CodeArtifactContent } from "@/types";

interface CodeCardProps {
  artifact: Artifact;
}

export function CodeCard({ artifact }: CodeCardProps) {
  const c = artifact.content as CodeArtifactContent;

  return (
    <div className="my-2 rounded-lg bg-gray-900 text-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
        <span className="text-xs text-gray-400">
          {c.fileName || artifact.title || "代码"}
        </span>
        <span className="text-xs text-gray-500">{c.language}</span>
      </div>
      <pre className="p-4 overflow-x-auto">
        <code>{c.code}</code>
      </pre>
    </div>
  );
}
```

- [ ] **Step 8: 类型检查**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

Expected: 零错误。

---

### Task 4.5.9: CreateAgentModal 表单扩展

**Files:**
- Modify: `src/components/agent/CreateAgentModal.tsx`

**说明:** 根据修复后的 Agent 类型，创建表单需要新增 `provider` 和 `model` 字段（它们是后端 API 的必填字段）。

- [ ] **Step 1: 添加 provider 和 model 表单项**

```typescript
// CreateAgentModal.tsx — 在 capabilities 前面新增 provider 和 model 字段

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic" },
  { value: "litellm", label: "LiteLLM" },
];

const MODELS_BY_PROVIDER: Record<string, string[]> = {
  anthropic: ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-7"],
  litellm: ["openai/gpt-5", "anthropic/claude-haiku-4-5"],
};

// 在组件内
const [provider, setProvider] = useState("anthropic");
const [model, setModel] = useState("claude-sonnet-4-6");

// 创建时
const handleCreate = () => {
  if (!name.trim()) return;
  createAgent.mutate(
    {
      name: name.trim(),
      avatarUrl: "",
      provider,
      model,
      systemPrompt: systemPrompt.trim(),
      capabilities,
      toolConfig: { tools },
    },
    {
      onSuccess: () => {
        setName("");
        setSystemPrompt("");
        setCapabilities([]);
        setTools([]);
        setProvider("anthropic");
        setModel("claude-sonnet-4-6");
        onClose();
      },
    }
  );
};
```

JSX 中在名称字段后添加：

```tsx
{/* Provider 选择 */}
<div className="mb-3">
  <span className="text-sm font-medium text-gray-700">供应商</span>
  <select
    value={provider}
    onChange={(e) => { setProvider(e.target.value); setModel(MODELS_BY_PROVIDER[e.target.value][0]); }}
    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
  >
    {PROVIDERS.map((p) => (
      <option key={p.value} value={p.value}>{p.label}</option>
    ))}
  </select>
</div>

{/* Model 选择 */}
<div className="mb-3">
  <span className="text-sm font-medium text-gray-700">模型</span>
  <select
    value={model}
    onChange={(e) => setModel(e.target.value)}
    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
  >
    {MODELS_BY_PROVIDER[provider].map((m) => (
      <option key={m} value={m}>{m}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 2: 类型检查**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 4.5.10: 最终验证与提交

**Files:**
- 所有已修改的文件

- [ ] **Step 1: 全面类型检查**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

Expected: 零错误。

- [ ] **Step 2: 启动开发服务器验证**

```bash
cd agenthub-web && npm run dev
```

验证点：
- 侧边栏对话列表正常渲染
- 点击对话可以加载消息
- 消息文本和卡片（代码/差异/预览/文件）正常显示
- 发送消息触发 SSE 流式响应正常
- 创建 Agent 表单可以提交（含 provider/model 字段）

- [ ] **Step 3: 提交**

```bash
git add agenthub-web/src/types/ agenthub-web/src/lib/api.ts agenthub-web/src/hooks/ agenthub-web/src/stores/ agenthub-web/src/mocks/ agenthub-web/src/components/
git commit -m "fix: Phase 4.5 — 前后端数据模型与 API 对齐

- Agent: 添加 model/isBuiltin/isActive/updatedAt 字段，avatar→avatarUrl，tools→toolConfig
- Conversation: 添加 ownerId/updatedAt，移除 lastMessage，适配分页响应
- Message: content 从 MessageContent[] 改为 content+artifacts 结构，role→senderType，error→failed
- API: 修复端点路径、code 判断逻辑，添加缺失的 GET/POST/PATCH/DELETE 端点
- Hooks: 适配分页响应、新类型和新字段名
- Mock: 数据结构和响应格式与后端一致
- 组件: 适配新的 props 类型和 Agent 表单扩展"
```

---

## 对齐修复的三层策略总结

| 层级 | 修复内容 | 风险 |
|------|---------|------|
| **类型层** (Task 1-3) | 重写 Agent/Message/Conversation 类型定义 | 零风险（纯类型，不影响运行时） |
| **API+Hooks 层** (Task 4-5) | 修复端点、响应解包、code 判断、分页适配 | 低风险（Mock 模式下覆盖相同路径） |
| **组件层** (Task 6-9) | 适配新 props，Agent 表单新增字段 | 中风险（UI 渲染路径变更） |

所有 Mock 数据同时更新，确保在 Mock 模式下功能与真实后端完全一致。

---

## 与 Phase 4 的关系

Phase 4.5 在 **Phase 4 之前执行**，优先级更高。Phase 4（Agent 管理）中的 CreateAgentModal 表单在本计划 Task 9 中一并扩展了 provider/model 字段，实现 Phase 4 时直接基于对齐后的类型即可。
