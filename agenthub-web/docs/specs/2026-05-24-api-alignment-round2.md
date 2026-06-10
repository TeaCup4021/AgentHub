# 第二轮前后端接口对齐 Spec

日期：2026-05-24 | 状态：待 Review

---

## 1. 背景

Phase 4.5（第一轮对齐）参照接口文档修复了 Agent/Message/Conversation 的基本字段和 API 路径，但后端实际代码与文档之间有偏差。本轮以**后端实际代码为准**，找出所有剩余的不一致并修复。

### 范围

- 前端类型定义、API 层、Mock 系统
- 不变更后端代码（后端由另一同学负责）

---

## 2. 问题清单

### 问题 A（严重）：Message 列表响应格式 —— cursor 分页 vs 扁平数组

**后端** `GET /conversations/{id}/messages` 返回：

```json
{
  "code": 200,
  "data": {
    "items": [Message, ...],
    "nextCursor": "2026-05-24T...",
    "hasMore": true
  },
  "message": "success"
}
```

Query: `?cursor=ISO时间戳&limit=50`，按 `created_at DESC` 排序，每次取 `limit+1` 行判断 `hasMore`。

**前端** 当前按 `ApiResponse<Message[]>` 处理，hooks 里 `res.data.data` 直接当数组用。

**影响**：
- `useMessages.ts` 的 queryFn 返回类型错误
- `MessageList.tsx` 组件消费 `.map()` 会炸
- mock handler 返回格式不一致

### 问题 B（严重）：Artifact 类型字段名 `artifactType` vs `type`

**后端 REST** (`ArtifactBrief` schema)：字段为 `artifact_type: str`，序列化为 `artifactType`。
**后端 SSE**（mock `_mock_sse_stream`）：写的是 `"type": "code"` —— 和 REST schema 冲突。
**前端**：`Artifact` 接口用 `type`，`CardRenderer` 靠 `artifact.type` 路由。

| 上下文 | 正确字段名 |
|--------|-----------|
| REST API | `artifactType` |
| SSE stream | 应为 `artifactType`（后端 S SE mock 有 bug） |
| 前端 Artifact 接口 | 应改为 `artifactType` |

**影响**：SSE 通道暂不受影响（因为当前两端 SSE mock 都用 `type`），但 `messageApi.getArtifacts()` 接到 REST 数据后 `CardRenderer` 拿不到字段。

### 问题 C（高）：SendMessageRequest 字段不对齐

| 字段 | 后端 `MessageCreate` | 前端 `SendMessageRequest` |
|------|---------------------|--------------------------|
| `content` | 必填 | 有 |
| `contentType` | 默认 `"text"` | **缺失** |
| `mentions` | `UUID[]` | `string[]` |
| `parentMessageId` | 可选 | **缺失** |
| `mode` | 不存在 | `"auto_orchestrate" \| "direct"`（多余） |

`mode` 字段是前端为 Orchestrator 预留的，后端尚未实现。处理方式：**前端保留字段但标注为暂未对接**，不删。

### 问题 D（中）：CreateConversation 有多余字段

前端 `CreateConversationParams` 有 `initialMessage?: string`，后端 `ConversationCreate` 没有此字段。删掉。

### 问题 E（中）：DELETE /conversations/:id 返回 204

后端返回 `204 No Content`（空 body），前端声明 `ApiResponse<null>` 期望 200。响应拦截器的 `code >= 400` 判断不会误伤空 body，但类型上不精确。

### 问题 F（低）：Artifact 缺少 REST 字段

后端 `ArtifactBrief` 有 8 个字段，前端 `Artifact` 只有 4 个。补上 `storageKey`、`mimeType`、`version`、`createdAt`。

### 问题 G（低）：Message 缺少 `meta` 字段

后端 `MessageResponse` 有 `meta: dict | null`，前端没有。补充为可选字段。

---

## 3. 目标数据模型

### 3.1 Message

```typescript
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
  createdAt: string;
  updatedAt: string;
}
```

