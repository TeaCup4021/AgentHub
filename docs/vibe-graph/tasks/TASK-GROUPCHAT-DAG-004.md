---
id: TASK-GROUPCHAT-DAG-004
type: task
title: 多 Agent 执行追踪
status: implemented
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
plan: PLAN-GROUPCHAT-DAG-001
specs:
  - SPEC-GROUPCHAT-DAG-001
source_assets:
  - docs/ai-collab/decisions/orchestration/002-group-chat-dag-execution.md
  - archive/development/summaries/群聊DAG执行与Orchestrator总结重构-summary.md
depends_on:
  - TASK-GROUPCHAT-DAG-003
relates_to: []
implements:
  - backend/app/services/adk/execution_tracer.py
  - backend/app/api/v1/conversations.py
traces:
  - TRACE-GROUPCHAT-DAG-001
blocked_by: []
acceptance:
  - tracer records 使用 invocation + agent 复合键。
  - subtask metrics 能回填各 Agent output_message_id。
---

# 多 Agent 执行追踪

## 目标

解决 ExecutionTracer 以 invocation_id 为唯一 key 导致多 Agent 记录互相覆盖的问题。

## 前置条件

- translator 已能为每个 Agent 生成稳定 message_id。
- WorkflowBuilder 执行回调提供 invocation_id 和 agent_name。

## 预期触达路径

- `backend/app/services/adk/execution_tracer.py`
- `backend/app/api/v1/conversations.py`

## 执行步骤

1. ExecutionTracer 使用 `invocation_id|agent_name` 作为记录 key。
2. 在 DAG 执行后根据 tracer records 生成 subtask metrics。
3. 使用 `agent_message_id` 将 Agent 输出消息 ID 回填到 metrics。

## 验收标准

- [ ] 多 Agent 执行后 tracer records 数量与真实 Agent 数匹配。
- [ ] 每个 subtask 能关联自己的 output_message_id。

## 实施记录

见 `TRACE-GROUPCHAT-DAG-001`。

## Obsidian 双链

Related:

- [[SPEC-GROUPCHAT-DAG-001]]
- [[PLAN-GROUPCHAT-DAG-001]]
- [[TASK-GROUPCHAT-DAG-003]]
- [[TRACE-GROUPCHAT-DAG-001]]

