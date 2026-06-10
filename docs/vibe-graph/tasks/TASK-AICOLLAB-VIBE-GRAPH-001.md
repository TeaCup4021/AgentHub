---
id: TASK-AICOLLAB-VIBE-GRAPH-001
type: task
title: 定义协作规范链路与规则边界
status: implemented
owner: AI Collaboration
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-AICOLLAB-VIBE-GRAPH-001
specs:
  - SPEC-AICOLLAB-VIBE-GRAPH-001
source_assets:
  - AGENTS.md
  - archive/development/vibe-coding-templates/workflow.md
  - docs/vibe-graph/rules.md
depends_on: []
relates_to: []
implements:
  - docs/vibe-graph/specs/SPEC-AICOLLAB-VIBE-GRAPH-001.md
  - docs/vibe-graph/plans/PLAN-AICOLLAB-VIBE-GRAPH-001.md
  - docs/vibe-graph/rules.md
traces:
  - TRACE-AICOLLAB-VIBE-GRAPH-001
blocked_by: []
acceptance:
  - 协作规范自身具备 SPEC 和 PLAN 节点。
  - rules.md 明确新需求、历史补录、实施追踪和交付验收约束。
---

# 定义协作规范链路与规则边界

## 目标

让“人类与 AI 协作规范”本身也成为可追溯的图谱资产，而不是只散落在规则说明里。

## 前置条件

- 已存在 `docs/vibe-graph/rules.md`。
- 已存在 `archive/development/vibe-coding-templates/workflow.md`。
- 用户明确要求补充可交付的 spec、skill、rules 等协作规范。

## 预期触达路径

- `docs/vibe-graph/specs/SPEC-AICOLLAB-VIBE-GRAPH-001.md`
- `docs/vibe-graph/plans/PLAN-AICOLLAB-VIBE-GRAPH-001.md`
- `docs/vibe-graph/rules.md`

## 执行步骤

1. 提炼协作规范的目标、范围、非目标和验收标准。
2. 创建 `SPEC-AICOLLAB-VIBE-GRAPH-001`。
3. 创建 `PLAN-AICOLLAB-VIBE-GRAPH-001`。
4. 在规则中补充交付包和负责人验收维度。

## 验收标准

- [ ] 协作规范能从 spec 映射到 plan、task 和 trace。
- [ ] 规则明确禁止伪造验证、实现路径和用户确认。

## 实施记录

见 `TRACE-AICOLLAB-VIBE-GRAPH-001`。

## Obsidian 双链

Related:

- [[SPEC-AICOLLAB-VIBE-GRAPH-001]]
- [[PLAN-AICOLLAB-VIBE-GRAPH-001]]
- [[TRACE-AICOLLAB-VIBE-GRAPH-001]]

