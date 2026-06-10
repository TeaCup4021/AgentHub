# 源资产清单

本文档记录 AgentHub 现有协作资产的位置。

在这些资产被补录为稳定图谱节点之前，它们都先作为源资产保留在原目录中。

## 项目规则与工作流

| 路径 | 作用 |
| --- | --- |
| `AGENTS.md` | 仓库级 AI 协作规则和长期约定。 |
| `archive/development/vibe-coding-templates/workflow.md` | 已有的 Plan -> Review -> Implement -> Summarize 工作流。 |
| `archive/development/vibe-coding-templates/plan-template.md` | 已有实施计划模板。 |
| `archive/development/vibe-coding-templates/summary-template.md` | 已有实施总结模板。 |
| `docs/vibe-graph/handoff.md` | Vibe Graph 协作规范交付给项目负责人的入口。 |
| `docs/vibe-graph/SKILL.md` | 仓库内 Codex Skill，指导后续 AI 维护图谱。 |
| `docs/vibe-graph/prompts.md` | 可复制给 AI 使用的固定协作口令。 |

## 架构与契约文档

| 路径 | 作用 |
| --- | --- |
| `docs/AgentHub-*.md` | 架构设计、前端设计、后端路线图和对齐记录。 |
| `docs/*alignment*` 或项目契约文档 | 前后端 API 契约与对齐规则。 |

## AI 协作知识沉淀

| 路径 | 作用 |
| --- | --- |
| `docs/ai-collab/README.md` | AI 协作文档的短入口，按子目录路由上下文。 |
| `docs/ai-collab/contracts/` | API、SSE、数据库和前端长期契约。 |
| `docs/ai-collab/runtime/` | Agent Adapter 和群聊编排等运行机制。 |
| `docs/ai-collab/playbooks/` | 本地验证、联调和排障手册。 |
| `docs/ai-collab/reference/` | 术语和历史上下文索引。 |
| `docs/ai-collab/decisions/` | 按领域分类的 ADR 和修复决策记录。 |

## 前端 Spec 与 Plan

| 路径 | 作用 |
| --- | --- |
| `agenthub-web/docs/specs/` | 前端 spec、审计记录、backlog、bug report 和功能规格。 |
| `agenthub-web/docs/plans/` | 前端实施计划和阶段计划。 |

## Vibe Coding 计划与总结

| 路径 | 作用 |
| --- | --- |
| `archive/development/plans/` | 历史每日计划和功能级实施计划。 |
| `archive/development/summaries/` | 历史实施总结、验证记录和修复记录。 |

## 实现目录

| 路径 | 作用 |
| --- | --- |
| `backend/` | FastAPI 后端、ADK 集成、services、schemas 和 tests。 |
| `agenthub-web/src/` | React 前端实现、components、API client、mocks、tests 和样式。 |

## 索引规则

启动图谱时，不移动、不重写源资产。

正确做法是新增图谱节点，并通过路径引用源资产。

如果一份源资产包含多个独立能力，则按能力拆分为多个图谱节点，并让这些节点共同引用同一份源资产。

## 已补录能力

| 能力 | 图谱节点 |
| --- | --- |
| AI 协作规范 | `SPEC-AICOLLAB-VIBE-GRAPH-001` |
| AI 协作上下文路由 | `SPEC-AICOLLAB-CONTEXT-ROUTING-001` |
| AI 协作文档物理分类 | `SPEC-AICOLLAB-DOC-TAXONOMY-001` |
| 群聊 DAG 执行 | `SPEC-GROUPCHAT-DAG-001` |
| PPT 内联浏览 | `SPEC-PREVIEW-PPT-INLINE-001` |
| 富媒体产物卡片 | `SPEC-ARTIFACT-RICH-CARD-001` |
| Diff 应用到源产物 | `SPEC-DIFF-APPLY-SOURCE-001` |
| 轻量级部署预览 | `SPEC-DEPLOYMENT-PREVIEW-001` |
| CodeCard 编辑回写 | `SPEC-ARTIFACT-EDIT-WRITEBACK-001` |
| Agent 管理与模型配置 | `SPEC-AGENT-MANAGEMENT-001` |
| 会话消息与 PinSpec 基础链路 | `SPEC-CONVERSATION-MESSAGE-PIN-001` |

