---
id: TASK-CONVERSATION-MESSAGE-PIN-004
type: task
title: Pin/Unpin 和已固定列表
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-CONVERSATION-MESSAGE-PIN-001
specs:
  - SPEC-CONVERSATION-MESSAGE-PIN-001
source_assets:
  - archive/development/plans/AgentHub-后端A-Day05-PinSpec注入与流式联调.md
  - archive/development/summaries/Pin消息列表显示延迟修复-summary.md
depends_on:
  - TASK-CONVERSATION-MESSAGE-PIN-002
relates_to: []
implements:
  - backend/app/api/v1/conversations.py
  - agenthub-web/src/components/chat/PinManager.tsx
  - agenthub-web/src/components/chat/PinnedMessages.tsx
  - agenthub-web/src/components/layout/ChatArea.tsx
traces:
  - TRACE-CONVERSATION-MESSAGE-PIN-001
blocked_by: []
acceptance:
  - POST /conversations/{conv_id}/pins 可固定消息。
  - DELETE /conversations/{conv_id}/pins/{message_id} 可取消固定。
  - GET pins 可返回已固定消息列表。
  - 前端 PinManager/PinnedMessages 可展示和取消固定。
---

# Pin/Unpin 和已固定列表

## 目标

提供用户手动固定重要消息和查看已固定列表的能力。

## 前置条件

- 消息 API 可用。
- message_pins 表存在。

## 预期触达路径

- `backend/app/api/v1/conversations.py`
- `agenthub-web/src/components/chat/PinManager.tsx`
- `agenthub-web/src/components/chat/PinnedMessages.tsx`
- `agenthub-web/src/components/layout/ChatArea.tsx`

## 执行步骤

1. 复用既有 Pin/Unpin API。
2. 提供已固定列表。
3. 前端支持弹窗和管理入口。
4. Pin/Unpin 后更新 store 和 query。

## 验收标准

- [ ] Pin 后已固定列表可见。
- [ ] Unpin 后列表和消息视图同步更新。

## 实施记录

见 `TRACE-CONVERSATION-MESSAGE-PIN-001`。

## Obsidian 双链

Related:

- [[SPEC-CONVERSATION-MESSAGE-PIN-001]]
- [[PLAN-CONVERSATION-MESSAGE-PIN-001]]
- [[TASK-CONVERSATION-MESSAGE-PIN-002]]
- [[TRACE-CONVERSATION-MESSAGE-PIN-001]]
