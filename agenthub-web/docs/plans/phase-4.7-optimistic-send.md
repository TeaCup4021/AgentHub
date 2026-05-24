# Phase 4.7: 消息发送乐观更新

> **Goal:** 用户发送消息后立即看到自己的消息气泡，不再等待 POST 完成和 SSE 结束。当前流程是先 `await POST` → 启动 SSE → 等 SSE 结束才刷新消息列表，用户需要等整个 AI 回复完成才能看到自己发的消息。

**Architecture:** 只改 ChatArea 的 `handleSend` 函数 —— 去掉 POST 的 await，用 React Query 的乐观更新提前插入用户消息到缓存，POST 和 SSE 并行启动。

**Tech Stack:** React Query (queryClient.setQueryData), TypeScript

---

## 问题分析

当前 `handleSend` 的时序：

```
await POST 用户消息 (300ms mock 延迟)
  → setIsStreaming(true)
  → start SSE
  → AI 流式回复 (2-5s)
  → onMessageEnd → invalidateQueries ← 用户在这里才看到自己发的消息！
```

总共等待 **POST(300ms) + SSE(2-5s) ≈ 3-5 秒** 才能看到自己消息。

## 目标时序

```
乐观插入用户消息到缓存 ← 即时可见 ✅
  ├─ POST 用户消息 (fire-and-forget)
  └─ setIsStreaming(true) + start SSE
       → AI 流式回复 (2-5s)
       → onMessageEnd → invalidateQueries（刷新最终状态）
```

---

## Task 4.7.1: ChatArea handleSend 乐观更新

**依赖:** 无
**Files:**
- Modify: `src/components/layout/ChatArea.tsx`

### Checklist:

- [ ] **Step 1: 构造乐观消息对象，提前插入缓存**

在 `handleSend` 函数开头，不等 POST，直接构造用户消息并写入 React Query 缓存：

```typescript
const handleSend = useCallback(async (content: string) => {
  if (!activeId) return;

  const now = new Date().toISOString();
  const optimisticMsg: Message = {
    id: `msg-opt-${Date.now()}`,
    conversationId: activeId,
    senderType: "user",
    senderId: "user-1",
    senderName: "我",
    contentType: "text",
    content,
    artifacts: [],
    status: "done",
    meta: null,
    createdAt: now,
    updatedAt: now,
  };

  // 乐观插入到当前消息列表缓存中
  qc.setQueryData(
    ["messages", activeId],
    (old: InfiniteData<MessageListData> | undefined) => {
      if (!old) return old;
      const newPages = old.pages.map((page, i) => {
        if (i === 0) {
          return { ...page, items: [optimisticMsg, ...page.items] };
        }
        return page;
      });
      return { ...old, pages: newPages };
    },
  );

  // POST 用户消息（不 await，fire-and-forget）
  messageApi.send(activeId, { content, mode: "direct" }).catch((err) => {
    console.error("消息发送失败:", err);
    // 发送失败时回滚乐观更新
    qc.invalidateQueries({ queryKey: ["messages", activeId] });
  });

  // 同步启动 SSE
  disconnectRef.current?.();
  setIsStreaming(true);

  disconnectRef.current = createSSEStream(activeId, {
    onMessageStart: (data: SSEMessageStart) => { ... },
    onToken: (data: SSEToken) => { ... },
    onArtifact: (data: SSEArtifact) => { ... },
    onMessageEnd: (_data: SSEMessageEnd) => {
      if (streamMsgIdRef.current) {
        finalizeStreaming(streamMsgIdRef.current);
        streamMsgIdRef.current = null;
      }
      setIsStreaming(false);
      qc.invalidateQueries({ queryKey: ["messages", activeId] });
    },
    onError: (data: SSEError) => {
      console.error("SSE 错误:", data.message);
      setIsStreaming(false);
    },
  });
}, [...]);
```

- [ ] **Step 2: 导入 InfiniteData 类型 + Message 类型**

`ChatArea.tsx` 新增 import：
```typescript
import type { InfiniteData } from "@tanstack/react-query";
import type { MessageListData, Message } from "@/types";
```

- [ ] **Step 3: 发送失败时回滚**

POST 失败时 `qc.invalidateQueries` 会使乐观插入的消息被正确的服务器数据替换（乐观消息的 id 是伪造的，真正 API 没存过这条数据）。

- [ ] **Step 4: 类型检查**

```bash
npx tsc -b --noEmit
```

---

## 验证标准

1. `npx tsc -b --noEmit` 零错误
2. 发送消息后**立即**看到自己的消息气泡出现在列表底部
3. 随后看到 PendingMessageBubble（三点动画）或 Agent 流式回复
4. SSE 结束后消息列表刷新，乐观消息被真实消息替换（id 变化但用户无感知）
5. SS E 出错或 POST 失败时，乐观消息被回滚
