---
id: PLAN-AICOLLAB-VIBE-GRAPH-001
type: plan
title: Vibe Graph AI 协作规范交付计划
status: implemented
owner: AI Collaboration
created: 2026-06-10
updated: 2026-06-10
specs:
  - SPEC-AICOLLAB-VIBE-GRAPH-001
source_assets:
  - AGENTS.md
  - archive/development/vibe-coding-templates/workflow.md
  - docs/vibe-graph/rules.md
  - docs/vibe-graph/SKILL.md
depends_on: []
relates_to:
  - PLAN-GROUPCHAT-DAG-001
tasks:
  - TASK-AICOLLAB-VIBE-GRAPH-001
  - TASK-AICOLLAB-VIBE-GRAPH-002
  - TASK-AICOLLAB-VIBE-GRAPH-003
  - TASK-AICOLLAB-VIBE-GRAPH-004
  - TASK-AICOLLAB-VIBE-GRAPH-005
review:
  required: true
  confirmed_by: user
  confirmed_at: 2026-06-10
risks:
  - 如果只补规则而没有交付说明，负责人难以快速理解如何复用。
  - 如果只有一个历史样例，规范的可迁移性证明不足。
  - 如果历史补录过度扩展，可能误把不确定信息写成事实。
verification:
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 交付节点和 PPT 补录节点新增后运行。
---

# Vibe Graph AI 协作规范交付计划

## 来源 Spec

- `SPEC-AICOLLAB-VIBE-GRAPH-001`: 定义 AgentHub Vibecoding 过程中人类与 AI 协作的可追溯规范。

## 实施目标

把已有 Vibe Graph 雏形收口为可交付给项目负责人的规范包，并补充第二个历史样例证明其可复用性。

## 实施范围

- 协作规范自身的 `SPEC/PLAN/TASK/TRACE` 链路。
- 面向负责人的交付说明 `handoff.md`。
- `SKILL.md`、`rules.md`、`index.md`、`README.md`、`obsidian.md`、`prompts.md` 的交付化更新。
- `PPT 内联浏览` 历史功能补录为第二个样例。
- 两份图谱 summary，作为交付和补录记录。

不在本次计划内：

- 修改业务源码。
- 安装个人 Codex Skill。
- 迁移全部历史文档。

## 方案

1. 为协作规范自身创建 `SPEC-AICOLLAB-VIBE-GRAPH-001`。
2. 将交付动作拆成规则、Skill、交付说明、历史样例和校验收口五个 task。
3. 新增 `handoff.md`，用负责人视角解释规范包如何使用和验收。
4. 补录 `PREVIEW-PPT-INLINE` 第二条历史样例链路。
5. 更新入口文档和 Obsidian 关系。
6. 运行校验脚本并把结果写入 trace。

## Task 拆分

| Task ID | 标题 | 预期触达路径 | 验收点 |
| --- | --- | --- | --- |
| `TASK-AICOLLAB-VIBE-GRAPH-001` | 定义协作规范链路与规则边界 | `docs/vibe-graph/rules.md`, `docs/vibe-graph/specs/` | 规范自身有可追溯 spec。 |
| `TASK-AICOLLAB-VIBE-GRAPH-002` | 整理 Skill、模板和固定口令 | `docs/vibe-graph/SKILL.md`, `docs/vibe-graph/prompts.md` | 后续 AI 能按 Skill 执行。 |
| `TASK-AICOLLAB-VIBE-GRAPH-003` | 补负责人交付说明和入口索引 | `docs/vibe-graph/handoff.md`, `docs/vibe-graph/index.md` | 负责人可快速验收。 |
| `TASK-AICOLLAB-VIBE-GRAPH-004` | 补录 PPT 内联浏览历史样例 | `docs/vibe-graph/specs/`, `plans/`, `tasks/`, `traces/` | 第二个案例链路完整。 |
| `TASK-AICOLLAB-VIBE-GRAPH-005` | 校验并记录交付总结 | `docs/vibe-graph/scripts/validate-vibe-graph.py`, `archive/development/summaries/` | 校验通过并有 summary。 |

## 契约与兼容性

- 不改变 `archive/development/vibe-coding-templates/workflow.md` 的 Plan -> Review -> Implement -> Summarize 闭环。
- Vibe Graph 作为索引层补充稳定节点和关系。
- 继续保留历史 `archive/development/plans/`、`archive/development/summaries/`、`docs/ai-collab/` 原位。
- 图谱节点路径使用仓库相对路径，便于校验和跨 AI 使用。

## 风险

- 历史补录的当前代码状态可能与历史 summary 有差异，需要在 trace 中记录。
- Skill 不能写得过长，否则后续 AI 加载成本过高。
- 负责人可能需要的是“方法论说明”而非所有节点细节，因此需要单独的 handoff 入口。

## 验证计划

- [ ] 新增和更新节点后运行 `python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph`。
- [ ] 确认 `handoff.md` 能独立说明背景、使用方式、样例和验收清单。
- [ ] 确认第二个历史样例至少包含 spec、plan、task、trace 和 summary 链接。

## Review

该计划来自用户在 2026-06-10 明确要求“补充你提到的这些内容”，因此本次仅补充协作规范和历史补录文档，不进入业务代码实现。

## Obsidian 双链

Related:

- [[SPEC-AICOLLAB-VIBE-GRAPH-001]]
- [[TASK-AICOLLAB-VIBE-GRAPH-001]]
- [[TASK-AICOLLAB-VIBE-GRAPH-002]]
- [[TASK-AICOLLAB-VIBE-GRAPH-003]]
- [[TASK-AICOLLAB-VIBE-GRAPH-004]]
- [[TASK-AICOLLAB-VIBE-GRAPH-005]]
- [[TRACE-AICOLLAB-VIBE-GRAPH-001]]
- [[PLAN-GROUPCHAT-DAG-001]]

