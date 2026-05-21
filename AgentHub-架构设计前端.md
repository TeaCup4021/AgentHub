# AgentHub 多 Agent 协作平台架构设计（React 前端版）

## 1. 项目目标与范围

基于 `课题：AgentHub - 多 Agent 协作平台.md` 要求，前端负责整个平台的 UI 层，核心体验为 IM 聊天式交互：

- 对话列表管理（新建/搜索/置顶/归档/排序）
- 单聊消息收发 + 流式渲染（SSE）
- 群聊多 Agent 协作（Orchestrator 计划展示 + 进度条 + 交织消息流）
- 产物内联渲染（代码/Diff/网页预览/文件附件/部署状态）
- Agent 管理（列表展示 + 表单创建 + 对话式创建）
- @ 提及 Agent 自动补全

技术职责边界：前端负责 UI 渲染和状态管理，所有 Agent 调用、任务编排、协议转换由后端处理。前端通过 REST API 获取数据、通过 SSE 接收流式输出。

---

## 2. 技术栈

| 层     | 选型                                                      |
| ------ | --------------------------------------------------------- |
| 框架   | React 19 + TypeScript                                     |
| 构建   | Vite                                                      |
| 样式   | TailwindCSS（自定义主题色 sidebar/chat）                   |
| 状态   | Zustand（UI 临时状态）+ TanStack React Query（服务端状态） |
| 路由   | react-router-dom v7                                       |
| HTTP   | Axios（拦截器注入 auth token）                             |
| 流式   | 原生 fetch + ReadableStream（SSE 客户端）                  |

---

## 3. 总体架构设计

```text
[Browser]
  │
  ├─ React App
  │   ├─ Components (UI 渲染层)
  │   │   ├─ Layout: AppLayout / Sidebar / ChatArea
  │   │   ├─ Chat: ChatHeader / MessageList / ChatInput
  │   │   ├─ Cards: CodeCard / DiffCard / PreviewCard / FileCard / DeployStatusCard
  │   │   └─ Agent: CreateAgentModal
  │   │
  │   ├─ Hooks (数据层)
  │   │   ├─ useConversations / useMessages / useAgents    ← React Query
  │   │   └─ 读写缓存、乐观更新、自动失效
  │   │
  │   ├─ Stores (UI 状态层)
  │   │   ├─ chatStore: activeId / searchQuery / streamingContent
  │   │   ├─ agentStore: selectedAgentIds
  │   │   └─ uiStore: sidebarOpen / theme / previewPanelOpen
  │   │
  │   └─ Lib (基础设施层)
  │       ├─ api.ts: Axios 实例 + conversationApi / agentApi / messageApi
  │       └─ sse.ts: createSSEStream() — GET /api/v1/.../stream → 事件路由
  │
  ├─ REST ────→ FastAPI 后端 (/api/v1/*)
  └─ SSE ←───── FastAPI 后端 (GET .../stream)
```

### 数据流规则

```
服务端状态（"truth"）       → React Query 管理（缓存、失效、重取）
  - 会话列表、消息历史、Agent 列表

流式临时状态（"in-flight"） → Zustand chatStore 管理
  - 正在 stream 的消息 content[]
  - 多 Agent 进度状态

UI 交互状态                → Zustand uiStore 管理
  - 侧边栏展开/收起、搜索框输入、主题
```

- React Query 和 Zustand 各管各的，不混用
- 流式内容（streamingContent）是临时态，message_end 后清零，历史消息由 React Query 接管
- SSE 连接随活跃会话切换：切会话 → 断开旧 SSE → 建立新 SSE

---

## 4. 核心模块说明

### 4.1 布局层（Layout）

| 组件             | 职责                                             |
| ---------------- | ------------------------------------------------ |
| `AppLayout`      | 顶层数据获取（useConversations），向下传递 props  |
| `Sidebar`        | 对话列表渲染、搜索过滤、新建对话弹窗、Agent 创建入口 |
| `ChatArea`       | 单聊/群聊核心区域，SSE 连接管理，消息发送         |

**Sidebar 交互：**
- 对话按"置顶优先 + 最近活跃"排序
- 搜索实时过滤，支持标题模糊匹配
- "+"按钮弹出新建对话对话框（输入标题 → 默认选中 Claude Code）
- "🤖"按钮弹出 CreateAgentModal

