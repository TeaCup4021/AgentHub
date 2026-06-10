# AI 协作开发记录

本文档汇总 AgentHub 项目采用 AI 辅助开发的完整流程、工具链和产物索引。

---

## 一、协作流程

AgentHub 的 AI 协作基于三层体系：**OpenSpec** 定义需求 → **Vibe Coding** 驱动日常开发 → **Vibe Graph** 保障长期追溯。

### 1.1 三层协作体系

```
┌─────────────────────────────────────────────────────────────┐
│                      AI 协作三层体系                          │
├─────────────────┬─────────────────┬─────────────────────────┤
│    OpenSpec     │   Vibe Coding   │      Vibe Graph         │
│  需求 → 规格     │  计划 → 实施     │  追溯 → 知识沉淀          │
├─────────────────┼─────────────────┼─────────────────────────┤
│ Proposal        │ Plan (日计划)    │ SPEC (稳定能力定义)       │
│ ↓               │ ↓               │ ↓                       │
│ Design          │ Review (确认)    │ PLAN (实施方案)           │
│ ↓               │ ↓               │ ↓                       │
│ Tasks           │ Implement (实现) │ TASK (可执行工作单元)     │
│ ↓               │ ↓               │ ↓                       │
│ Implementation  │ Summarize (总结) │ TRACE (实施验证记录)      │
│                 │                 │ ↓                       │
│                 │                 │ SUMMARY (总结归档)        │
├─────────────────┼─────────────────┼─────────────────────────┤
│ 回答"做什么"      │ 回答"怎么做"      │ 回答"做了什么，为什么"     │
│ 面向功能模块      │ 面向开发日        │ 面向长期维护              │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### 1.2 OpenSpec — 需求规格层

参照 [OpenSpec](https://github.com/anthropics/openspec) 规范，每个功能模块遵循 **Proposal → Design → Tasks → Implementation** 流程：

| 步骤 | 产物 | 说明 |
|------|------|------|
| **Proposal** | `proposal.md` | Why + What Changes + Impact 分析 |
| **Design** | `design.md` | 架构决策、数据流、组件树 |
| **Tasks** | `tasks.md` | 可验收的 checklist，含验证步骤 |
| **Spec** | `spec.md` | GIVEN/WHEN/THEN 场景化需求定义 |

示例：`agenthub-web/openspec/changes/phase4-agent-management/`

### 1.3 Vibe Coding — 日常开发层

每个开发日严格遵循 **Plan → Review → Implement → Summarize** 闭环：

```
Plan                 Review              Implement            Summarize
(生成执行计划)  →    (用户确认)     →    (按计划实现)    →    (写总结归档)
```

| 阶段 | 动作 | AI 角色 |
|------|------|--------|
| **Plan** | 从架构设计提取当日任务，生成执行计划到 `vibeCodingPlan/` | 分析需求 → 拆解步骤 → 输出计划 |
| **Review** | 提交计划给用户审阅，确认后进入实现 | 等待确认，不擅自执行 |
| **Implement** | 严格按计划编码，遵循 API 约定和命名规范 | 读代码 → 写代码 → 自检类型 |
| **Summarize** | 记录实现内容、变更文件、遗留问题到 `vibeCodingSummary/` | 提取 diff → 归纳 → 输出总结 |

### 1.4 Vibe Graph — 知识追溯层

长期维护的知识图谱，实现 **SPEC → PLAN → TASK → IMPLEMENTS → TRACE → SUMMARY** 全链路追溯：

| 节点 | 含义 | 存储位置 |
|------|------|---------|
| **SPEC** | 稳定的能力、行为、契约定义 | `docs/vibe-graph/specs/` |
| **PLAN** | 基于 spec 的实施计划 | `docs/vibe-graph/plans/` |
| **TASK** | 可执行、可验收的工作单元 | `docs/vibe-graph/tasks/` |
| **IMPLEMENTS** | task 实际触达的源码路径 | 记录在 TASK/TRACE frontmatter |
| **TRACE** | 实施过程、验证结果、偏差记录 | `docs/vibe-graph/traces/` |
| **SUMMARY** | 实施总结 | `archive/development/summaries/` |

已补录的追溯链路（6 条）：群聊 DAG 执行、PPT 内联浏览、富媒体产物卡片、Diff 应用到源产物、部署预览、AI 协作规范。

---

## 二、AI 工具与角色

### 2.1 使用的 AI 工具

| 工具 | 用途 | 使用场景 |
|------|------|---------|
| **Claude Code (CLI)** | 主力编码助手 | 需求分析、架构设计、代码实现、Bug 修复、文档整理 |
| **Codex (CLI)** | 辅助编码助手 | 部分模块并行开发、知识图谱维护、历史补录 |
| **Google ADK 2.0** | Agent 引擎 | 项目核心技术栈，驱动多 Agent 编排与执行 |

### 2.2 AI 承担的角色

| 角色 | 说明 |
|------|------|
| **后端 A** | 业务 API / 数据层 / Context Assembler / Artifact Service / CapabilityRegistry |
| **后端 B** | ADK 集成 / SSE Translator / Orchestrator 协议 / ExecutionTracer / Planner |
| **前端** | React 组件 / 状态管理 / SSE 客户端 / 产物卡片 / Mock 数据 |
| **文档整理** | README / 架构文档 / API 约定 / 知识图谱维护 |

### 2.3 协作规则

- **Spec-Driven**：永远先写 Spec 再写代码，禁止先实现后补文档
- **不自行扩展 scope**：严格按计划执行，不做"顺便优化"
- **类型检查零容忍**：每次改动后跑 `npx tsc -b --noEmit`，零错误才算完成
- **API 约定同步**：涉及新增接口/字段，必须在 `docs/AgentHub 响应格式与前后端对齐约定.md` 中记录
- **Plan-Summary 闭环**：每个功能模块都有 Plan 和 Summary，形成可追溯记录

---

## 三、协作产物索引

### 3.1 开发过程产物（79 份）

已归档至 `archive/development/`：

| 类别 | 数量 | 路径 |
|------|------|------|
| 日开发计划 | 32 份 | `archive/development/plans/` |
| 日完成总结 | 41 份 | `archive/development/summaries/` |
| 工作流模板 | 4 份 | `archive/development/vibe-coding-templates/` |

### 3.2 前端 Spec 与 Plan（60+ 份）

| 类别 | 路径 | 说明 |
|------|------|------|
| OpenSpec 规格 | `agenthub-web/openspec/` | Proposal + Design + Tasks + Spec |
| 功能 Spec | `agenthub-web/docs/specs/` | 按日期组织的需求规格 |
| 实施 Plan | `agenthub-web/docs/plans/` | Phase 1-9 + P0/P1/P2 计划 |
| 开发日志 | `agenthub-web/docs/开发日志.md` | 全流程问题记录与架构决策 |
| 功能清单 | `agenthub-web/docs/功能实现清单与测试方案.md` | 各模块完成状态 |

### 3.3 后端架构与联调（10+ 份）

| 文档 | 说明 |
|------|------|
| `docs/AgentHub-架构设计.md` | 后端架构建模 |
| `docs/AgentHub-架构设计前端.md` | 前端架构建模 |
| `docs/AgentHub-后端开发20天实施计划.md` | 后端 A/B 双线开发路线 |
| `docs/AgentHub 响应格式与前后端对齐约定.md` | 前后端接口契约（24 节） |
| `docs/AgentHub 前后端联调问题修复记录-2026-05-24.md` | 联调问题修复 |
| `docs/AgentHub 前后端联调问题根因分析.md` | 联调根因分析 |

### 3.4 AI 协作知识沉淀（20+ 份）

| 文档 | 说明 |
|------|------|
| `docs/ai-collab/README.md` | AI 协作约定入口 |
| `docs/ai-collab/api-conventions.md` | API 设计规范 |
| `docs/ai-collab/sse-protocol.md` | SSE 7 事件协议 |
| `docs/ai-collab/orchestration-flow.md` | 编排管线说明 |
| `docs/ai-collab/agent-adapter.md` | Adapter 模式说明 |
| `docs/ai-collab/frontend-conventions.md` | 前端组件/状态约定 |
| `docs/ai-collab/database-schema.md` | 数据库表结构 |
| `docs/ai-collab/glossary.md` | 项目术语表 |
| `docs/ai-collab/decisions/` | 13 份架构决策记录（ADR） |
| `docs/ai-collab/debug-*.md` | 调试指南（Agent 故障/Artifact/群聊等） |
| `docs/ai-collab/verify-local.md` | 本地验证操作手册 |

---

## 四、关键协作节点

| 阶段 | 时间 | 内容 | 关键文档 |
|------|------|------|---------|
| Phase 1-3 | 2026-05 | 基础设施 + 单聊 + 卡片 | `agenthub-web/docs/plans/phase-1/2/3-*.md` |
| Phase 4-6 | 2026-05 | 群聊 + Agent 管理 + @提及 | `agenthub-web/openspec/changes/phase4-agent-management/` |
| Phase 7-9 | 2026-05 | ReAct 面板 + 仪表盘 + 设置 | `agenthub-web/docs/plans/phase-7/8/9-*.md` |
| P0 核心体验 | 2026-05-26 | Markdown/滚底/时间戳/Toast/SSE | `agenthub-web/docs/specs/2026-05-26-p0-*.md` |
| P1 体验完整 | 2026-05-27~30 | 暗色模式/代码增强/响应式等 | `agenthub-web/docs/specs/2026-05-26-p1-*.md` |
| P2 差异化 | 2026-05-30~ | 群聊全链路/ReAct/工作台（6/8） | `agenthub-web/docs/specs/2026-05-26-p2-*.md` |
| UI 重构 | 2026-05-27 | Semi Design 全站迁移 | `agenthub-web/docs/specs/2026-05-27-design-token-refactor.md` |
| 联调对齐 | 2026-05-24~30 | 三轮 API 对齐 + 34 端点审计 | `docs/AgentHub 前后端联调问题修复记录-*.md` |
| 文档整理 | 2026-06-10 | 比赛提交文档整理归档 | `README.md`、本文档 |

---

## 五、统计数据

| 指标 | 数值 |
|------|------|
| 日开发计划 | 32 份 |
| 日完成总结 | 41 份 |
| 前端 Spec 文档 | 30+ 份 |
| 前端 Plan 文档 | 25+ 份 |
| 架构决策记录 (ADR) | 13 份 |
| 知识图谱追溯链路 | 6 条 |
| OpenSpec 变更提案 | 1 组（含 proposal + design + tasks + 2 specs） |
| Git Commits | 20+ |
| 前端测试用例 | 86 个 |
| 数据库迁移 | 10 个 |

---


## 六、仓库内快速导航

| 你想了解 | 看这里 |
|---------|--------|
| 项目整体介绍 | `README.md` |
| 技术架构 | `docs/AgentHub-架构设计.md` |
| 前端架构 | `docs/AgentHub-架构设计前端.md` |
| 协作流程规范 | 本文档（第一章） |
| 开发历程 | `agenthub-web/docs/开发日志.md` |
| OpenSpec 示例 | `agenthub-web/openspec/changes/phase4-agent-management/` |
| AI 协作约定 | `docs/ai-collab/README.md` |
| 知识图谱规则 | `docs/vibe-graph/README.md` |
| 历史计划/总结 | `archive/development/` |
| 架构决策 | `docs/ai-collab/decisions/` |
