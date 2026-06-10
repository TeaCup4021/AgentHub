---
id: TASK-GROUPCHAT-DAG-002
type: task
title: 保留 subtask DAG 字段
status: implemented
owner: Frontend
created: 2026-06-09
updated: 2026-06-09
plan: PLAN-GROUPCHAT-DAG-001
specs:
  - SPEC-GROUPCHAT-DAG-001
source_assets:
  - archive/development/summaries/群聊DAG执行与Orchestrator总结重构-summary.md
depends_on:
  - TASK-GROUPCHAT-DAG-001
relates_to: []
implements:
  - agenthub-web/src/components/layout/ChatArea.tsx
  - agenthub-web/src/types/chat.ts
traces:
  - TRACE-GROUPCHAT-DAG-001
blocked_by: []
acceptance:
  - 前端确认计划时保留 depends_on、mode、output_key。
  - 后端可根据确认 payload 还原依赖图。
---

# 保留 subtask DAG 字段

## 目标

避免前端确认计划时只传 `subtask_id/agent_id/instruction`，导致 DAG 依赖退化成全并行。

## 前置条件

- 前端已有计划草稿和确认事件。
- 后端 `_dag_workflow_stream` 能读取 subtask 字段。

## 预期触达路径

- `agenthub-web/src/components/layout/ChatArea.tsx`
- `agenthub-web/src/types/chat.ts`

## 执行步骤

1. 扩展 `PlanSubtask` 类型字段。
2. `handleConfirmPlan` payload 中保留 `depends_on`、`mode`、`output_key`。
3. 保持既有字段兼容。

## 验收标准

- [ ] 依赖链可从前端确认 payload 传回后端。
- [ ] `PlanSubtask` 支持 snake_case 和 camelCase 兼容字段。

## 实施记录

见 `TRACE-GROUPCHAT-DAG-001`。

## Obsidian 双链

Related:

- [[SPEC-GROUPCHAT-DAG-001]]
- [[PLAN-GROUPCHAT-DAG-001]]
- [[TASK-GROUPCHAT-DAG-001]]
- [[TRACE-GROUPCHAT-DAG-001]]