**ChatArea 交互：**
- 空状态：引导文案"选择或创建一个对话开始"
- 选中对话后：ChatHeader + MessageList + ChatInput
- 切会话时自动断开旧 SSE、建立新 SSE

### 4.2 聊天子组件（Chat）

| 组件                | 职责                                                     |
| ------------------- | -------------------------------------------------------- |
| `ChatHeader`        | 对话标题 + 群聊标签 + 参与 Agent 列表标签                 |
| `MessageList`       | 消息列表渲染（已完成消息 + 流式消息 + 等待动画）          |
| `ChatInput`         | 文本输入 + Enter 发送 + Shift+Enter 换行 + @ 提及补全    |
| `OrchestratorPlan`  | *Phase 5* — 群聊任务拆解计划卡片（确认/调整按钮）        |
| `AgentProgressBar`  | *Phase 5* — 多 Agent 执行状态紧凑进度条                   |

**消息气泡渲染：**
- 用户消息：右侧蓝色气泡
- Agent 消息：左侧灰色气泡 + Agent 头像 + 名称
- 流式消息：闪烁光标 + token 逐字追加
- 等待状态：三点跳动动画

### 4.3 消息卡片 — 可插拔渲染器（Cards）

前端按 `artifact_type` 动态路由到对应渲染组件。新增卡片类型只需注册一行，不改 MessageList 核心。

| 卡片              | artifact_type    | P 级 | 渲染内容                                        |
| ----------------- | ---------------- | ---- | ----------------------------------------------- |
| `CodeCard`        | `code`           | P0   | 文件名 + 语法高亮 + 一键复制                    |
| `DiffCard`        | `diff`           | P1   | 文件名 + 左右对比视图（旧/新）                  |
| `PreviewCard`     | `preview`        | P1   | iframe 内联预览 + 点击全屏模态框展开            |
| `FileCard`        | `file`           | P1   | 文件图标 + 文件名 + 大小 + 下载链接             |
| `DeployStatusCard`| `deploy_status`  | P2   | 构建中(旋转动画)/成功(链接)/失败(红色) 状态卡片 |

**注册表实现：**

```typescript
const cardRenderers: Record<string, FC<CardProps>> = {
  code: ({ content }) => <CodeCard content={content} />,
  diff: ({ content }) => <DiffCard content={content} />,
  preview: ({ content }) => <PreviewCard content={content} />,
  file: ({ content }) => <FileCard content={content} />,
  deploy_status: ({ content }) => <DeployStatusCard content={content} />,
};

// MessageList 中统一调用：
// {c.type === "text" ? <TextBubble /> : <CardRenderer content={c} />}
```

### 4.4 数据层（Hooks）

| Hook                      | 后端端点                        | React Query 行为                |
| ------------------------- | ------------------------------- | ------------------------------- |
| `useConversations()`      | `GET /api/v1/conversations`     | 列表缓存，创建/更新后自动失效   |
| `useConversation(id)`     | `GET /api/v1/conversations/{id}` | 详情缓存，按 id 索引            |
| `useCreateConversation()` | `POST /api/v1/conversations`    | mutation → invalidate 列表      |
| `useUpdateConversation()` | `PATCH /api/v1/conversations/{id}` | mutation → invalidate 列表+详情 |
| `useDeleteConversation()` | `DELETE /api/v1/conversations/{id}` | mutation → invalidate 列表      |
| `useMessages(convId)`     | `GET /api/v1/conversations/{id}/messages` | 按会话缓存，新消息后重新拉取   |
| `useAgents()`             | `GET /api/v1/agents`            | 列表缓存                        |
| `useCreateAgent()`        | `POST /api/v1/agents`           | mutation → invalidate Agent列表 |

### 4.5 SSE 流式客户端（sse.ts）

**连接方式：** `GET /api/v1/conversations/{conversation_id}/stream`

**请求头：**
```
Accept: text/event-stream
Authorization: Bearer <token>
```

**事件路由：** 按 SSE `event:` 字段分发到对应回调，JSON 解析 `data:` 字段

