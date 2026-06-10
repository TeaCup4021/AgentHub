# Vibe Graph 索引

本文档是 AgentHub 可追溯知识图谱的入口。

## 图谱链路

```text
SPEC -> PLAN -> TASK -> IMPLEMENTS -> TRACE -> SUMMARY
```

## 节点类型

| 类型 | 作用 | 目录 |
| --- | --- | --- |
| `SPEC` | 稳定的能力、行为或需求定义 | `docs/vibe-graph/specs/` |
| `PLAN` | 基于一个或多个 spec 生成的实施计划 | `docs/vibe-graph/plans/` |
| `TASK` | 从 plan 拆解出的可执行工作单元 | `docs/vibe-graph/tasks/` |
| `TRACE` | 一个或多个 task 的实现与验证记录 | `docs/vibe-graph/traces/` |

## 源资产入口

图谱索引只链接已有资产，不移动它们：

- `docs/`
- `docs/ai-collab/`
- `docs/ai-collab/decisions/`
- `agenthub-web/docs/specs/`
- `agenthub-web/docs/plans/`
- `archive/development/plans/`（原 `vibeCodingPlan/`）
- `archive/development/summaries/`（原 `vibeCodingSummary/`）
- `archive/development/vibe-coding-templates/`（原 `.vibe-coding/`）
- `AGENTS.md`

第一版资产清单见 `source-assets.md`。

## 协作入口

| 文档 | 用途 |
| --- | --- |
| `rules.md` | 图谱节点、流程、状态和 AI 操作约束。 |
| `handoff.md` | 面向项目负责人的协作规范交付说明。 |
| `prompts.md` | 与 Codex 协作时可复制使用的固定口令。 |
| `obsidian.md` | Obsidian 双链图谱入口与 Mermaid 总览。 |
| `templates/` | `SPEC`、`PLAN`、`TASK`、`TRACE` 节点模板。 |
| `references/node-schema.md` | 节点 frontmatter 和关系 schema 精简参考。 |
| `references/migration-guide.md` | 历史 Claude Code/Codex/Vibecoding 文档补录步骤。 |
| `scripts/validate-vibe-graph.py` | 图谱节点校验脚本。 |

## 当前状态

| 区域 | 状态 | 说明 |
| --- | --- | --- |
| 索引层 | 已建立 | 已创建入口文件、源资产清单和协作规则。 |
| 节点模板 | 已建立 | 已提供 `SPEC`、`PLAN`、`TASK`、`TRACE` 四类模板。 |
| Skill | 已强化 | `docs/vibe-graph/SKILL.md` 可作为仓库内 Codex Skill 使用，并覆盖新需求、历史补录、实施追踪和交付场景。 |
| 校验机制 | 已建立 | 可运行 `scripts/validate-vibe-graph.py` 校验节点。 |
| 负责人交付 | 已建立 | `handoff.md` 可作为规范包交付入口。 |
| 历史迁移试点 | 已扩展 | 已补录 `GROUPCHAT-DAG`、`PREVIEW-PPT-INLINE`、`ARTIFACT-RICH-CARD`、`DIFF-APPLY-SOURCE`、`DEPLOYMENT-PREVIEW` 多条样例链路。 |
| Obsidian 式双链 | 已开始 | 已维护样例节点双链，并在 `obsidian.md` 提供 Mermaid 总览。 |

## 已有试点

- `SPEC-AICOLLAB-VIBE-GRAPH-001`
- `PLAN-AICOLLAB-VIBE-GRAPH-001`
- `TASK-AICOLLAB-VIBE-GRAPH-001` 至 `TASK-AICOLLAB-VIBE-GRAPH-005`
- `TRACE-AICOLLAB-VIBE-GRAPH-001`
- `SPEC-GROUPCHAT-DAG-001`
- `PLAN-GROUPCHAT-DAG-001`
- `TASK-GROUPCHAT-DAG-001` 至 `TASK-GROUPCHAT-DAG-008`
- `TRACE-GROUPCHAT-DAG-001`
- `SPEC-PREVIEW-PPT-INLINE-001`
- `PLAN-PREVIEW-PPT-INLINE-001`
- `TASK-PREVIEW-PPT-INLINE-001` 至 `TASK-PREVIEW-PPT-INLINE-006`
- `TRACE-PREVIEW-PPT-INLINE-001`
- `SPEC-ARTIFACT-RICH-CARD-001`
- `PLAN-ARTIFACT-RICH-CARD-001`
- `TASK-ARTIFACT-RICH-CARD-001` 至 `TASK-ARTIFACT-RICH-CARD-006`
- `TRACE-ARTIFACT-RICH-CARD-001`
- `SPEC-DIFF-APPLY-SOURCE-001`
- `PLAN-DIFF-APPLY-SOURCE-001`
- `TASK-DIFF-APPLY-SOURCE-001` 至 `TASK-DIFF-APPLY-SOURCE-004`
- `TRACE-DIFF-APPLY-SOURCE-001`
- `SPEC-DEPLOYMENT-PREVIEW-001`
- `PLAN-DEPLOYMENT-PREVIEW-001`
- `TASK-DEPLOYMENT-PREVIEW-001` 至 `TASK-DEPLOYMENT-PREVIEW-005`
- `TRACE-DEPLOYMENT-PREVIEW-001`

后续候选：

- CodeCard 编辑回写。
- Agent 管理与模型配置。
- 会话、消息和 PinSpec 基础链路。
