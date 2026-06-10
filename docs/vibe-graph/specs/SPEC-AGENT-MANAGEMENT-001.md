---
id: SPEC-AGENT-MANAGEMENT-001
type: spec
title: Agent 管理与模型配置
status: implemented
owner: Backend B
created: 2026-06-10
updated: 2026-06-10
source_assets:
  - archive/development/plans/AgentHub-后端B-Day02-[ADK] Agent CRUD + 模型配置验证.md
  - archive/development/summaries/AgentHub-后端B-Day02-[ADK] Agent CRUD + 模型配置验证.md
  - archive/development/summaries/AgentHub-2026-06-01-Agent创建流程全面改造.md
  - agenthub-web/docs/plans/phase-4-agent-management.md
  - agenthub-web/docs/specs/2026-05-26-phase8-agent-dashboard.md
depends_on: []
relates_to:
  - SPEC-GROUPCHAT-DAG-001
plans:
  - PLAN-AGENT-MANAGEMENT-001
acceptance:
  - 后端提供 Agent 列表、详情、创建、更新、删除和模型验证能力。
  - Agent Schema 使用 camelCase 序列化并支持 capabilities、toolConfig、apiKey、baseUrl。
  - 用户 Agent 与内置 Agent 有可区分的可见性和权限约束。
  - 前端支持创建、编辑、删除 Agent，并对齐后端工具配置格式。
  - Agent 级模型配置可传入 ADK/LiteLLM/Anthropic 运行链路。
non_goals:
  - 实现完整权限系统或真实多租户审计。
  - 对 API Key 做加密存储。
  - 定义群聊 DAG 执行行为。
contracts:
  - docs/AgentHub 响应格式与前后端对齐约定.md
---

# Agent 管理与模型配置

## 背景

AgentHub 需要允许用户管理 Agent 配置，包括名称、模型供应商、模型名、系统提示、能力标签、工具配置以及 Agent 级 API Key/Base URL。后端需要提供 CRUD 和模型连通性验证，前端需要提供创建和管理体验。

## 目标

- 提供 Agent CRUD API。
- 提供模型配置验证端点。
- 支持 Agent 级 API Key 和 Base URL。
- 支持内置 Agent 与用户 Agent 的可见性和权限区分。
- 前端创建/编辑表单支持自由模型名、自定义能力标签和工具配置。
- ToolLoader 兼容旧字符串数组和新对象数组格式。

## 范围

- 后端 Agent schema、service、API、model、migration。
- ADK model resolver、runner、coordinator_builder、tool_loader。
- 前端 Agent 类型、CreateAgentModal、AgentManageModal、Agent dashboard/设置入口。
- Mock 数据和设置页中废弃 LLM 配置移除。

## 非目标

- 不定义 Agent 执行过程中的 DAG 编排。
- 不定义 SSE agent_status 仪表盘全部细节。
- 不解决 API Key 加密存储。

## 输入

- Agent 创建或更新请求。
- provider、model、systemPrompt、capabilities、toolConfig。
- apiKey、baseUrl。
- 模型验证请求。

## 输出

- AgentResponse。
- 模型验证结果。
- 可被 ADK Runner 使用的 LLM 实例和工具列表。
- 前端 Agent 管理 UI 状态。

## 关键约束

- Schema 必须继承 BaseSchema，保持 camelCase 输出。
- 内置 Agent 全员可见但不可删改；用户 Agent 仅创建者可读写。
- CLI provider 不需要普通 LLM 的 apiKey/baseUrl 要求。
- 前端 `toolConfig` 提交为 `{ tools: [{ type: "builtin", name }] }`，读取时兼容旧格式。
- Agent 级凭证优先于环境变量。

## 验收标准

- [ ] Agent CRUD 端点可用。
- [ ] `/agents/verify` 能验证模型连通性。
- [ ] 前端创建和编辑 Agent 表单字段与后端 camelCase 对齐。
- [ ] ToolLoader 兼容旧/新工具配置格式。
- [ ] ADK 模型解析支持 Anthropic 和 LiteLLM 自定义凭证。

## 追溯

- Plan: `PLAN-AGENT-MANAGEMENT-001`
- Tasks: `TASK-AGENT-MANAGEMENT-001` 至 `TASK-AGENT-MANAGEMENT-006`
- Trace: `TRACE-AGENT-MANAGEMENT-001`

## Obsidian 双链

Related:

- [[PLAN-AGENT-MANAGEMENT-001]]
- [[TASK-AGENT-MANAGEMENT-001]]
- [[TASK-AGENT-MANAGEMENT-002]]
- [[TASK-AGENT-MANAGEMENT-003]]
- [[TASK-AGENT-MANAGEMENT-004]]
- [[TASK-AGENT-MANAGEMENT-005]]
- [[TASK-AGENT-MANAGEMENT-006]]
- [[TRACE-AGENT-MANAGEMENT-001]]
- [[SPEC-GROUPCHAT-DAG-001]]