| SSE 事件       | 前端回调           | 前端行为                                     |
| -------------- | ------------------ | -------------------------------------------- |
| `message_start`| `onMessageStart`   | 创建空白消息气泡，记录 sender 信息           |
| `token`        | `onToken`          | 增量追加文本到 streamingContent 最后 text block |
| `artifact`     | `onArtifact`       | 在 streamingContent 中插入对应卡片 content   |
| `agent_status` | `onAgentStatus`    | 更新 AgentProgressBar 各 Agent 状态和进度    |
| `message_end`  | `onMessageEnd`     | 冻结 streamingContent → React Query 拉取历史 |
| `error`        | `onError`          | 标记消息失败，断开连接                       |

**连接生命周期管理：**
- 切换活跃会话：abort 旧连接 → 建立新连接
- 断线重连：指数退避 1s/2s/4s，最多 3 次
- 组件卸载：AbortController.abort() 清理

### 4.6 状态管理（Stores）

| Store       | 框架    | 存储内容                                                   |
| ----------- | ------- | ---------------------------------------------------------- |
| `chatStore` | Zustand | activeConversationId, searchQuery, isStreaming, streamingContent |
| `agentStore`| Zustand | selectedAgentIds（群聊多选 Agent 时的临时选择）            |
| `uiStore`   | Zustand | sidebarOpen, sidebarWidth, previewPanelOpen, theme          |

**关键设计：** chatStore 不存会话列表和消息——那些是服务端状态，由 React Query 管理。chatStore 只存 UI 交互中的瞬时态。

---

## 5. 前后端接口契约

> 以下接口前端已按此规范对接。如有变更请同步通知。

### 5.1 通用约定

- **Base URL:** `/api/v1`
- **认证:** `Authorization: Bearer <token>`（Axios 拦截器自动注入）
- **响应格式:** `{ code: number; data: T; message: string }`
- **分页格式:** `{ code: number; data: { list: T[]; total: number; page: number; pageSize: number }; message: string }`
- **日期格式:** ISO 8601 (`2026-05-20T10:00:00Z`)

### 5.2 会话 API

#### 创建会话
```
POST /api/v1/conversations
```
**前端发送：**
```json
{
  "title": "实现登录页面",
  "type": "single",
  "agentIds": ["agent-claude-code"]
}
```
**前端期望返回：** Conversation 对象（详见 5.7 数据模型）

#### 获取会话列表
```
GET /api/v1/conversations?keyword=&archived=false&page=1&pageSize=20
```
**前端期望返回：** `{ list: Conversation[], total, page, pageSize }`

#### 获取会话详情
```
GET /api/v1/conversations/{conversation_id}
```

#### 更新会话（置顶/归档/重命名）
```
PATCH /api/v1/conversations/{conversation_id}
```
**前端发送：**
```json
{ "isPinned": true }
```
支持部分更新：`title`, `isPinned`, `isArchived` 可单独发送。

#### 删除会话
```
DELETE /api/v1/conversations/{conversation_id}
```

#### Pin/Unpin 消息（P1）
```
POST   /api/v1/conversations/{conversation_id}/pins     body: { "message_id": "..." }
DELETE /api/v1/conversations/{conversation_id}/pins/{message_id}
```

### 5.3 消息 API

#### 发送消息（触发 Agent）
```
POST /api/v1/conversations/{conversation_id}/messages
```
**前端发送：**
```json
{
  "content": "帮我写一个 React 登录页面",
  "mentions": ["agent-claude-code", "agent-codex"],
  "mode": "auto_orchestrate"
}
```

- `content`: 用户输入的消息文本（含 @mention 文本）
- `mentions`: 被 @ 的 Agent ID 列表（可选，单聊可不传）
- `mode`: `"direct"`（直接发给 Agent）或 `"auto_orchestrate"`（触发 Orchestrator 自动编排）
- 单聊自动使用 `direct`，群聊自动使用 `auto_orchestrate`

**前端行为：** 发送后立即建立 SSE 连接接收回复，不等 REST 响应。

#### 获取消息历史
```
GET /api/v1/conversations/{conversation_id}/messages?cursor=&limit=50
```

**前端需要的关键字段（每条 message）：**

| 字段           | 用途                                   |
| -------------- | -------------------------------------- |
| `id`           | 消息唯一标识                            |
| `sender_type`  | user / agent / orchestrator / system    |
| `sender_id`    | 发送者 ID                               |
| `sender_name`  | 发送者显示名（Agent 名称或用户名）      |
| `content`      | 文本内容（markdown）                    |
| `artifacts[]`  | 关联的产物列表（内联在响应中）          |
| `status`       | pending / streaming / done / failed     |
| `parent_message_id` | 回复/引用目标（可选）               |
| `created_at`   | ISO 8601 时间戳                          |

