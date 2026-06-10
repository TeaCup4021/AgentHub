# SSE 协议规范

## 传输方式

标准 Server-Sent Events，content-type 为 `text/event-stream`。

```
event: message_start
data: {...}

event: token
data: {...}
...
```

## 7 种事件类型

### 1. message_start

Agent 或 Orchestrator 开始输出。在群聊模式中，`meta.plan` 携带完整计划结构。

```json
{
  "version": "v1",
  "eventId": "uuid",
  "conversationId": "uuid",
  "messageId": "uuid",
  "sender": {
    "type": "agent | orchestrator",
    "id": "string",
    "name": "string"
  },
  "meta": {
    "plan": [<PlanSubtask>],
    "plannerAgentId": "uuid | null",
    "plannerAgentName": "string | null",
    "summary": { "total": 0, "success": 0, "failed": 0, "results": [...] }
  },
  "timestamp": "ISO 8601"
}
```

### 2. token

逐 token 文本增量。

```json
{
  "version": "v1",
  "eventId": "uuid",
  "conversationId": "uuid",
  "messageId": "uuid",
  "delta": "string",
  "index": 0,
  "timestamp": "ISO 8601"
}
```

### 3. artifact

产物（代码、diff、预览、文件、部署状态等）。

```json
{
  "version": "v1",
  "eventId": "uuid",
  "conversationId": "uuid",
  "messageId": "uuid",
  "artifact": {
    "id": "uuid",
    "artifactType": "code | diff | preview | file | deploy_status | document | link_preview",
    "title": "string",
    "content": { ... },
    "storageKey": "string | null",
    "mimeType": "string | null",
    "version": 1,
    "createdAt": "ISO 8601"
  },
  "timestamp": "ISO 8601"
}
```

### 4. agent_status

Agent 执行状态变更（编排模式下使用）。

```json
{
  "version": "v1",
  "eventId": "uuid",
  "conversationId": "uuid",
  "messageId": "uuid",
  "subtaskId": "string",
  "agent": { "id": "uuid", "name": "string" },
  "status": "queued | running | success | failed | timeout",
  "progress": 0,
  "timestamp": "ISO 8601"
}
```

### 5. thinking

思维链步骤（ReAct 模式）。

```json
{
  "version": "v1",
  "eventId": "uuid",
  "conversationId": "uuid",
  "messageId": "uuid",
  "phase": "thought | action | observation",
  "text": "string",
  "toolName": "string",
  "status": "pending | running | done | error",
  "stepIndex": 0,
  "timestamp": "ISO 8601"
}
```

### 6. message_end

消息输出结束。

```json
{
  "version": "v1",
  "eventId": "uuid",
  "conversationId": "uuid",
  "messageId": "uuid",
  "finishReason": "completed | plan_draft | error | ...",
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0
  },
  "timestamp": "ISO 8601"
}
```

### 7. error

流处理过程中的错误。

```json
{
  "version": "v1",
  "eventId": "uuid",
  "conversationId": "uuid",
  "messageId": "uuid",
  "code": "PLANNER_TIMEOUT | COORDINATOR_ERROR | CLI_ERROR | ...",
  "message": "human-readable description",
  "retryable": true,
  "timestamp": "ISO 8601"
}
```

## 前端处理流程

`lib/sse.ts` → EventSource → 按 eventType 分发 → `chatStore` 更新流式内容

- `message_start`: `initStreamingMessage()`
- `token`: `appendStreamToken()`
- `artifact`: `appendStreamArtifact()`
- `thinking`: `appendThinkingStep()`
- `message_end`: `finalizeStreamingMessage()` + 触发数据刷新
- `error`: 显示错误提示
