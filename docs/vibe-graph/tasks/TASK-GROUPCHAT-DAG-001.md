---
id: TASK-GROUPCHAT-DAG-001
type: task
title: confirmed 路由进入 DAG 执行
status: implemented
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
plan: PLAN-GROUPCHAT-DAG-001
specs:
  - SPEC-GROUPCHAT-DAG-001
source_assets:
  - archive/development/plans/群聊DAG执行与Orchestrator总结重构.md
  - archive/development/summaries/群聊DAG执行与Orchestrator总结重构-summary.md
depends_on: []
relates_to: []
implements:
  - backend/app/api/v1/conversations.py
traces:
  - TRACE-GROUPCHAT-DAG-001
blocked_by: []
acceptance:
  - confirmed plan 进入 _dag_workflow_stream。
  - 保留 _coordinator_stream 但不作为 confirmed plan 主路径。
---

# confirmed 路由进入 DAG 执行

## 目标

修复群聊确认计划后只走 Coordinator 导致计划分工和依赖被丢弃的问题。

## 前置条件

- 已存在 OrchestratorTask confirmed 状态。
- 已有 plan subtasks。

## 预期触达路径

- `backend/app/api/v1/conversations.py`

## 执行步骤

1. 找到 confirmed task 的 streaming 路由。
2. 将 confirmed plan 执行路径切换到 `_dag_workflow_stream`。
3. 保留 `_coordinator_stream`，避免一次性删除影响其他路径。

## 验收标准

- [ ] confirmed plan 不再降级成纯 Coordinator 展示。
- [ ] DAG 执行可以读取 `orch_task.plan.subtasks`。

## 实施记录

见 `TRACE-GROUPCHAT-DAG-001`。

## Obsidian 双链

Related:

- [[SPEC-GROUPCHAT-DAG-001]]
- [[PLAN-GROUPCHAT-DAG-001]]
- [[TRACE-GROUPCHAT-DAG-001]]