**重要：前端需要 `artifacts[]` 随消息一起返回，不在消息响应中做第二次查询。**

每条 artifact 结构：
```json
{
  "id": "art-001",
  "type": "code",
  "title": "LoginPage.tsx",
  "content": {
    "fileName": "LoginPage.tsx",
    "language": "tsx",
    "code": "import { useState } from 'react';..."
  }
}
```

artifact.content 按 type 不同：
- `code`: `{ fileName?, language, code }`
- `diff`: `{ fileName?, language, oldCode, newCode }`
- `preview`: `{ url, title?, previewType: "web"|"doc"|"ppt" }`
- `file`: `{ fileName, fileUrl, fileType, fileSize }`
- `deploy_status`: `{ status: "building"|"deployed"|"failed", url? }`

#### 重新生成消息
```
POST /api/v1/messages/{message_id}/regenerate
```

#### 获取消息产物
```
GET /api/v1/messages/{message_id}/artifacts
```

### 5.4 Agent API

#### 获取 Agent 列表
```
GET /api/v1/agents
```
**前端期望返回：** `Agent[]`

Agent 字段：
| 字段           | 类型      | 说明                                 |
| -------------- | --------- | ------------------------------------ |
| `id`           | string    | 唯一标识                             |
| `name`         | string    | 显示名称                             |
| `avatar`       | string    | 头像 URL（可空）                     |
| `provider`     | string    | claude-code / codex / opencode / custom |
| `capabilities` | string[]  | 能力标签：coding, docs, ui 等        |
| `systemPrompt` | string?   | 自定义 Agent 的 System Prompt        |
| `tools`        | object[]  | 工具集：`{ name, description }`      |
| `createdAt`    | string    | 创建时间 ISO 8601                    |

#### 创建自定义 Agent
```
POST /api/v1/agents
```
**前端发送：**
```json
{
  "name": "前端代码助手",
  "avatar": "",
  "systemPrompt": "你是一个前端工程助手...",
  "tools": ["read_file", "write_file"]
}
```

#### 更新 Agent
```
PATCH /api/v1/agents/{agent_id}
```

### 5.5 部署 API（P2）

#### 触发部署
```
POST /api/v1/deployments
```
```json
{ "conversation_id": "...", "artifact_id": "...", "provider": "vercel" }
```

#### 查询部署状态
```
GET /api/v1/deployments/{deployment_id}
```
前端通过 SSE 的 `deploy_status` artifact 事件或轮询此接口获取状态。

### 5.6 SSE 流式接口（关键）

#### 订阅会话流
```
GET /api/v1/conversations/{conversation_id}/stream
```
**请求头：** `Accept: text/event-stream` + `Authorization: Bearer <token>`

**6 种 SSE 事件（前端已对接，请保持一致）：**

```
event: message_start
data: { "version":"v1", "event_id":"...", "conversation_id":"...", "message_id":"...", "sender": {"type":"agent","id":"...","name":"Claude Code"}, "timestamp":"..." }

event: token
data: { "version":"v1", "event_id":"...", "conversation_id":"...", "message_id":"...", "delta":"你好，", "index":1, "timestamp":"..." }

event: artifact
data: { "version":"v1", "event_id":"...", "conversation_id":"...", "message_id":"...", "artifact": {"id":"...","type":"code","title":"...","content":{...}}, "timestamp":"..." }

event: agent_status
data: { "version":"v1", "event_id":"...", "conversation_id":"...", "task_id":"...", "subtask_id":"...", "agent": {"id":"...","name":"Codex"}, "status":"running", "progress":60, "timestamp":"..." }

event: message_end
data: { "version":"v1", "event_id":"...", "conversation_id":"...", "message_id":"...", "finish_reason":"completed", "usage":{"input_tokens":1200,"output_tokens":480}, "timestamp":"..." }

event: error
data: { "version":"v1", "event_id":"...", "conversation_id":"...", "message_id":"...", "code":"AGENT_TIMEOUT", "message":"...", "retryable":true, "timestamp":"..." }
```

此时后端 SSE 协议与前端 `sse.ts` 完全对齐。

