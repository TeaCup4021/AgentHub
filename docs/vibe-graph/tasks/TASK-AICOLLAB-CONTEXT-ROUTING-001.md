---
id: TASK-AICOLLAB-CONTEXT-ROUTING-001
type: task
title: 整理 ai-collab 最小上下文读取索引
status: implemented
owner: AI Collaboration
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-AICOLLAB-CONTEXT-ROUTING-001
specs:
  - SPEC-AICOLLAB-CONTEXT-ROUTING-001
source_assets:
  - docs/ai-collab/README.md
  - docs/ai-collab/decisions/README.md
depends_on: []
relates_to:
  - TASK-AICOLLAB-VIBE-GRAPH-001
implements:
  - docs/ai-collab/reference/context-index.md
  - docs/ai-collab/README.md
  - docs/ai-collab/decisions/README.md
  - docs/vibe-graph/specs/SPEC-AICOLLAB-CONTEXT-ROUTING-001.md
  - docs/vibe-graph/plans/PLAN-AICOLLAB-CONTEXT-ROUTING-001.md
  - docs/vibe-graph/tasks/TASK-AICOLLAB-CONTEXT-ROUTING-001.md
  - docs/vibe-graph/traces/TRACE-AICOLLAB-CONTEXT-ROUTING-001.md
  - archive/development/summaries/ai-collab-context-routing-2026-06-10.md
traces:
  - TRACE-AICOLLAB-CONTEXT-ROUTING-001
blocked_by: []
acceptance:
  - context-index.md 明确 ai-collab 文档类型和读取触发条件。
  - README 提供上下文控制入口。
  - decisions/README.md 提供 ADR 场景分类。
---

# 整理 ai-collab 最小上下文读取索引

## 目标

让后续 AI 在建立 SPEC 前能够根据需求场景选择最小 `ai-collab` 读取集。

## 前置条件

- 用户明确要求控制上下文长度。
- 现有 `docs/ai-collab/` 文件保留原位。
- Vibe Graph 规则要求 AI 协作规则变更具备可追溯链路。

## 预期触达路径

- `docs/ai-collab/reference/context-index.md`
- `docs/ai-collab/README.md`
- `docs/ai-collab/decisions/README.md`
- `docs/vibe-graph/specs/SPEC-AICOLLAB-CONTEXT-ROUTING-001.md`
- `docs/vibe-graph/plans/PLAN-AICOLLAB-CONTEXT-ROUTING-001.md`
- `docs/vibe-graph/tasks/TASK-AICOLLAB-CONTEXT-ROUTING-001.md`
- `docs/vibe-graph/traces/TRACE-AICOLLAB-CONTEXT-ROUTING-001.md`
- `archive/development/summaries/ai-collab-context-routing-2026-06-10.md`

## 执行步骤

1. 盘点 `docs/ai-collab/` 现有文档类型。
2. 新增上下文路由索引。
3. 更新 README 和 ADR README。
4. 创建 Vibe Graph 链路。
5. 运行校验并记录 summary。

## 验收标准

- [ ] 与 frontmatter `acceptance` 保持一致。
- [ ] 能映射回父 plan 和相关 spec。

## 实施记录

见 `TRACE-AICOLLAB-CONTEXT-ROUTING-001`。

## Obsidian 双链

Related:

- [[SPEC-AICOLLAB-CONTEXT-ROUTING-001]]
- [[PLAN-AICOLLAB-CONTEXT-ROUTING-001]]
- [[TRACE-AICOLLAB-CONTEXT-ROUTING-001]]
