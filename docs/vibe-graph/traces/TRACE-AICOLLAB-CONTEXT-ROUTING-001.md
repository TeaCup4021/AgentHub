---
id: TRACE-AICOLLAB-CONTEXT-ROUTING-001
type: trace
title: AI 协作上下文路由索引实施追踪
status: verified
owner: AI Collaboration
created: 2026-06-10
updated: 2026-06-10
tasks:
  - TASK-AICOLLAB-CONTEXT-ROUTING-001
source_assets:
  - docs/ai-collab/README.md
  - docs/ai-collab/decisions/README.md
depends_on: []
relates_to:
  - TRACE-AICOLLAB-VIBE-GRAPH-001
implements:
  - docs/ai-collab/reference/context-index.md
  - docs/ai-collab/README.md
  - docs/ai-collab/decisions/README.md
  - docs/vibe-graph/specs/SPEC-AICOLLAB-CONTEXT-ROUTING-001.md
  - docs/vibe-graph/plans/PLAN-AICOLLAB-CONTEXT-ROUTING-001.md
  - docs/vibe-graph/tasks/TASK-AICOLLAB-CONTEXT-ROUTING-001.md
  - docs/vibe-graph/traces/TRACE-AICOLLAB-CONTEXT-ROUTING-001.md
  - archive/development/summaries/ai-collab-context-routing-2026-06-10.md
summaries:
  - archive/development/summaries/ai-collab-context-routing-2026-06-10.md
verification:
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 校验通过，0 errors，0 warnings。
deviations:
  - plan_item: 可通过目录迁移进行物理分类
    actual: 保持原文件位置，新增上下文索引进行逻辑分类
    reason: 避免破坏历史链接、source_assets 和已有文档引用。
followups:
  - 新增 ai-collab 文档时同步更新 context-index.md。
---

# AI 协作上下文路由索引实施追踪

## 对应任务

- `TASK-AICOLLAB-CONTEXT-ROUTING-001`

## 实际触达路径

- `docs/ai-collab/reference/context-index.md`
- `docs/ai-collab/README.md`
- `docs/ai-collab/decisions/README.md`
- `docs/vibe-graph/specs/SPEC-AICOLLAB-CONTEXT-ROUTING-001.md`
- `docs/vibe-graph/plans/PLAN-AICOLLAB-CONTEXT-ROUTING-001.md`
- `docs/vibe-graph/tasks/TASK-AICOLLAB-CONTEXT-ROUTING-001.md`
- `docs/vibe-graph/traces/TRACE-AICOLLAB-CONTEXT-ROUTING-001.md`
- `archive/development/summaries/ai-collab-context-routing-2026-06-10.md`

## 实施摘要

新增 `context-index.md`，将 `ai-collab` 文档按上下文读取用途分类，并提供场景读取矩阵、SPEC 最小上下文包、ADR 触发条件和 debug 文档症状索引。

同时更新 `docs/ai-collab/README.md` 和 `docs/ai-collab/decisions/README.md`，让后续 AI 进入该目录时先按场景选择文档，而不是全量加载。

## 验证结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph` | `passed` | 校验通过，0 errors，0 warnings。 |

## 与计划的偏差

| 计划项 | 实际实现 | 原因 |
| --- | --- | --- |
| 可通过目录迁移进行物理分类 | 保持原文件位置，新增上下文索引进行逻辑分类 | 避免破坏历史链接、source_assets 和已有文档引用。 |

## 后续事项

- 新增 `ai-collab` 文档时同步更新 `context-index.md`。
- 若某 debug 文档沉淀出长期契约，应摘录到核心契约文档，再由 `context-index.md` 指向。

## Summary 链接

- `archive/development/summaries/ai-collab-context-routing-2026-06-10.md`

## Obsidian 双链

Related:

- [[SPEC-AICOLLAB-CONTEXT-ROUTING-001]]
- [[PLAN-AICOLLAB-CONTEXT-ROUTING-001]]
- [[TASK-AICOLLAB-CONTEXT-ROUTING-001]]
- [[TRACE-AICOLLAB-VIBE-GRAPH-001]]
