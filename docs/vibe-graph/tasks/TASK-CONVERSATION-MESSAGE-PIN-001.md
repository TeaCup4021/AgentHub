---
id: TASK-CONVERSATION-MESSAGE-PIN-001
type: task
title: 会话分页与 CRUD
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-CONVERSATION-MESSAGE-PIN-001
specs:
  - SPEC-CONVERSATION-MESSAGE-PIN-001
source_assets:
  - archive/development/plans/AgentHub-后端A-Day02-会话CRUD.md
  - archive/development/summaries/AgentHub-后端A-Day02-会话CRUD.md
depends_on: []
relates_to:
  - TASK-AGENT-MANAGEMENT-001
implements:
  - backend/app/schemas/base.py
  - backend/app/schemas/conversation.py
  - backend/app/services/conversation.py
  - backend/app/api/v1/conversations.py
  - backend/app/api/router.py
traces:
  - TRACE-CONVERSATION-MESSAGE-PIN-001
blocked_by: []
acceptance:
  - Page[T] 响应包含 list、total、page、pageSize。
  - ConversationCreate/Update/Response 包含 agentIds。
  - 会话列表支持分页、keyword、置顶优先和 last_active_at 倒序。
  - 创建/更新会话可维护 conversation_participants。
---

# 会话分页与 CRUD

## 目标

实现会话管理基础 API，为聊天和 Agent 绑定提供容器。

## 前置条件

- conversations 和 conversation_participants 表存在。
- Agent 管理基础链路存在。

## 预期触达路径

- `backend/app/schemas/base.py`
- `backend/app/schemas/conversation.py`
- `backend/app/services/conversation.py`
- `backend/app/api/v1/conversations.py`
- `backend/app/api/router.py`

## 执行步骤

1. 定义 Page 泛型。
2. 定义 conversation schema。
3. 实现 service CRUD。
4. 实现 API 路由。
5. 注册路由。

## 验收标准

- [ ] Swagger UI 暴露会话 CRUD。
- [ ] 返回 agentIds 和分页结构。

## 实施记录

见 `TRACE-CONVERSATION-MESSAGE-PIN-001`。

## Obsidian 双链

Related:

- [[SPEC-CONVERSATION-MESSAGE-PIN-001]]
- [[PLAN-CONVERSATION-MESSAGE-PIN-001]]
- [[TRACE-CONVERSATION-MESSAGE-PIN-001]]