变更：新增 `meta?: Record<string, unknown> | null`。

### 3.2 Artifact

```typescript
export interface Artifact {
  id: string;
  artifactType: string;   // ← 从 type 改名
  title?: string;
  content: Record<string, unknown>;
  storageKey?: string | null;
  mimeType?: string | null;
  version: number;
  createdAt: string;
}
```

变更：
- `type` → `artifactType`
- 新增 `storageKey`、`mimeType`、`version`、`createdAt`

### 3.3 CreateConversationParams

```typescript
export interface CreateConversationParams {
  title: string;
  type: ConversationType;
  agentIds: string[];
}
```

变更：删除 `initialMessage`。

### 3.4 SendMessageRequest

```typescript
export interface SendMessageRequest {
  content: string;
  contentType?: string;
  mentions?: string[];
  parentMessageId?: string;
  mode?: "auto_orchestrate" | "direct";
}
```

变更：新增 `contentType`、`parentMessageId`。保留 `mode`（标注为暂未对接后端）。

### 3.5 API 响应类型变更

```typescript
// 新增
export interface MessageListData {
  items: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

// 修改前: ApiResponse<Message[]>
// 修改后:
export type GetMessageListResponse = ApiResponse<MessageListData>;
```

---

## 4. 受影响的组件和文件

### 4.1 类型层

| 文件 | 变更 |
|------|------|
| `src/types/chat.ts` | Artifact 改名 + 加字段；Message 加 meta；CreateConversationParams 删 initialMessage |
| `src/types/api.ts` | 新增 MessageListData；GetMessageListResponse 改为 cursor 分页格式 |

### 4.2 API 层

| 文件 | 变更 |
|------|------|
| `src/lib/api.ts` | SendMessageRequest 加字段；GetMessageListResponse 类型更新 |

### 4.3 Hooks 层

| 文件 | 变更 |
|------|------|
| `src/hooks/useMessages.ts` | 返回 `MessageListData`，处理 cursor 分页 |

### 4.4 Mock 层

| 文件 | 变更 |
|------|------|
| `src/mocks/data.ts` | Artifact 字段名适配；Message 加 meta |
| `src/mocks/handlers.ts` | GET messages 返回 `{ items, nextCursor, hasMore }`；SendMessageRequest 接受新字段 |
| `src/mocks/sse.ts` | SSE artifact 字段从 `type` 改为 `artifactType` |

### 4.5 组件层

| 文件 | 变更 |
|------|------|
| `src/components/chat/MessageList.tsx` | `artifact.type` → `artifact.artifactType` |
| `src/components/cards/CardRenderer.tsx` | `artifact.type` → `artifact.artifactType` |
| `src/components/layout/Sidebar.tsx` | 如有用到 `initialMessage` 则删除 |
| `src/stores/chatStore.ts` | appendStreamArtifact 的 Artifact 类型适配 |

---

## 5. 不影响的功能

- SSE 流式协议（6 种事件类型不变）
- Agent 类型（第一轮已对齐）
- Conversation 类型（第一轮已对齐）
- `CardRenderer` 卡片注册表逻辑不变，只是注册 key 从 `type` 值变为 `artifactType` 值
- DELETE /conversations/:id 暂不改前端行为（204 空 body 在现有错误处理逻辑中无害）

---

## 6. 风险点

1. **`artifactType` 改名是 breaking change**：`CardRenderer` 的注册表 key、所有卡片组件、SSE 处理、mock 数据都需要同步改。漏掉会导致卡片不渲染。
2. **Message list 分页**：如果前端没处理好 `items` → `nextCursor` → `hasMore` 的级联逻辑，消息列表会出现丢数据或无限加载。
3. **后端 SSE artifact 字段名不一致**：后端当前 SSE mock 写的是 `"type"`，改成 `"artifactType"` 后，如果后端同学不改，对接真实后端时 SSE 通道也会出问题。需要通知后端同学修复 SSE 里的字段名。
