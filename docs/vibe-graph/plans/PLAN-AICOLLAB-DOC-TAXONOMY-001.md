---
id: PLAN-AICOLLAB-DOC-TAXONOMY-001
type: plan
title: AI 协作文档物理分类实施计划
status: implemented
owner: AI Collaboration
created: 2026-06-10
updated: 2026-06-10
specs:
  - SPEC-AICOLLAB-DOC-TAXONOMY-001
source_assets:
  - docs/ai-collab/README.md
  - docs/ai-collab/reference/context-index.md
depends_on:
  - PLAN-AICOLLAB-CONTEXT-ROUTING-001
relates_to: []
tasks:
  - TASK-AICOLLAB-DOC-TAXONOMY-001
review:
  required: true
  confirmed_by: user
  confirmed_at: 2026-06-10
risks:
  - 移动文件会导致历史 source_assets 路径失效。
  - 旧路径如果保留 stub，可能造成重复入口和上下文膨胀。
  - 目录分类如果过细，后续维护成本会上升。
verification:
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: not_run
    notes: 结果以 TRACE 为准。
---

# AI 协作文档物理分类实施计划

## 来源 Spec

- `SPEC-AICOLLAB-DOC-TAXONOMY-001`: 将 `ai-collab` 从单目录索引改为物理分类。

## 实施目标

用目录结构承担上下文路由，减少后续 AI 读取 `ai-collab` 时的上下文压力。

## 实施范围

- 移动现有 `ai-collab` 文件到类型和功能子目录。
- 为根目录、子目录和 ADR 子领域补短 README。
- 更新 `docs/` 和 `archive/` 中的旧路径引用。
- 回写 Vibe Graph 链路和 summary。

不在本次计划内：

- 重写主题文档正文。
- 修改业务源码。
- 创建旧路径跳转 stub。

## 方案

1. 建立 `contracts/`, `runtime/`, `playbooks/`, `playbooks/debug/`, `reference/` 和 ADR 子领域目录。
2. 移动现有文件到对应目录。
3. 用短 README 替代单个大索引。
4. 机械替换旧路径为新路径。
5. 运行 Vibe Graph 校验并记录结果。

## Task 拆分

| Task ID | 标题 | 预期触达路径 | 验收点 |
| --- | --- | --- | --- |
| `TASK-AICOLLAB-DOC-TAXONOMY-001` | 迁移 ai-collab 为物理分类目录 | `docs/ai-collab/**`, `docs/vibe-graph/**`, `archive/development/summaries/**` | 路径存在且校验通过。 |

## 契约与兼容性

- 不涉及 API、SSE、数据库或前端运行时契约变更。
- 只改变协作文档组织方式和引用路径。
- 不保留旧路径 stub，避免 AI 误读重复入口。

## 风险

- 外部未纳入仓库的链接可能需要人工更新。
- 历史 summary 中保留的旧路径如果没有全量替换，可能影响追溯。

## 验证计划

- [ ] 检查 `docs/ai-collab` 根目录只保留短入口和子目录。
- [ ] 检查旧路径显式引用。
- [ ] 运行 `python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph`。

## Review

用户在 2026-06-10 明确要求开始实现物理分类迁移。

## Obsidian 双链

Related:

- [[SPEC-AICOLLAB-DOC-TAXONOMY-001]]
- [[TASK-AICOLLAB-DOC-TAXONOMY-001]]
- [[TRACE-AICOLLAB-DOC-TAXONOMY-001]]
