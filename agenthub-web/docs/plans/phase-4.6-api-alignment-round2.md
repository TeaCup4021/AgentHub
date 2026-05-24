# Phase 4.6: 第二轮前后端接口对齐 + 消息滚动加载

> **Spec:** `docs/specs/2026-05-24-api-alignment-round2.md`
>
> **Goal:** 以本轮 Spec 为准，修复 7 个前后端接口不一致；实现消息列表的 cursor 分页和滚动加载更多。

**Architecture:** 分五层修复 —— (1) 类型层：Artifact 字段改名、Message 加 meta、SendMessageRequest 补齐，(2) Mock 层：数据/处理器/SSE 适配新类型，(3) API+Hooks 层：cursor 分页，(4) 组件层：适配新字段，(5) UI 层：消息列表滚动加载更多。

**Tech Stack:** TypeScript, React Query (useInfiniteQuery), Axios

---

## 文件清单

```
修改:
  src/types/chat.ts                            — Artifact 重构 + Message 加 meta + CreateConversationParams 删 initialMessage
  src/types/api.ts                             — 新增 MessageListData + GetMessageListResponse 改格式
  src/lib/api.ts                               — SendMessageRequest 补齐字段 + GetMessageListResponse 类型更新
  src/hooks/useMessages.ts                     — useQuery → useInfiniteQuery，cursor 分页
  src/stores/chatStore.ts                      — Artifact 类型适配（import 自动适配）
  src/mocks/data.ts                            — Artifact 字段名适配 + Message 加 meta
  src/mocks/handlers.ts                        — GET messages 返回 cursor 分页格式；POST messages 支持新字段
  src/mocks/sse.ts                             — SSE artifact 字段 type → artifactType
  src/components/cards/CardRenderer.tsx         — artifact.type → artifact.artifactType
  src/components/cards/CodeCard.tsx            — 同上
  src/components/cards/DiffCard.tsx            — 同上
  src/components/cards/PreviewCard.tsx         — 同上
  src/components/cards/FileCard.tsx            — 同上
  src/components/chat/MessageList.tsx          — 新增滚动加载 UI + artifactType 适配
  src/components/layout/ChatArea.tsx           — useMessages 返回值适配 + SSE artifact 适配
  src/components/layout/Sidebar.tsx            — 如有 initialMessage 引用则删除
```

---

## Task 4.6.1: 类型定义修复

**依赖:** 无
**Spec 章节:** §2 (A, B, C, D, F, G) — §3 (目标数据模型)

### Files:
- Modify: `src/types/chat.ts`
- Modify: `src/types/api.ts`

### Checklist:

- [ ] **Step 1: Artifact 接口重构**

```typescript
// src/types/chat.ts — Artifact 部分

export interface Artifact {
  id: string;
  artifactType: string;   // ← 从 type 改名，对齐后端 REST schema 的 artifact_type
  title?: string;
  content: Record<string, unknown>;
  storageKey?: string | null;
  mimeType?: string | null;
  version: number;
  createdAt: string;
}

// 注意：后端 SSE mock 当前写的是 "type" 而非 "artifactType"，
// 这是后端的 bug，需要通知后端同学在 SSE 流中也改为 artifactType 以与 REST schema 保持一致。
// 前端 SSEArtifact 接口引用了 Artifact 类型，所以此处改名后 SSE 通道也会使用 artifactType。
```

- [ ] **Step 2: Message 加 meta**

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

- [ ] **Step 3: CreateConversationParams 删 initialMessage**

```typescript
export interface CreateConversationParams {
  title: string;
  type: ConversationType;
  agentIds: string[];
}
```

- [ ] **Step 4: api.ts 新增 MessageListData + 类型别名更新**

```typescript
// src/types/api.ts

export interface MessageListData {
  items: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

// 修改: ApiResponse<Message[]> → ApiResponse<MessageListData>
export type GetMessageListResponse = ApiResponse<MessageListData>;
```

---

## Task 4.6.2: Mock 数据 + 处理器 + SSE 适配

**依赖:** Task 4.6.1
**Spec 章节:** §4.4

### Files:
- Modify: `src/mocks/data.ts`
- Modify: `src/mocks/handlers.ts`
- Modify: `src/mocks/sse.ts`

### Checklist:

- [ ] **Step 1: data.ts — Artifact 字段名 + Message 加 meta**

