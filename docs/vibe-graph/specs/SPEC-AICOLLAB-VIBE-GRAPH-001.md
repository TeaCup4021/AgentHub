---
id: SPEC-AICOLLAB-VIBE-GRAPH-001
type: spec
title: Vibe Graph AI 协作规范
status: implemented
owner: AI Collaboration
created: 2026-06-10
updated: 2026-06-10
source_assets:
  - AGENTS.md
  - .vibe-coding/workflow.md
  - .vibe-coding/plan-template.md
  - .vibe-coding/summary-template.md
  - docs/vibe-graph/rules.md
  - docs/vibe-graph/SKILL.md
  - docs/vibe-graph/prompts.md
depends_on: []
relates_to:
  - SPEC-GROUPCHAT-DAG-001
plans:
  - PLAN-AICOLLAB-VIBE-GRAPH-001
acceptance:
  - 新需求能够按 SPEC -> PLAN -> TASK -> IMPLEMENTS -> TRACE -> SUMMARY 链路追溯。
  - AI 在需求、计划、实施、验证和总结阶段的行为边界被规则化。
  - Skill、模板、固定口令和校验脚本能够支撑后续 Codex 实例复用。
  - 交付说明能够让项目负责人理解规范用途、目录结构、样例和验收方式。
  - 图谱节点通过 validate-vibe-graph.py 校验。
non_goals:
  - 替代业务架构文档或前后端接口契约。
  - 一次性迁移所有历史 Vibecoding 文档。
  - 将未运行的测试或未确认的计划标记为已验证。
contracts:
  - docs/vibe-graph/rules.md
  - docs/vibe-graph/references/node-schema.md
---

# Vibe Graph AI 协作规范

## 背景

项目负责人要求在 Vibecoding 过程中沉淀一套属于 AgentHub 自己的人类与 AI 协作规范，交付内容需要包含 spec、skill、rules 等资产，而不是零散的计划和总结文件。

AgentHub 已经存在 `.vibe-coding/` 工作流、`vibeCodingPlan/`、`vibeCodingSummary/`、`docs/ai-collab/` 和大量历史决策记录。Vibe Graph 的目标是在这些资产之上补充稳定 ID、节点关系、任务追踪和验证记录，让后续 AI 可以沿着同一条链路理解、执行和复现工作。

## 目标

- 建立项目级 AI 协作知识图谱规范。
- 让新需求默认先沉淀 `SPEC`，再生成 `PLAN`，再拆分 `TASK`，实施后回写 `TRACE` 和 `SUMMARY`。
- 将既有 `.vibe-coding` 工作流从线性计划扩展为可追溯图谱。
- 为后续 Codex 或其他 AI 实例提供可复用 Skill、模板、固定口令和校验机制。
- 形成可交付给项目负责人的协作规范包。

## 范围

- `docs/vibe-graph/rules.md` 中的协作规则。
- `docs/vibe-graph/SKILL.md` 中的仓库内 Skill。
- `docs/vibe-graph/templates/` 中的节点模板。
- `docs/vibe-graph/prompts.md` 中的固定协作口令。
- `docs/vibe-graph/scripts/validate-vibe-graph.py` 中的校验脚本。
- `docs/vibe-graph/handoff.md` 中的负责人交付说明。
- 至少两个可参考图谱样例：`GROUPCHAT-DAG` 与 `PREVIEW-PPT-INLINE`。

## 非目标

- 不重写历史计划、总结和决策文档。
- 不改变业务代码来配合图谱补录。
- 不强制所有开发请求都等待长篇文档；用户明确要求直接实施时，可记录偏离并继续执行。
- 不把图谱节点当作唯一事实来源；源码、测试输出和历史 summary 仍是事实依据。

## 输入

- 用户提出的新功能、接口、交互、修复或协作规则需求。
- 历史计划、总结、决策记录和契约文档。
- 实施过程中真实修改的代码、配置、测试和文档路径。
- 验证命令、运行结果、未运行原因和偏差说明。

## 输出

- 稳定 ID 的 `SPEC-*`、`PLAN-*`、`TASK-*`、`TRACE-*` 节点。
- `implements` 中记录的实际触达路径。
- `summaries` 中链接的实施总结。
- 面向负责人和后续 AI 的交付说明、Skill 和固定口令。
- 可由校验脚本验证的图谱关系。

## 关键约束

- 图谱节点必须可追溯到真实源资产、用户请求或仓库文件。
- 新功能默认需要 `SPEC` 和 `PLAN`，且 `PLAN.review.required` 为 `true`。
- 未验证内容不得标记为 `verified`。
- 历史补录不得伪造用户确认、测试结果或实现路径。
- 图谱是索引层，不搬迁、不重写历史文档。

## 验收标准

- [ ] 新需求链路能从 `SPEC` 追到 `SUMMARY`。
- [ ] `rules.md` 清楚定义节点、状态、流程、事实约束和粒度约束。
- [ ] `SKILL.md` 能指导后续 AI 创建、补录和校验图谱节点。
- [ ] `handoff.md` 能作为负责人交付入口。
- [ ] 至少两个历史或业务样例完成补录。
- [ ] 校验脚本通过，无错误和警告。

## 追溯

- Plan: `PLAN-AICOLLAB-VIBE-GRAPH-001`
- Tasks: `TASK-AICOLLAB-VIBE-GRAPH-001` 至 `TASK-AICOLLAB-VIBE-GRAPH-005`
- Trace: `TRACE-AICOLLAB-VIBE-GRAPH-001`

## Obsidian 双链

Related:

- [[PLAN-AICOLLAB-VIBE-GRAPH-001]]
- [[TASK-AICOLLAB-VIBE-GRAPH-001]]
- [[TASK-AICOLLAB-VIBE-GRAPH-002]]
- [[TASK-AICOLLAB-VIBE-GRAPH-003]]
- [[TASK-AICOLLAB-VIBE-GRAPH-004]]
- [[TASK-AICOLLAB-VIBE-GRAPH-005]]
- [[TRACE-AICOLLAB-VIBE-GRAPH-001]]
- [[SPEC-GROUPCHAT-DAG-001]]
