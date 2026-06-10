---
id: PLAN-CONVERSATION-MESSAGE-PIN-001
type: plan
title: 会话消息与 PinSpec 基础链路历史实施计划映射
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
specs:
  - SPEC-CONVERSATION-MESSAGE-PIN-001
source_assets:
  - archive/development/plans/AgentHub-后端A-Day02-会话CRUD.md
  - archive/development/summaries/AgentHub-后端A-Day02-会话CRUD.md
  - archive/development/summaries/AgentHub-后端A-Day3-消息 API.md
  - archive/development/plans/AgentHub-后端A-Day05-PinSpec注入与流式联调.md
  - archive/development/summaries/AgentHub-后端A-Day05-PinSpec注入与流式联调.md
depends_on:
  - PLAN-AGENT-MANAGEMENT-001
relates_to:
  - PLAN-GROUPCHAT-DAG-001
tasks:
  - TASK-CONVERSATION-MESSAGE-PIN-001
  - TASK-CONVERSATION-MESSAGE-PIN-002
  - TASK-CONVERSATION-MESSAGE-PIN-003
  - TASK-CONVERSATION-MESSAGE-PIN-004
  - TASK-CONVERSATION-MESSAGE-PIN-005
  - TASK-CONVERSATION-MESSAGE-PIN-006
review:
  required: true
  confirmed_by: historical-summary
  confirmed_at: 2026-06-05
risks:
  - 认证仍有 mock user id 的历史遗留，真实 JWT 接入后需要复核。
  - PinSpec 注入效果需要真实 DB pinned 数据和端到端流式联调。
  - conversations.py 当前承载大量流式逻辑，后续维护需拆分边界。
verification:
  - command: Swagger UI and manual CRUD
    result: passed
    notes: 会话 CRUD summary 记录 Swagger 暴露正常。
  - command: message API manual checks
    result: passed
    notes: 消息 API summary 记录创建、查询、游标和权限校验清单。
  - command: syntax compile for PinSpec changes
    result: passed
    notes: PinSpec summary 记录语法编译通过。
  - command: npx tsc -b
    result: passed
    notes: Pin 状态修复 summary 记录通过。
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 本次补录后运行。
---

# 会话消息与 PinSpec 基础链路历史实施计划映射

## 来源 Spec

- `SPEC-CONVERSATION-MESSAGE-PIN-001`: 会话 CRUD、消息历史、Pin 和 PinSpec 注入基础链路。

## 实施目标

把聊天基础能力从历史 Day02/Day03/Day05 计划与后续 Pin 状态修复中提炼为一条可追溯图谱。

## 实施范围

- `backend/app/schemas/base.py`
- `backend/app/schemas/conversation.py`
- `backend/app/services/conversation.py`
- `backend/app/api/v1/conversations.py`
- `backend/app/schemas/message.py`
- `backend/app/services/message.py`
- `backend/app/api/v1/messages.py`
- `backend/app/services/pin_spec_injector.py`
- `backend/app/services/adk/runner.py`
- 前端 Pin 相关组件和 store。

## 方案

1. 建立 Page 泛型和会话 DTO。
2. 实现会话 CRUD、分页、搜索、置顶排序和 agentIds 关联。
3. 实现消息创建和游标分页，批量解析 senderName/artifacts/isPinned。
4. 实现 Pin/Unpin 和 pinned 列表。
5. 在 ADK 执行前注入 pinned 消息上下文。
6. 修复前端 Pin 状态多视图一致性。

## Task 拆分

| Task ID | 标题 | 预期触达路径 | 验收点 |
| --- | --- | --- | --- |
| `TASK-CONVERSATION-MESSAGE-PIN-001` | 会话分页与 CRUD | `schemas/base.py`, `conversation.py`, `api/v1/conversations.py` | Page、CRUD、agentIds。 |
| `TASK-CONVERSATION-MESSAGE-PIN-002` | 消息创建与游标分页 | `schemas/message.py`, `services/message.py`, `api/v1/messages.py` | POST/GET messages。 |
| `TASK-CONVERSATION-MESSAGE-PIN-003` | 消息内联 artifacts 与 senderName | `services/message.py` | 批量 artifact、senderName、isPinned。 |
| `TASK-CONVERSATION-MESSAGE-PIN-004` | Pin/Unpin 和已固定列表 | `api/v1/conversations.py`, 前端 Pin 组件 | pins API 和列表。 |
| `TASK-CONVERSATION-MESSAGE-PIN-005` | PinSpec 注入流式链路 | `pin_spec_injector.py`, `adk/runner.py` | before_agent_callback 接线。 |
| `TASK-CONVERSATION-MESSAGE-PIN-006` | 前端 Pin 状态一致性 | `PinnedMessages.tsx`, `MessageList.tsx`, `MessageActions.tsx`, `ChatArea.tsx` | store 单一数据源和 query 失效。 |

## 契约与兼容性

- 后端响应继续走 `{ code, data, message }` 包装。
- 消息游标使用 ISO 8601 datetime。
- PinSpec 注入不新增 REST 字段，不改变 SSE 事件。

## 风险

- 当前 conversations.py 中 pin、stream、artifact 路由混杂，后续可能需要模块拆分。
- PinSpec 注入真实效果依赖 ADK callback 对象和 state_delta 稳定。
- 前端 store 与 query 的职责需要持续遵守单一数据源原则。

## 验证计划

- [ ] 会话 CRUD 手动验证。
- [ ] 消息 POST/GET 游标分页验证。
- [ ] Pin/Unpin 多入口验证。
- [ ] PinSpec 端到端流式联调。
- [ ] Vibe Graph 校验。

## Review

该节点为历史补录，review 信息来自 Day02、Day03、Day05 summary 和 Pin 状态 ADR。

## Obsidian 双链

Related:

- [[SPEC-CONVERSATION-MESSAGE-PIN-001]]
- [[TASK-CONVERSATION-MESSAGE-PIN-001]]
- [[TASK-CONVERSATION-MESSAGE-PIN-002]]
- [[TASK-CONVERSATION-MESSAGE-PIN-003]]
- [[TASK-CONVERSATION-MESSAGE-PIN-004]]
- [[TASK-CONVERSATION-MESSAGE-PIN-005]]
- [[TASK-CONVERSATION-MESSAGE-PIN-006]]
- [[TRACE-CONVERSATION-MESSAGE-PIN-001]]