### 5.7 前端核心数据模型（TypeScript）

```typescript
// === 会话 ===
interface Conversation {
  id: string;
  title: string;
  type: "single" | "group";
  agentIds: string[];
  lastMessage?: string;
  lastActiveAt: string;       // ISO 8601
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
}

// === 消息（前端内部表示） ===
// 注意：这是前端渲染用的视图模型，不等于后端 messages 表结构
interface Message {
  id: string;
  conversationId: string;
  role: "user" | "agent" | "system" | "orchestrator";
  agentId?: string;
  agentName?: string;
  content: MessageContent[];   // 混合类型数组：text/code/diff/preview/file/deploy_status
  replyTo?: string;
  status: "pending" | "streaming" | "done" | "error";
  createdAt: string;
}

type MessageContent =
  | { type: "text"; text: string }
  | { type: "code"; language: string; code: string; fileName?: string }
  | { type: "diff"; language: string; oldCode: string; newCode: string; fileName?: string }
  | { type: "preview"; url: string; title?: string; previewType: "web" | "doc" | "ppt" }
  | { type: "file"; fileName: string; fileUrl: string; fileType: string; fileSize: number }
  | { type: "deploy_status"; status: "building" | "deployed" | "failed"; url?: string };

// === Agent ===
interface Agent {
  id: string;
  name: string;
  avatar: string;
  provider: "claude-code" | "codex" | "opencode" | "custom";
  capabilities: string[];
  systemPrompt?: string;
  tools: { name: string; description: string }[];
  createdAt: string;
}
```

---

## 6. 群聊 Orchestrator 交互协议（重要）

群聊采用"混合模式"：Orchestrator 先展示计划，用户确认后再执行。

```
① 用户发送消息
   POST /api/v1/conversations/{id}/messages
   { "content": "做电商首页", "mode": "auto_orchestrate" }

② Orchestrator 返回计划
   方式：通过 SSE 流中一条特殊消息（sender_type: orchestrator）
   消息内容包含子任务列表：[{agentId, agentName, instruction}, ...]
   前端以 OrchestratorPlan 卡片渲染

③ 用户确认/调整
   - 确认：前端通过 @mention 机制确认每个子任务的指派
   - 调整：用户可以修改 @指派（前端 UI 层面操作，重新发一条调整后的消息）

④ Orchestrator 开始执行
   通过 agent_status SSE 事件推送各子任务状态
   前端 AgentProgressBar 实时更新

⑤ 各 Agent 依次流式输出
   每个 Agent 以独立消息气泡出现（sender_type: agent, sender_id: 各 Agent ID）
   通过 message_start → token → artifact → message_end 生命周期

⑥ Orchestrator 聚合汇总
   最后一条消息：sender_type: orchestrator，聚合所有子任务产物
```

**待与后端确认：**
- [ ] 步骤②中，计划消息的返回格式是什么？（消息 body 中放 JSON？还是 artifacts？）
- [ ] 步骤③中，用户确认/调整的操作如何通知后端？（需要新的确认 API？还是沿用发送消息 API？）
- [ ] 步骤⑥中，聚合消息何时发送？（全部子任务完成后？）

---

## 7. 文件结构

