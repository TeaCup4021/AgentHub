---
id: TRACE-GROUPCHAT-DAG-001
type: trace
title: 群聊 DAG 执行与 Orchestrator 总结实施追踪
status: partial
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
tasks:
  - TASK-GROUPCHAT-DAG-001
  - TASK-GROUPCHAT-DAG-002
  - TASK-GROUPCHAT-DAG-003
  - TASK-GROUPCHAT-DAG-004
  - TASK-GROUPCHAT-DAG-005
  - TASK-GROUPCHAT-DAG-006
  - TASK-GROUPCHAT-DAG-007
  - TASK-GROUPCHAT-DAG-008
source_assets:
  - vibeCodingPlan/群聊DAG执行与Orchestrator总结重构.md
  - vibeCodingSummary/群聊DAG执行与Orchestrator总结重构-summary.md
  - docs/ai-collab/decisions/002-group-chat-dag-execution.md
depends_on: []
relates_to: []
implements:
  - backend/app/api/v1/conversations.py
  - backend/app/api/v1/messages.py
  - backend/app/services/adapters/adk_to_sse.py
  - backend/app/services/adk/execution_tracer.py
  - backend/app/services/adk/merge_aggregator.py
  - backend/app/services/adk/planner.py
  - backend/app/services/message.py
  - agenthub-web/src/components/layout/ChatArea.tsx
  - agenthub-web/src/types/chat.ts
  - backend/tests/services/adapters/test_adk_to_sse_multiagent.py
summaries:
  - vibeCodingSummary/群聊DAG执行与Orchestrator总结重构-summary.md
verification:
  - command: pytest tests/
    result: partial
    notes: 历史 summary 记录 29 passed，7 failed 为预存 async/pytest-asyncio 环境问题；本次补录未重新运行全量测试。
  - command: tsc --noEmit
    result: passed
    notes: 历史 summary 记录通过；本次补录未重新运行。
  - command: vitest run
    result: passed
    notes: 历史 summary 记录 16 files / 104 tests passed；本次补录未重新运行。
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 本次补录后运行通过，0 errors，0 warnings。
deviations:
  - plan_item: DAG translator sequential=False，关闭强制串行化以支持无依赖并行流式。
    actual: 当前仓库 backend/app/api/v1/conversations.py 中 _dag_workflow_stream 仍显示 ADKToSSETranslator(sequential=True, agent_order=agent_order, ...)，需要后续复核是否为后续改动或历史记录偏差。
    reason: 本次只做历史补录，不修改业务代码。
  - plan_item: 多 @ 使用默认 DeepSeek LLM 消歧，解析失败取第一个 @。
    actual: 当前仓库 backend/app/api/v1/messages.py 中逻辑为单 @ 使用该 Agent，零或多 @ 使用默认 Orchestrator；未见 _disambiguate_orchestrator helper。
    reason: 当前实现与历史 plan/summary 描述不完全一致，需后续确认产品语义。
  - plan_item: MessageService 按单条消息 meta_data.agent_name 优先解析显示名。
    actual: 当前仓库 _resolve_name 中对 sender_id 为空且 fallback_agent_name 存在的 Agent 消息会先返回 fallback_agent_name，再检查 meta_data.agent_name。
    reason: 与历史 summary 中“优先取该消息自己的 meta_data.agent_name”存在细节差异，需后续复核是否影响 DAG 刷新显示。
followups:
  - 复核当前 _dag_workflow_stream 是否应继续 sequential=True，还是恢复历史计划中的 sequential=False。
  - 复核多 @ Orchestrator 消歧语义是否仍需要 LLM helper。
  - 复核 MessageService._resolve_name 的 fallback 顺序是否会重新造成 DAG agent 消息同名。
  - 可后续清理 _coordinator_stream 死代码和 DAG 诊断日志。
---

# 群聊 DAG 执行与 Orchestrator 总结实施追踪

## 对应任务

- `TASK-GROUPCHAT-DAG-001`
- `TASK-GROUPCHAT-DAG-002`
- `TASK-GROUPCHAT-DAG-003`
- `TASK-GROUPCHAT-DAG-004`
- `TASK-GROUPCHAT-DAG-005`
- `TASK-GROUPCHAT-DAG-006`
- `TASK-GROUPCHAT-DAG-007`
- `TASK-GROUPCHAT-DAG-008`

## 实际触达路径

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

## 实施摘要

历史实现将群聊 confirmed plan 的主执行路径迁移到 DAG Workflow，并围绕 ADK 多 Agent 共享 invocation_id 的事实，建立了基于 `(invocation_id, author)` 的消息分桶和执行追踪。前端侧改为按 SSE 事件自带 `message_id` 分发流式内容，避免多 Agent 交错流时写入同一条消息。执行完成后，MergeAggregator 调 Orchestrator 模型生成自然语言总结，同时保留结构化指标。

## 验证结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `pytest tests/` | `partial` | 历史 summary 记录 29 passed，7 failed 为预存 async/pytest-asyncio 环境问题。 |
| `tsc --noEmit` | `passed` | 历史 summary 记录通过。 |
| `vitest run` | `passed` | 历史 summary 记录 16 files / 104 tests passed。 |
| `python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph` | `passed` | 本次补录后运行通过，0 errors，0 warnings。 |

## 与计划的偏差

| 计划项 | 当前观察 | 原因 |
| --- | --- | --- |
| DAG translator `sequential=False` | 当前仓库 `_dag_workflow_stream` 仍显示 `sequential=True`。 | 当前补录只记录事实，不改业务代码；需要后续复核。 |
| 多 @ LLM 消歧 | 当前 `messages.py` 未见 `_disambiguate_orchestrator`，零或多 @ 使用默认 Orchestrator。 | 当前实现与历史 plan/summary 不完全一致。 |
| 消息名优先 meta_data.agent_name | 当前 `_resolve_name` 对 sender_id 为空且存在 fallback_agent_name 时先返回 fallback。 | 可能是后续改动或实现细节偏差，需要复核影响。 |

## 后续事项

- 复核当前代码与历史 summary 的三处偏差。
- 如确认历史期望仍有效，可另开新的 SPEC/PLAN/TASK 处理修正。
- 可将本试点作为后续 PPT 内联浏览、产物预览与编辑迁移的参考样例。

## Summary 链接

- `vibeCodingSummary/群聊DAG执行与Orchestrator总结重构-summary.md`

## Obsidian 双链

Related:

- [[SPEC-GROUPCHAT-DAG-001]]
- [[PLAN-GROUPCHAT-DAG-001]]
- [[TASK-GROUPCHAT-DAG-001]]
- [[TASK-GROUPCHAT-DAG-002]]
- [[TASK-GROUPCHAT-DAG-003]]
- [[TASK-GROUPCHAT-DAG-004]]
- [[TASK-GROUPCHAT-DAG-005]]
- [[TASK-GROUPCHAT-DAG-006]]
- [[TASK-GROUPCHAT-DAG-007]]
- [[TASK-GROUPCHAT-DAG-008]]
