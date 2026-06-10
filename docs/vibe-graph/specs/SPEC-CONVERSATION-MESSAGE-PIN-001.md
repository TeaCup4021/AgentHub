---
id: SPEC-CONVERSATION-MESSAGE-PIN-001
type: spec
title: 会话消息与 PinSpec 基础链路
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
source_assets:
  - archive/development/plans/AgentHub-后端A-Day02-会话CRUD.md
  - archive/development/summaries/AgentHub-后端A-Day02-会话CRUD.md
  - archive/development/summaries/AgentHub-后端A-Day3-消息 API.md
  - archive/development/plans/AgentHub-后端A-Day05-PinSpec注入与流式联调.md
  - archive/development/summaries/AgentHub-后端A-Day05-PinSpec注入与流式联调.md
  - docs/ai-collab/decisions/frontend-state/2026-06-05-pin-state-single-source.md
depends_on:
  - SPEC-AGENT-MANAGEMENT-001
relates_to:
  - SPEC-GROUPCHAT-DAG-001
  - SPEC-ARTIFACT-EDIT-WRITEBACK-001
plans:
  - PLAN-CONVERSATION-MESSAGE-PIN-001
acceptance:
  - 会话支持创建、列表分页、更新、删除和 agentIds 关联。
  - 消息支持创建、游标分页查询、mentions、senderName 和内联 artifacts。
  - 消息查询能批量解析 senderName、artifacts 和 isPinned。
  - Pin/Unpin API 和已固定列表可用。
  - PinSpec 注入在 Agent 执行前读取 pinned 消息并拼接上下文。
  - 前端 Pin 状态以 store 为即时单一数据源，并失效 pins/messages 查询。
non_goals:
  - 定义完整认证授权系统。
  - 定义群聊 DAG 执行细节。
  - 定义产物卡片编辑能力。
contracts:
  - docs/AgentHub 响应格式与前后端对齐约定.md
---

# 会话消息与 PinSpec 基础链路

## 背景

会话、消息和 Pin 是 AgentHub 聊天体验的基础。会话负责组织 Agent 和用户上下文，消息负责历史展示、游标分页、mentions 和 artifact 内联，Pin 则把用户选择的重要消息提升为后续 Agent 执行前的上下文注入来源。

## 目标

- 提供会话 CRUD 和分页列表。
- 提供消息创建和游标分页历史查询。
- 在消息响应中包含 senderName、artifacts 和 isPinned。
- 提供 Pin/Unpin 和已固定列表。
- 将 pinned 消息注入单聊流式执行上下文。
- 保证前端 Pin 多视图状态一致。

## 范围

- 后端 conversation schema/service/API。
- 后端 message schema/service/API。
- 后端 pin API、MessagePin 查询和 pin_spec_injector。
- ADK runner 中 before_agent_callback 接线。
- 前端 ChatArea、MessageList、PinnedMessages、PinManager、MessageActions 和 chatStore。

## 非目标

- 不实现完整 JWT 权限体系。
- 不定义 Orchestrator DAG 执行。
- 不定义 artifact 卡片内部渲染。

## 输入

- 会话创建、更新、删除请求。
- 消息创建请求，包含 content、mentions、parentMessageId。
- Pin/Unpin 请求。
- 流式执行中的 conversation_id。

## 输出

- ConversationResponse 和分页 Page。
- MessageListResponse。
- 已固定消息列表。
- Agent 执行前注入的 pinned/spec 文本。
- 前端同步的 pin 状态视图。

## 关键约束

- 会话列表使用 Page 响应结构。
- 消息历史使用游标分页，避免实时追加导致页码偏移。
- artifacts 和 senderName 必须批量查询，避免 N+1。
- Pin 状态指示以 Zustand store 为单一即时数据源。
- PinSpec 注入不改变 SSE 事件结构。

## 验收标准

- [ ] 会话 CRUD 可用，列表置顶优先且 last_active_at 倒序。
- [ ] 消息创建和游标分页可用。
- [ ] 消息响应包含 senderName、artifacts 和 isPinned。
- [ ] Pin 多入口状态同步。
- [ ] before_agent_callback 能读取 pinned 消息并注入。

## 追溯

- Plan: `PLAN-CONVERSATION-MESSAGE-PIN-001`
- Tasks: `TASK-CONVERSATION-MESSAGE-PIN-001` 至 `TASK-CONVERSATION-MESSAGE-PIN-006`
- Trace: `TRACE-CONVERSATION-MESSAGE-PIN-001`

## Obsidian 双链

Related:

- [[PLAN-CONVERSATION-MESSAGE-PIN-001]]
- [[TASK-CONVERSATION-MESSAGE-PIN-001]]
- [[TASK-CONVERSATION-MESSAGE-PIN-002]]
- [[TASK-CONVERSATION-MESSAGE-PIN-003]]
- [[TASK-CONVERSATION-MESSAGE-PIN-004]]
- [[TASK-CONVERSATION-MESSAGE-PIN-005]]
- [[TASK-CONVERSATION-MESSAGE-PIN-006]]
- [[TRACE-CONVERSATION-MESSAGE-PIN-001]]
- [[SPEC-AGENT-MANAGEMENT-001]]
- [[SPEC-GROUPCHAT-DAG-001]]
