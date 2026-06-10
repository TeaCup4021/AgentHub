---
id: TASK-GROUPCHAT-DAG-007
type: task
title: Orchestrator 选择与 mentions 语义
status: implemented
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
plan: PLAN-GROUPCHAT-DAG-001
specs:
  - SPEC-GROUPCHAT-DAG-001
source_assets:
  - vibeCodingPlan/群聊DAG执行与Orchestrator总结重构.md
  - vibeCodingSummary/群聊DAG执行与Orchestrator总结重构-summary.md
depends_on: []
relates_to: []
implements:
  - backend/app/api/v1/messages.py
  - agenthub-web/src/components/layout/ChatArea.tsx
traces:
  - TRACE-GROUPCHAT-DAG-001
blocked_by: []
acceptance:
  - 前端 mentions 只表达真实 @。
  - 后端可以根据 mentions 判断 Orchestrator。
  - 无 @ 时使用默认 Orchestrator。
---

# Orchestrator 选择与 mentions 语义

## 目标

让 `@Agent` 能影响 Orchestrator 选择，同时避免前端无 @ 时自动填全员导致后端无法区分真实 @ 和兜底参与者。

## 前置条件

- 群聊会话已有绑定 Agent。
- 前端能提取真实 mentions。

## 预期触达路径

- `backend/app/api/v1/messages.py`
- `agenthub-web/src/components/layout/ChatArea.tsx`

## 执行步骤

1. 前端不再把无 @ 的群聊 mentions 自动填成全员。
2. 群聊守卫改为检查会话绑定 Agent 数。
3. 后端 auto_orchestrate 根据 mentions 设置 planner_agent_id。
4. 无法确定或无 @ 时使用默认 Orchestrator。

## 验收标准

- [ ] 无 @ 不再被伪造成全员 @。
- [ ] 单 @ 可作为 planner_agent_id。
- [ ] 零或多 @ 使用默认 DeepSeek Orchestrator。

## 实施记录

见 `TRACE-GROUPCHAT-DAG-001`。历史 plan 曾要求多 @ 使用 LLM 消歧；当前仓库未见 `_disambiguate_orchestrator` helper，作为偏差记录。

## Obsidian 双链

Related:

- [[SPEC-GROUPCHAT-DAG-001]]
- [[PLAN-GROUPCHAT-DAG-001]]
- [[TRACE-GROUPCHAT-DAG-001]]
