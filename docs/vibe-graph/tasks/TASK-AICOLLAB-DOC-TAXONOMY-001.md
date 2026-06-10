---
id: TASK-AICOLLAB-DOC-TAXONOMY-001
type: task
title: 迁移 ai-collab 为物理分类目录
status: implemented
owner: AI Collaboration
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-AICOLLAB-DOC-TAXONOMY-001
specs:
  - SPEC-AICOLLAB-DOC-TAXONOMY-001
source_assets:
  - docs/ai-collab/README.md
  - docs/ai-collab/reference/context-index.md
depends_on: []
relates_to:
  - TASK-AICOLLAB-CONTEXT-ROUTING-001
implements:
  - docs/ai-collab/README.md
  - docs/ai-collab/contracts/README.md
  - docs/ai-collab/runtime/README.md
  - docs/ai-collab/playbooks/README.md
  - docs/ai-collab/playbooks/debug/README.md
  - docs/ai-collab/decisions/README.md
  - docs/ai-collab/reference/README.md
  - docs/vibe-graph/specs/SPEC-AICOLLAB-DOC-TAXONOMY-001.md
  - docs/vibe-graph/plans/PLAN-AICOLLAB-DOC-TAXONOMY-001.md
  - docs/vibe-graph/tasks/TASK-AICOLLAB-DOC-TAXONOMY-001.md
  - docs/vibe-graph/traces/TRACE-AICOLLAB-DOC-TAXONOMY-001.md
  - archive/development/summaries/ai-collab-doc-taxonomy-2026-06-10.md
traces:
  - TRACE-AICOLLAB-DOC-TAXONOMY-001
blocked_by: []
acceptance:
  - ai-collab 文件被移动到类型和功能目录。
  - 每个分类目录具备短 README。
  - Vibe Graph 校验通过。
---

# 迁移 ai-collab 为物理分类目录

## 目标

将 `docs/ai-collab/` 从扁平文件目录迁移为物理分类目录，让目录结构承担上下文路由。

## 前置条件

- 用户确认开始实现。
- `SPEC-AICOLLAB-DOC-TAXONOMY-001` 和 `PLAN-AICOLLAB-DOC-TAXONOMY-001` 已创建。

## 预期触达路径

- `docs/ai-collab/**`
- `docs/vibe-graph/**`
- `archive/development/summaries/ai-collab-doc-taxonomy-2026-06-10.md`

## 执行步骤

1. 创建分类目录。
2. 移动现有 `ai-collab` 文件。
3. 添加短 README。
4. 更新旧路径引用。
5. 运行校验。

## 验收标准

- [ ] 与 frontmatter `acceptance` 保持一致。
- [ ] 能映射回父 plan 和相关 spec。

## 实施记录

见 `TRACE-AICOLLAB-DOC-TAXONOMY-001`。

## Obsidian 双链

Related:

- [[SPEC-AICOLLAB-DOC-TAXONOMY-001]]
- [[PLAN-AICOLLAB-DOC-TAXONOMY-001]]
- [[TRACE-AICOLLAB-DOC-TAXONOMY-001]]
