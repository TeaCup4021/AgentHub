---
id: SPEC-AICOLLAB-DOC-TAXONOMY-001
type: spec
title: AI 协作文档物理分类
status: implemented
owner: AI Collaboration
created: 2026-06-10
updated: 2026-06-10
source_assets:
  - docs/ai-collab/README.md
  - docs/ai-collab/reference/context-index.md
  - docs/vibe-graph/specs/SPEC-AICOLLAB-CONTEXT-ROUTING-001.md
depends_on:
  - SPEC-AICOLLAB-CONTEXT-ROUTING-001
relates_to:
  - SPEC-AICOLLAB-VIBE-GRAPH-001
plans:
  - PLAN-AICOLLAB-DOC-TAXONOMY-001
acceptance:
  - ai-collab 根目录按文档类型和功能拆分为子目录。
  - 每个子目录具备短 README，后续 AI 可先选目录再读文件。
  - 旧路径引用被更新为新路径，Vibe Graph 校验通过。
  - 历史 context-index.md 被降级为参考资料，不再作为必读大索引。
non_goals:
  - 重写主题文档正文。
  - 为旧路径保留一批跳转 stub 文件。
  - 修改业务源码。
contracts:
  - docs/ai-collab/README.md
---

# AI 协作文档物理分类

## 背景

用户指出单一 `context-index.md` 未来也会膨胀并占用过多上下文。更好的方式是让目录结构承担第一层路由，把 `ai-collab` 现有文件按类型和功能移动到子目录中。

## 目标

- 将 `docs/ai-collab/` 改为物理分类结构。
- 让根 README 保持短入口，只说明子目录选择。
- 每个子目录提供短 README，列出少量直接可读文件。
- 更新 Vibe Graph 和历史文档中的旧路径引用。

## 范围

- `docs/ai-collab/contracts/`
- `docs/ai-collab/runtime/`
- `docs/ai-collab/playbooks/`
- `docs/ai-collab/playbooks/debug/`
- `docs/ai-collab/decisions/*/`
- `docs/ai-collab/reference/`
- 相关 Vibe Graph 节点和 summary。

## 非目标

- 不改变文档表达的业务约定。
- 不移动 `archive/` 历史计划和总结。
- 不创建大量旧路径跳转文件，避免重复入口。

## 输入

- 用户关于物理分类的要求。
- 现有 `docs/ai-collab/` 文件。
- 既有 `SPEC-AICOLLAB-CONTEXT-ROUTING-001` 链路。

## 输出

- 物理分类后的 `ai-collab` 目录结构。
- 更新后的内部引用路径。
- 可追溯的 PLAN、TASK、TRACE 和 summary。

## 关键约束

- 新结构必须比单个大索引更省上下文。
- 根 README 和子目录 README 必须短小。
- 迁移后 Vibe Graph `source_assets` 和 `contracts` 路径必须存在。
- 旧 `context-index.md` 只作为历史参考保留。

## 验收标准

- [ ] 与 frontmatter `acceptance` 保持一致。
- [ ] 根目录不再堆放全部主题文件。
- [ ] 新目录结构能指导 AI 只读一个子目录。
- [ ] 图谱校验通过。

## 追溯

- Plan: `PLAN-AICOLLAB-DOC-TAXONOMY-001`
- Task: `TASK-AICOLLAB-DOC-TAXONOMY-001`
- Trace: `TRACE-AICOLLAB-DOC-TAXONOMY-001`

## Obsidian 双链

Related:

- [[PLAN-AICOLLAB-DOC-TAXONOMY-001]]
- [[TASK-AICOLLAB-DOC-TAXONOMY-001]]
- [[TRACE-AICOLLAB-DOC-TAXONOMY-001]]
- [[SPEC-AICOLLAB-CONTEXT-ROUTING-001]]