Mock 数据中所有 Artifact 对象的 `type` 字段改为 `artifactType`：
```typescript
// 示例：msg-2 的 artifact
{
  id: "artifact-1",
  artifactType: "code",       // ← type → artifactType
  title: "LoginPage.tsx",
  content: { ... },
  storageKey: null,
  mimeType: null,
  version: 1,
  createdAt: "2026-05-21T14:00:05Z",
}
```

所有 Message 对象加 `meta: null`。

- [ ] **Step 2: handlers.ts — GET messages 返回 cursor 分页格式**

```typescript
// GET /conversations/:id/messages
else if (method === "get" && /^\/conversations\/[^/]+\/messages$/.test(url)) {
  const conversationId = url.split("/")[2];
  await delay();
  const params = config.params as { cursor?: string; limit?: number } | undefined;
  const cursor = params?.cursor;
  const limit = params?.limit || 50;
  let msgs = messages[conversationId] || [];

  // cursor 分页：只返回 createdAt < cursor 的消息
  if (cursor) {
    msgs = msgs.filter((m) => m.createdAt < cursor);
  }
  // 按时间降序
  msgs = [...msgs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const hasMore = msgs.length > limit;
  const items = msgs.slice(0, limit);
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;

  const [, responseBody] = successResponse({ items, nextCursor, hasMore });
  config.adapter = () =>
    Promise.resolve({ data: responseBody, status: 200, statusText: "OK", headers: {}, config });
}
```

POST messages handler 的 `parseBody` 结果接收新字段 `contentType`、`parentMessageId`，构造 Message 时使用。

- [ ] **Step 3: sse.ts — artifact 字段从 type 改为 artifactType**

```typescript
// mocks/sse.ts 第 98-103 行
const artifact: Artifact = {
  id: artifactId,
  artifactType: "code",    // ← type → artifactType
  title: block.fileName,
  content: { ... },
  storageKey: null,
  mimeType: null,
  version: 1,
  createdAt: new Date().toISOString(),
};
```

---

## Task 4.6.3: API 层 + Hooks 适配 cursor 分页

**依赖:** Task 4.6.1
**Spec 章节:** §3.5, §4.2, §4.3

### Files:
- Modify: `src/lib/api.ts`
- Modify: `src/hooks/useMessages.ts`

### Checklist:

- [ ] **Step 1: api.ts — SendMessageRequest 补齐字段 + 加注释**

```typescript
export interface SendMessageRequest {
  content: string;
  contentType?: string;
  mentions?: string[];
  parentMessageId?: string;
  // mode 字段当前未对接后端，为 Orchestrator 功能预留
  mode?: "auto_orchestrate" | "direct";
}
```

- [ ] **Step 2: useMessages.ts — useQuery → useInfiniteQuery**

```typescript
import { useInfiniteQuery } from "@tanstack/react-query";
import { messageApi } from "@/lib/api";
import type { MessageListData } from "@/types";

export function useMessages(conversationId: string) {
  return useInfiniteQuery<MessageListData>({
    queryKey: ["messages", conversationId],
    queryFn: async ({ pageParam }) => {
      const res = await messageApi.list(
        conversationId,
        pageParam as string | undefined,
        50,
      );
      return res.data.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!conversationId,
    select: (data) => data.pages.flatMap((p) => p.items),
  });
}
```

`select` 把多页数据展平为 `Message[]`，组件层拿到的 `data` 就是扁平数组，API 保持兼容。

---

## Task 4.6.4: 组件层适配

**依赖:** Task 4.6.1, Task 4.6.3
**Spec 章节:** §4.5

