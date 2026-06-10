---
id: TASK-GROUPCHAT-DAG-003
type: task
title: 多 Agent SSE 消息分桶
status: implemented
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
plan: PLAN-GROUPCHAT-DAG-001
specs:
  - SPEC-GROUPCHAT-DAG-001
source_assets:
  - docs/ai-collab/decisions/002-group-chat-dag-execution.md
  - vibeCodingSummary/群聊DAG执行与Orchestrator总结重构-summary.md
depends_on:
  - TASK-GROUPCHAT-DAG-001
relates_to:
  - TASK-GROUPCHAT-DAG-004
  - TASK-GROUPCHAT-DAG-005
implements:
  - backend/app/services/adapters/adk_to_sse.py
  - backend/tests/services/adapters/test_adk_to_sse_multiagent.py
traces:
  - TRACE-GROUPCHAT-DAG-001
blocked_by: []
acceptance:
  - 同一 invocation_id 下按 author 派生稳定 message_id。
  - DAG 模式跳过不在 agent_name_map 中的工作流自身 author。
  - 并行交错 token 不因 author 切换而被截断。
---

# 多 Agent SSE 消息分桶

## 目标

解决 ADK Workflow 多个 Agent 共用 invocation_id 时，translator 将多个 Agent 合并成一条消息的问题。

## 前置条件

- ADK event 包含 `invocation_id` 和 `author`。
- DAG 构建阶段可提供 `agent_name_map`。

## 预期触达路径

- `backend/app/services/adapters/adk_to_sse.py`
- `backend/tests/services/adapters/test_adk_to_sse_multiagent.py`

## 执行步骤

1. 使用 `agent_message_id(invocation_id, author)` 生成确定性 UUID。
2. `message_start`、token、artifact、status、message_end 都使用该 message_id。
3. DAG 模式跳过 workflow 自身 author。
4. 删除或避免 author 切换时关闭上一条消息的逻辑。
5. 增加多 Agent 和交错 token 测试。

## 验收标准

- [ ] 一个 invocation 下多个 author 生成多条 Agent 消息。
- [ ] `orchestrator_plan` 这类 workflow author 不生成消息。
- [ ] A/B/A/B 交错 token 不截断任一 Agent 内容。

## 实施记录

见 `TRACE-GROUPCHAT-DAG-001`。

## Obsidian 双链

Related:

- [[SPEC-GROUPCHAT-DAG-001]]
- [[PLAN-GROUPCHAT-DAG-001]]
- [[TASK-GROUPCHAT-DAG-001]]
- [[TASK-GROUPCHAT-DAG-004]]
- [[TASK-GROUPCHAT-DAG-005]]
- [[TRACE-GROUPCHAT-DAG-001]]
