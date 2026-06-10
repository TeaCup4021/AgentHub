---
id: PLAN-GROUPCHAT-DAG-001
type: plan
title: 群聊 DAG 执行与 Orchestrator 总结实施计划
status: implemented
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
specs:
  - SPEC-GROUPCHAT-DAG-001
source_assets:
  - vibeCodingPlan/群聊DAG执行与Orchestrator总结重构.md
  - vibeCodingSummary/群聊DAG执行与Orchestrator总结重构-summary.md
  - docs/ai-collab/decisions/002-group-chat-dag-execution.md
depends_on: []
relates_to: []
tasks:
  - TASK-GROUPCHAT-DAG-001
  - TASK-GROUPCHAT-DAG-002
  - TASK-GROUPCHAT-DAG-003
  - TASK-GROUPCHAT-DAG-004
  - TASK-GROUPCHAT-DAG-005
  - TASK-GROUPCHAT-DAG-006
  - TASK-GROUPCHAT-DAG-007
  - TASK-GROUPCHAT-DAG-008
review:
  required: true
  confirmed_by: historical-summary
  confirmed_at: 2026-06-06
risks:
  - ADK Workflow 并行 flush 行为需要真实联调观察。
  - 当前仓库状态与历史 summary 存在部分实现差异，见 TRACE 偏差记录。
verification:
  - command: pytest tests/
    result: partial
    notes: 历史 summary 记录 29 passed，7 failed 为预存 pytest-asyncio 环境问题。
  - command: tsc --noEmit
    result: passed
    notes: 历史 summary 记录通过。
  - command: vitest run
    result: passed
    notes: 历史 summary 记录 16 files / 104 tests passed。
---

# 群聊 DAG 执行与 Orchestrator 总结实施计划

## 来源 Spec

- `SPEC-GROUPCHAT-DAG-001`: 群聊计划确认后的 DAG 执行、多 Agent 独立消息、Orchestrator 总结和前端归属修复。

## 实施目标

将群聊 confirmed plan 从 Coordinator 降级执行改为 DAG 执行，并保证多 Agent 输出、追踪、展示和最终总结都能独立、完整、可验证。

## 实施范围

- `backend/app/api/v1/conversations.py`
- `backend/app/api/v1/messages.py`
- `backend/app/services/adapters/adk_to_sse.py`
- `backend/app/services/adk/execution_tracer.py`
- `backend/app/services/adk/merge_aggregator.py`
- `backend/app/services/adk/planner.py`
- `backend/app/services/message.py`
- `agenthub-web/src/components/layout/ChatArea.tsx`
- `agenthub-web/src/types/chat.ts`
- `backend/tests/services/adapters/test_adk_to_sse_multiagent.py`

## 方案

1. 确认计划后进入 `_dag_workflow_stream`。
2. 前端确认计划时保留 DAG subtask 依赖字段。
3. 后端 translator 使用 `(invocation_id, author)` 生成每个 Agent 的稳定 message_id。
4. ExecutionTracer 使用 invocation + agent 复合键记录多 Agent 指标。
5. DAG 模式跳过工作流自身 author，不生成伪 Agent 消息。
6. 前端 SSE 回调使用事件自带 `message_id` 归属流式内容。
7. MergeAggregator 调 Orchestrator 模型生成最终自然语言总结。
8. 修正排序、显示名和 Planner instruction 语言。

## Task 拆分

| Task ID | 标题 | 预期触达路径 | 验收点 |
| --- | --- | --- | --- |
| `TASK-GROUPCHAT-DAG-001` | confirmed 路由进入 DAG 执行 | `backend/app/api/v1/conversations.py` | confirmed plan 不再丢弃依赖。 |
| `TASK-GROUPCHAT-DAG-002` | 保留 subtask DAG 字段 | `agenthub-web/src/components/layout/ChatArea.tsx`, `agenthub-web/src/types/chat.ts` | `depends_on/mode/output_key` 传回后端。 |
| `TASK-GROUPCHAT-DAG-003` | 多 Agent SSE 消息分桶 | `backend/app/services/adapters/adk_to_sse.py` | 一个 invocation 下多个 author 拆成多条消息。 |
| `TASK-GROUPCHAT-DAG-004` | 多 Agent 执行追踪 | `backend/app/services/adk/execution_tracer.py`, `backend/app/api/v1/conversations.py` | 每个 Agent 独立 status/latency/output_message_id。 |
| `TASK-GROUPCHAT-DAG-005` | 前端 SSE 事件归属 | `agenthub-web/src/components/layout/ChatArea.tsx` | token/artifact/thinking/message_end 按 message_id 分发。 |
| `TASK-GROUPCHAT-DAG-006` | Orchestrator LLM 总结 | `backend/app/services/adk/merge_aggregator.py`, `backend/app/api/v1/conversations.py` | 最终总结为自然语言并保留结构化 artifact。 |
| `TASK-GROUPCHAT-DAG-007` | Orchestrator 选择与 mentions 语义 | `backend/app/api/v1/messages.py`, `agenthub-web/src/components/layout/ChatArea.tsx` | 真实 @ 与默认 planner 语义可区分。 |
| `TASK-GROUPCHAT-DAG-008` | 排序、显示名、语言与回归测试 | `backend/app/api/v1/conversations.py`, `backend/app/services/message.py`, `backend/app/services/adk/planner.py`, `backend/tests/services/adapters/test_adk_to_sse_multiagent.py` | summary 排最后、真名显示、中文 instruction、多 Agent translator 测试通过。 |

## 契约与兼容性

- 不新增 SSE 事件类型。
- 继续使用现有 message_start、token、artifact、agent_status、thinking、message_end、error 协议。
- 前端 `mentions` 字段仍为 UUID 列表，但不再用全员列表伪造真实 @。
- `PlanSubtask` 兼容 snake_case 和 camelCase 字段。

## 风险

- 并行流式依赖 ADK Workflow 真实事件 flush 行为。
- 当前仓库中 `_dag_workflow_stream` 仍显示 `sequential=True`，与历史 plan/summary 中“关闭强制串行化”的说法不一致，需要后续复核。
- 当前 `messages.py` 实现为单 @ 选择 planner、零/多 @ 用默认 DeepSeek，未见历史 plan 中描述的多 @ LLM 消歧 helper。

## 验证计划

- 后端 pytest。
- 前端 TypeScript 检查。
- 前端 vitest。
- 真实群聊联调观察三 Agent 独立消息、依赖顺序、并行内容完整性和最终总结顺序。

## Review

该节点为历史补录，review 信息来自 2026-06-06 历史 summary 和 ADR，不代表当前用户在本次补录中重新确认业务实现。

## Obsidian 双链

Related:

- [[SPEC-GROUPCHAT-DAG-001]]
- [[TASK-GROUPCHAT-DAG-001]]
- [[TASK-GROUPCHAT-DAG-002]]
- [[TASK-GROUPCHAT-DAG-003]]
- [[TASK-GROUPCHAT-DAG-004]]
- [[TASK-GROUPCHAT-DAG-005]]
- [[TASK-GROUPCHAT-DAG-006]]
- [[TASK-GROUPCHAT-DAG-007]]
- [[TASK-GROUPCHAT-DAG-008]]
- [[TRACE-GROUPCHAT-DAG-001]]