### Files:
- Modify: `src/components/cards/CardRenderer.tsx`
- Modify: `src/components/cards/CodeCard.tsx`
- Modify: `src/components/cards/DiffCard.tsx`
- Modify: `src/components/cards/PreviewCard.tsx`
- Modify: `src/components/cards/FileCard.tsx`
- Modify: `src/components/chat/MessageList.tsx`
- Modify: `src/components/layout/ChatArea.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

### Checklist:

- [ ] **Step 1: CardRenderer + 卡片组件 — artifact.type → artifact.artifactType**

```typescript
// CardRenderer.tsx line 20
const Renderer = cardRenderers[artifact.artifactType];
```

各卡片组件内部如有关联到 `artifact.type` 的也同步改。但由于卡片组件通过 `artifact.content as XxxArtifactContent` 访问内容，不直接依赖 `artifact.type`，主要改动在 CardRenderer。

- [ ] **Step 2: ChatArea.tsx — useMessages 返回值适配**

`useMessages` 改用 `useInfiniteQuery` 后返回 `InfiniteQueryResult`，数据通过 `data` 属性获取（已由 `select` 展平为 `Message[]`）：

```typescript
const { data: rawMessages = [] } = useMessages(activeId ?? "");
// rawMessages 已被 select 展平，类型为 Message[]，下游不需要改动
```

同时 SSE `onArtifact` 回调中 `data.artifact` 现在携带 `artifactType` 字段，`CardRenderer` 适配后正常工作。

- [ ] **Step 3: Sidebar.tsx — 删除 initialMessage 引用**

全局搜索 `initialMessage`，删除所有引用（如果有的话）。

- [ ] **Step 4: stores/chatStore.ts — 类型自动适配**

`chatStore.ts` 的 `appendStreamArtifact` 接受 `Artifact` 类型，改类型定义后 import 自动更新，不需要修改 store 源码。但需要确认 `initStreamingMessage` 里初始化的空 artifacts 数组类型正确。

---

## Task 4.6.5: 消息列表滚动加载更多 UI

**依赖:** Task 4.6.3, Task 4.6.4
**Spec 章节:** §3（用户要求实现消息滚动加载）

### Files:
- Modify: `src/components/chat/MessageList.tsx`
- Modify: `src/hooks/useMessages.ts`（如需要导额外汇合方法）

### Checklist:

- [ ] **Step 1: MessageList 增加滚动加载逻辑**

使用 `IntersectionObserver` 监听滚动到顶部时触发 `fetchNextPage`：

```typescript
import { useEffect, useRef } from "react";

interface MessageListProps {
  messages: Message[];
  streamingMessageId?: string | null;
  streamingAgentName?: string;
  isWaiting?: boolean;
  hasMore?: boolean;                // 是否还有更多历史消息
  isFetchingMore?: boolean;         // 是否正在加载更多
  onLoadMore?: () => void;          // 加载更多回调
}

export function MessageList({
  messages, streamingMessageId, streamingAgentName,
  isWaiting, hasMore, isFetchingMore, onLoadMore,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !onLoadMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isFetchingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isFetchingMore, onLoadMore]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {/* 顶部哨兵，用于触发加载更多 */}
      {onLoadMore && <div ref={topSentinelRef} className="h-1" />}
      {isFetchingMore && (
        <div className="flex justify-center py-2">
          <span className="text-xs text-gray-400">加载历史消息...</span>
        </div>
      )}
      {!hasMore && messages.length > 0 && (
        <div className="flex justify-center py-2">
          <span className="text-xs text-gray-300">已加载全部消息</span>
        </div>
      )}
      {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
      {streamingMessageId && streamingAgentName && (
        <StreamingMessageBubble messageId={streamingMessageId} agentName={streamingAgentName} />
      )}
      {isWaiting && !streamingMessageId && <PendingMessageBubble />}
    </div>
  );
}
```

- [ ] **Step 2: ChatArea 传递分页参数给 MessageList**

```typescript
const {
  data: rawMessages = [],
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
} = useMessages(activeId ?? "");

// 在 JSX 中
<MessageList
  messages={rawMessages}
  hasMore={!!hasNextPage}
  isFetchingMore={isFetchingNextPage}
  onLoadMore={() => fetchNextPage()}
  ...
/>
```

- [ ] **Step 3: SSE message_end 后刷新消息列表**

SSE 流结束后 `qc.invalidateQueries({ queryKey: ["messages", activeId] })` 会触发 `useInfiniteQuery` 重新 fetch，新增的消息出现在列表底部。需要处理的是：流式完成后，新消息通过 `addMockMessage` 已写入 mock store，refetch 时会获取到最新数据。

当前 mock 数据每个对话只有 2-5 条消息，不足以触发 hasMore。可通过增加 mock 消息数量验证分页效果（可选）。

---

## Task 依赖关系

```
4.6.1 (Types)
  ├── 4.6.2 (Mock)
  ├── 4.6.3 (API + Hooks)
  └── 4.6.4 (Components)
        └── 4.6.5 (Scroll UI)
```

---

## 验证标准

1. `npx tsc -b --noEmit` 零错误
2. 前端页面正常渲染，对话列表 + 消息列表正常显示
3. 创建新对话 / 发送消息 / 流式 SSE 体验不变
4. Cards（代码/Diff/预览/文件）正常渲染
5. 滚动到消息列表顶部时触发加载更多（如 mock 数据不够验证，手动确认 hasMore=false 时显示"已加载全部"）