```
agenthub-web/src/
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx          # 顶层：数据获取 + 向下传递
│   │   ├── Sidebar.tsx            # 左侧对话列表 + 搜索 + 新建
│   │   └── ChatArea.tsx           # 右侧聊天主区：SSE 管理 + 消息发送
│   ├── chat/
│   │   ├── ChatHeader.tsx         # 对话标题栏
│   │   ├── MessageList.tsx        # 消息列表（含流式渲染）
│   │   ├── ChatInput.tsx          # 输入框 + @mention 补全
│   │   ├── OrchestratorPlan.tsx   # 群聊任务计划卡片
│   │   └── AgentProgressBar.tsx   # 多 Agent 执行进度条
│   ├── cards/
│   │   ├── CardRenderer.tsx       # 注册表：artifact_type → 卡片组件
│   │   ├── CodeCard.tsx           # 代码块（高亮 + 复制）
│   │   ├── DiffCard.tsx           # Diff 对比
│   │   ├── PreviewCard.tsx        # iframe 预览 + 全屏
│   │   ├── FileCard.tsx           # 文件下载
│   │   └── DeployStatusCard.tsx   # 部署状态
│   └── agent/
│       └── CreateAgentModal.tsx   # Agent 创建表单
├── hooks/
│   ├── useConversations.ts        # React Query: 会话 CRUD
│   ├── useMessages.ts             # React Query: 消息历史
│   └── useAgents.ts              # React Query: Agent 列表/创建
├── stores/
│   ├── chatStore.ts               # Zustand: activeId / streamingContent
│   ├── agentStore.ts              # Zustand: selectedAgentIds
│   └── uiStore.ts                 # Zustand: sidebar / theme
├── types/
│   ├── chat.ts                    # Message / Conversation / SSE 事件 / Artifact 类型
│   ├── agent.ts                   # Agent 类型
│   ├── api.ts                     # API 请求/响应类型
│   └── index.ts                   # barrel 重导出
├── lib/
│   ├── api.ts                     # Axios 实例 + conversationApi / agentApi / messageApi
│   ├── sse.ts                     # createSSEStream() SSE 客户端
│   └── utils.ts                   # formatRelativeTime / truncate / generateId / formatFileSize
├── App.tsx                        # 路由 + QueryClientProvider
├── main.tsx                       # 入口
└── index.css                      # Tailwind 全局样式
```

---

## 8. 状态管理全景图

```
┌─────────────────────────────────────────────────────┐
│                    React Query                       │
│  useConversations() → 会话列表                       │
│  useConversation(id) → 单个会话详情                  │
│  useMessages(convId) → 消息历史                      │
│  useAgents() → Agent 列表                           │
│                                                     │
│  缓存策略: staleTime=30s, 操作后自动 invalidate      │
└─────────────────────┬───────────────────────────────┘
                      │ props 向下传递
┌─────────────────────▼───────────────────────────────┐
│                    Zustand                           │
│                                                     │
│  chatStore:                   agentStore:            │
│    activeConversationId         selectedAgentIds     │
│    searchQuery                                       │
│    isStreaming                 uiStore:              │
│    streamingContent              sidebarOpen         │
│                                   theme              │
│  典型用法:                                            │
│    useChatStore(s => s.activeId)                     │
│    → 只有用到该字段的组件重渲染（selector 模式）      │
└─────────────────────────────────────────────────────┘
```

---

## 9. 前端实施优先级

| 优先级 | 模块                    | 说明                                   |
| ------ | ----------------------- | -------------------------------------- |
| P0     | 单聊消息流              | 发送消息 → SSE 接收 → 流式渲染        |
| P0     | 会话列表管理            | 列表展示 + 新建 + 搜索 + 切换          |
| P0     | 群聊 + Orchestrator     | 计划展示 + 进度条 + 多 Agent 交织消息  |
| P1     | 产物卡片 Code + Diff    | 代码高亮 + 复制 + 左右对比             |
| P1     | 产物卡片 Preview + File | iframe 预览 + 全屏 + 文件下载          |
| P1     | Agent 创建              | 表单模态框 + 对话式创建入口            |
| P2     | 部署状态卡片            | DeployStatusCard                        |
| P2     | @mention 自动补全       | 输入 @ 弹出 Agent 选择列表             |

---

## 10. 与后端协作备忘

| # | 事项                        | 优先级 | 状态   |
|---| --------------------------- | ------ | ------ |
| 1 | API 路径统一为 `/api/v1/*`  | P0     | 前端已对齐 |
| 2 | 消息历史响应包含 `artifacts[]` 数组 | P0 | 待后端确认响应格式 |
| 3 | SSE 使用 `GET` + `event:` 路由 | P0  | 前端已对齐 |
| 4 | 响应格式 `{ code, data, message }` | P0  | 待后端确认 |
| 5 | 产物 artifact.content 各 type 字段结构 | P1 | 见 5.3 节，请后端保持一致 |
| 6 | 群聊 Orchestrator 计划→确认→执行协议 | P1 | 见第 6 节，待讨论 |
| 7 | DELETE conversation / regenerate / artifacts 端点 | P2 | 前端已预留调用代码 |
| 8 | 分页格式 `{ list, total, page, pageSize }` | P2 | 前端 ApiResponse 类型已定义 |
| 9 | 前端技术栈小差异（React 19 而非 18，无 shadcn/ui）| 信息 | 不影响接口 |
