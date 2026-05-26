# 群聊 Orchestrator 前后端接口契约

日期：2026-05-26 | 状态：已约定，待后端对齐

> 本文档取代 `AgentHub-架构设计前端.md` 第 6 节中的三个"待确认"勾选项。
> 全部 SSE 事件基础格式沿用 6 种标准事件类型（message_start / token / artifact / agent_status / message_end / error）。

---

## 1. 计划消息（步骤②）

Orchestrator 拆解完成后，通过标准 SSE `message_start → token → message_end` 返回计划：

```
event: message_start
data: {
  "version": "v1",
  "event_id": "evt-001",
  "conversation_id": "conv-1",
  "message_id": "msg-plan-001",
  "sender": { "type": "orchestrator", "id": "orchestrator-001", "name": "Orchestrator" },
  "meta": {
    "plan": [
      {
        "subtask_id": "sub-1",
        "agent": { "id": "agent-claude-code", "name": "Claude Code" },
        "instruction": "编写登录页面 React 组件",
        "priority": 1
      },
      {
        "subtask_id": "sub-2",
        "agent": { "id": "agent-codex", "name": "Codex" },
        "instruction": "编写登录 API 接口",
        "priority": 1
      }
    ]
  },
  "timestamp": "2026-05-26T15:00:00Z"
}

event: token
data: {
  "version": "v1", "event_id": "evt-002", "conversation_id": "conv-1",
  "message_id": "msg-plan-001", "delta": "我将任务拆解为以下子任务：\n", "index": 0, "timestamp": "..."
}

event: message_end
data: {
  "version": "v1", "event_id": "evt-003", "conversation_id": "conv-1",
  "message_id": "msg-plan-001", "finish_reason": "plan_draft",
  "usage": { "input_tokens": 500, "output_tokens": 80 }, "timestamp": "..."
}
```

**关键约定：**
- `message_start.sender.type === "orchestrator"` 标识此消息来自编排器
- `meta.plan` 是子任务数组，每个子任务含 `subtask_id / agent / instruction / priority`
- `message_end.finish_reason === "plan_draft"` 表示这是待确认计划，非最终回复
- `token` 事件返回计划描述文本（可选），前端展示在卡片上方

---

## 2. 用户确认/调整（步骤③④）

复用 `POST /messages`，新增 `mode: "confirm_plan"`：

```
POST /api/v1/conversations/{conversation_id}/messages

Request:
{
  "content": "",
  "mode": "confirm_plan",
  "plan_id": "msg-plan-001",
  "plan": [
    {
      "subtask_id": "sub-1",
      "agent_id": "agent-claude-code",
      "instruction": "编写登录页面 React 组件"
    },
    {
      "subtask_id": "sub-2",
      "agent_id": "agent-opencode",
      "instruction": "编写登录 API 接口"
    }
  ]
}

Response:
{ "code": 200, "data": { "message_id": "msg-confirm-001", "status": "accepted" }, "message": "ok" }
```

**关键约定：**
- `mode: "confirm_plan"` 区别于 `direct` 和 `auto_orchestrate`
- `plan_id` 为要确认的计划消息 ID
- `plan[]` 是用户可能调整后的最终子任务列表
- 调整分派在前端 UI 完成（用户修改 agent_id/instruction），改完后一次发送
- 后端收到后立即开始执行各子任务，前端同时建立 SSE 连接接收执行流

---

## 3. 各 Agent 执行（步骤⑤）

每个子任务以独立 SSE 生命周期输出，使用标准 6 种事件：

```
event: message_start
data: {
  "version": "v1",
  "event_id": "evt-010",
  "conversation_id": "conv-1",
  "message_id": "msg-exec-001",
  "sender": { "type": "agent", "id": "agent-claude-code", "name": "Claude Code" },
  "meta": {
    "subtask_id": "sub-1",
    "plan_id": "msg-plan-001"
  },
  "timestamp": "..."
}

event: token  →  data: { ... "delta": "我来编写登录组件", ... }

event: artifact  →  data: { ... "artifact": { ... }, ... }

event: message_end  →  data: { ... "finish_reason": "completed", "usage": {...}, ... }
```

