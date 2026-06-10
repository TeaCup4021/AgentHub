---
id: TASK-GROUPCHAT-DAG-008
type: task
title: 排序、显示名、语言与回归测试
status: implemented
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
plan: PLAN-GROUPCHAT-DAG-001
specs:
  - SPEC-GROUPCHAT-DAG-001
source_assets:
  - archive/development/summaries/群聊DAG执行与Orchestrator总结重构-summary.md
  - docs/ai-collab/decisions/orchestration/002-group-chat-dag-execution.md
depends_on:
  - TASK-GROUPCHAT-DAG-003
  - TASK-GROUPCHAT-DAG-006
relates_to: []
implements:
  - backend/app/api/v1/conversations.py
  - backend/app/services/message.py
  - backend/app/services/adk/planner.py
  - backend/tests/services/adapters/test_adk_to_sse_multiagent.py
traces:
  - TRACE-GROUPCHAT-DAG-001
blocked_by: []
acceptance:
  - Summary 消息排在 Agent 输出之后。
  - 计划草稿和消息列表显示真实 Agent 名。
  - Planner instruction 使用与用户请求一致的语言。
  - 多 Agent translator 行为有回归测试覆盖。
---

# 排序、显示名、语言与回归测试

## 目标

补齐 DAG 执行链路中的收尾体验与回归保障：summary 排序、Agent 名显示、中文回复倾向和 translator 多 Agent 行为测试。

## 前置条件

- 多 Agent 消息分桶已实现。
- Orchestrator summary 已接入。

## 预期触达路径

- `backend/app/api/v1/conversations.py`
- `backend/app/services/message.py`
- `backend/app/services/adk/planner.py`
- `backend/tests/services/adapters/test_adk_to_sse_multiagent.py`

## 执行步骤

1. Summary 消息显式设置 `created_at/updated_at`。
2. 计划草稿 Agent 名按 DB `AgentModel.name` 权威覆盖。
3. 消息列表优先使用单条消息的 `meta_data.agent_name`。
4. Planner instruction 使用用户请求语言。
5. 增加 translator 多 Agent 回归测试。

## 验收标准

- [ ] Summary 在消息列表中排最后。
- [ ] 刷新后多 Agent 消息不塌缩成同一名字。
- [ ] 中文用户请求对应中文 instruction 或中文回复要求。
- [ ] `test_adk_to_sse_multiagent.py` 覆盖分桶、跳过 workflow author、交错 token 不截断。

## 实施记录

见 `TRACE-GROUPCHAT-DAG-001`。

## Obsidian 双链

Related:

- [[SPEC-GROUPCHAT-DAG-001]]
- [[PLAN-GROUPCHAT-DAG-001]]
- [[TASK-GROUPCHAT-DAG-003]]
- [[TASK-GROUPCHAT-DAG-006]]
- [[TRACE-GROUPCHAT-DAG-001]]

