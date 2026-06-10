---
id: SPEC-AICOLLAB-CONTEXT-ROUTING-001
type: spec
title: AI 协作上下文路由索引
status: implemented
owner: AI Collaboration
created: 2026-06-10
updated: 2026-06-10
source_assets:
  - docs/ai-collab/README.md
  - docs/ai-collab/decisions/README.md
  - docs/vibe-graph/rules.md
depends_on:
  - SPEC-AICOLLAB-VIBE-GRAPH-001
relates_to:
  - SPEC-GROUPCHAT-DAG-001
  - SPEC-ARTIFACT-RICH-CARD-001
plans:
  - PLAN-AICOLLAB-CONTEXT-ROUTING-001
acceptance:
  - AI 能在创建 SPEC 前按场景选择最小 ai-collab 读取集。
  - ai-collab 文件按核心契约、架构机制、术语验证、调试手册和 ADR 分类。
  - ADR 和 debug 文档都有明确读取触发条件，避免被默认全量加载。
  - README 提供上下文控制入口并链接详细索引。
non_goals:
  - 移动或重命名现有 ai-collab 文件。
  - 重写各主题文档正文。
  - 替代 Vibe Graph 的 SPEC/PLAN/TASK/TRACE 链路。
contracts:
  - docs/ai-collab/reference/context-index.md
---

# AI 协作上下文路由索引

## 背景

用户指出 Vibecoding 在建立 SPEC 前需要读取 `docs/ai-collab/`，但不能一次性把过多内容塞入上下文。现有 `README.md` 只有文件清单，缺少按场景、优先级和读取预算选择上下文的规则。

因此需要把 `ai-collab` 中的文档重新分类为可路由的上下文资产，让后续 AI 能先选场景，再读取最小必要文档。

## 目标

- 为 `docs/ai-collab/` 建立上下文路由入口。
- 将现有文档分类为核心契约、架构机制、术语验证、调试手册和 ADR。
- 提供按需求场景选择文档的读取矩阵。
- 明确 ADR 和 debug 文档的触发条件，避免默认全量读取。
- 让 README 能快速引导后续 AI 进入最小读取集。

## 范围

- `docs/ai-collab/reference/context-index.md`
- `docs/ai-collab/README.md`
- `docs/ai-collab/decisions/README.md`
- 对应的 Vibe Graph 节点和实施总结。

## 非目标

- 不改变 `docs/ai-collab/` 现有文件路径。
- 不修改业务源码。
- 不把调试经验直接提升为长期契约。
- 不为每个 ai-collab 文件创建单独 SPEC。

## 输入

- 用户关于上下文长度控制和分类整理的要求。
- 现有 `docs/ai-collab/*.md` 与 `docs/ai-collab/decisions/*.md`。
- `docs/vibe-graph/rules.md` 中的新需求和 AI 协作规则约束。

## 输出

- 一个可由 AI 读取的 `context-index.md`。
- 更新后的 `README.md`。
- 更新后的 `decisions/README.md`。
- 可追溯的 PLAN、TASK、TRACE 和 summary。

## 关键约束

- 分类索引必须帮助减少上下文，而不是增加强制读取内容。
- 场景读取矩阵必须指出 `Must read` 和 `Read if needed`。
- 调试手册只能作为排障输入，不应默认进入新需求 SPEC。
- ADR 只在需求触达相关历史决策时读取。

## 验收标准

- [ ] 与 frontmatter `acceptance` 保持一致。
- [ ] 后续 AI 可先读 `context-index.md`，再按场景读取少量主题文件。
- [ ] README 明确禁止默认全量读取 `ai-collab`。
- [ ] Vibe Graph 校验通过。

## 追溯

- Plan: `PLAN-AICOLLAB-CONTEXT-ROUTING-001`
- Task: `TASK-AICOLLAB-CONTEXT-ROUTING-001`
- Trace: `TRACE-AICOLLAB-CONTEXT-ROUTING-001`

## Obsidian 双链

Related:

- [[PLAN-AICOLLAB-CONTEXT-ROUTING-001]]
- [[TASK-AICOLLAB-CONTEXT-ROUTING-001]]
- [[TRACE-AICOLLAB-CONTEXT-ROUTING-001]]
- [[SPEC-AICOLLAB-VIBE-GRAPH-001]]
