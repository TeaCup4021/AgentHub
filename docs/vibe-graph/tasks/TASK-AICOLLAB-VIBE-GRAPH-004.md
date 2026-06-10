---
id: TASK-AICOLLAB-VIBE-GRAPH-004
type: task
title: 补录 PPT 内联浏览历史样例
status: implemented
owner: AI Collaboration
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-AICOLLAB-VIBE-GRAPH-001
specs:
  - SPEC-AICOLLAB-VIBE-GRAPH-001
source_assets:
  - vibeCodingPlan/AgentHub-PPT内联浏览-实施计划-v2.md
  - vibeCodingSummary/PPT内联浏览-实施总结-2026-06-06.md
  - vibeCodingSummary/PPT内联浏览-计划vs实际实施对比-2026-06-06.md
depends_on:
  - TASK-AICOLLAB-VIBE-GRAPH-003
relates_to:
  - SPEC-GROUPCHAT-DAG-001
implements:
  - docs/vibe-graph/specs/SPEC-PREVIEW-PPT-INLINE-001.md
  - docs/vibe-graph/plans/PLAN-PREVIEW-PPT-INLINE-001.md
  - docs/vibe-graph/tasks/TASK-PREVIEW-PPT-INLINE-001.md
  - docs/vibe-graph/tasks/TASK-PREVIEW-PPT-INLINE-002.md
  - docs/vibe-graph/tasks/TASK-PREVIEW-PPT-INLINE-003.md
  - docs/vibe-graph/tasks/TASK-PREVIEW-PPT-INLINE-004.md
  - docs/vibe-graph/tasks/TASK-PREVIEW-PPT-INLINE-005.md
  - docs/vibe-graph/tasks/TASK-PREVIEW-PPT-INLINE-006.md
  - docs/vibe-graph/traces/TRACE-PREVIEW-PPT-INLINE-001.md
  - vibeCodingSummary/vibe-graph-ppt-inline-backfill-2026-06-10.md
traces:
  - TRACE-AICOLLAB-VIBE-GRAPH-001
blocked_by: []
acceptance:
  - PPT 内联浏览拥有完整 SPEC、PLAN、TASK、TRACE 节点。
  - 补录只记录历史文档和当前仓库可确认事实，不修改业务代码。
---

# 补录 PPT 内联浏览历史样例

## 目标

用 `PPT 内联浏览` 作为第二个历史补录样例，证明 Vibe Graph 不只适用于单个群聊 DAG 案例。

## 前置条件

- 已存在 PPT 内联浏览 plan 和 summary。
- 能从当前仓库确认主要实现路径。

## 预期触达路径

- `docs/vibe-graph/specs/SPEC-PREVIEW-PPT-INLINE-001.md`
- `docs/vibe-graph/plans/PLAN-PREVIEW-PPT-INLINE-001.md`
- `docs/vibe-graph/tasks/TASK-PREVIEW-PPT-INLINE-001.md` 至 `TASK-PREVIEW-PPT-INLINE-006.md`
- `docs/vibe-graph/traces/TRACE-PREVIEW-PPT-INLINE-001.md`
- `vibeCodingSummary/vibe-graph-ppt-inline-backfill-2026-06-10.md`

## 执行步骤

1. 阅读 PPT 内联浏览历史计划和总结。
2. 根据能力边界创建 preview 领域 spec。
3. 将 plan v2 和实际实施差异映射为 graph plan。
4. 按转换服务、上传预览、artifact 检测、CLI、前端和降级验证拆分 task。
5. 创建 trace，记录历史验证和当前补录未重新运行验证的事实。

## 验收标准

- [ ] 新样例链路通过校验脚本。
- [ ] trace 记录 plan v1、plan v2 与实际实现差异。
- [ ] 所有 source_assets 和 implements 路径真实存在。

## 实施记录

见 `TRACE-AICOLLAB-VIBE-GRAPH-001` 和 `TRACE-PREVIEW-PPT-INLINE-001`。

## Obsidian 双链

Related:

- [[SPEC-AICOLLAB-VIBE-GRAPH-001]]
- [[PLAN-AICOLLAB-VIBE-GRAPH-001]]
- [[SPEC-PREVIEW-PPT-INLINE-001]]
- [[TRACE-AICOLLAB-VIBE-GRAPH-001]]