**agent_status 事件追踪执行状态：**

```
event: agent_status
data: {
  "version": "v1",
  "event_id": "evt-011",
  "conversation_id": "conv-1",
  "message_id": "msg-exec-001",
  "task_id": "msg-plan-001",
  "subtask_id": "sub-1",
  "agent": { "id": "agent-claude-code", "name": "Claude Code" },
  "status": "running",
  "progress": 60,
  "timestamp": "..."
}
```

**关键约定：**
- `message_start.meta.subtask_id` 关联消息到子任务
- `message_start.meta.plan_id` 关联消息到计划
- `agent_status.subtask_id` 追踪子任务执行进度
- 多个 Agent 可并行/交织输出（前端按时间顺序展示各 Agent 消息气泡）

---

## 4. 聚合汇总（步骤⑥）

全部子任务 `status ∈ {success, failed, timeout}` 后，Orchestrator 发送汇总消息：

```
event: message_start
data: {
  "version": "v1",
  "event_id": "evt-050",
  "conversation_id": "conv-1",
  "message_id": "msg-summary-001",
  "sender": { "type": "orchestrator", "id": "orchestrator-001", "name": "Orchestrator" },
  "meta": {
    "plan_id": "msg-plan-001",
    "summary": {
      "total": 2,
      "success": 1,
      "failed": 1,
      "results": [
        {
          "subtask_id": "sub-1",
          "status": "success",
          "message_id": "msg-exec-001"
        },
        {
          "subtask_id": "sub-2",
          "status": "failed",
          "message_id": "msg-exec-002",
          "error": "Codex 超时"
        }
      ]
    }
  },
  "timestamp": "..."
}

event: token  →  data: { "delta": "任务执行完毕。1/2 成功，1/2 失败。\n\n...", ... }

event: message_end  →  data: { "finish_reason": "completed", ... }
```

**关键约定：**
- `meta.summary` 包含执行结果汇总
- `token` 返回自然语言版汇总文本
- 前端用 `OrchestratorSummary` 卡片渲染汇总

---

## 5. 完整 SSE 事件时序

```
message_start (orchestrator, plan)
  → token × N
  → message_end (finish_reason: "plan_draft")

[用户确认 → POST /messages confirm_plan]

message_start (agent, subtask_1)
  → token... → artifact... → message_end

message_start (agent, subtask_2)        ← 可与 subtask_1 交织
  agent_status (subtask_1, running, 60%)
  → token... → message_end

agent_status (subtask_1, success)
agent_status (subtask_2, failed)

message_start (orchestrator, summary)
  → token × N
  → message_end (finish_reason: "completed")
```

---

## 6. TypeScript 类型定义（前端，供后端参考）

```typescript
// 计划消息
interface PlanSubtask {
  subtask_id: string;
  agent: { id: string; name: string };
  instruction: string;
  priority: number;
}

interface PlanMeta {
  plan: PlanSubtask[];
}

// 汇总消息
interface SummaryResult {
  subtask_id: string;
  status: "success" | "failed";
  message_id: string;
  error?: string;
}

interface SummaryMeta {
  plan_id: string;
  summary: {
    total: number;
    success: number;
    failed: number;
    results: SummaryResult[];
  };
}

// SSEMessageStart.meta 类型（联合）
// meta?: PlanMeta | SummaryMeta | Record<string, unknown> | null;

// 确认计划请求
interface ConfirmPlanRequest {
  content: string;
  mode: "confirm_plan";
  plan_id: string;
  plan: {
    subtask_id: string;
    agent_id: string;
    instruction: string;
  }[];
}
```

---

## 7. 与现有协议的关系

- SSE 基础格式不变（`version / event_id / conversation_id / timestamp`）
- 6 种 SSE 事件类型不变（message_start / token / artifact / agent_status / message_end / error）
- 新增的消息模式 `confirm_plan` 是 `POST /messages` 的 `mode` 字段扩展
- `message_start` 的 `meta` 字段此前为 `unknown` 类型，本次明确定义其结构
- `finish_reason` 新增 `"plan_draft"` 值
