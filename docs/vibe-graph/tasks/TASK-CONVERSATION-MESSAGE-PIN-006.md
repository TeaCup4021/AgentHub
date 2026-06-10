---
id: TASK-CONVERSATION-MESSAGE-PIN-006
type: task
title: 前端 Pin 状态一致性
status: verified
owner: Frontend
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-CONVERSATION-MESSAGE-PIN-001
specs:
  - SPEC-CONVERSATION-MESSAGE-PIN-001
source_assets:
  - archive/development/summaries/Pin消息列表显示延迟修复-summary.md
  - docs/ai-collab/decisions/frontend-state/2026-06-05-pin-state-single-source.md
depends_on:
  - TASK-CONVERSATION-MESSAGE-PIN-004
relates_to: []
implements:
  - agenthub-web/src/components/chat/PinnedMessages.tsx
  - agenthub-web/src/components/chat/MessageList.tsx
  - agenthub-web/src/components/chat/MessageActions.tsx
  - agenthub-web/src/components/layout/ChatArea.tsx
  - agenthub-web/src/stores/chatStore.ts
traces:
  - TRACE-CONVERSATION-MESSAGE-PIN-001
blocked_by: []
acceptance:
  - Pin 状态指示以 store pinnedMessageIds 为单一即时数据源。
  - Pin/Unpin 后同时失效 pins 和 messages query。
  - PinnedMessages refetch 时不渲染陈旧部分列表。
  - 右键菜单可 Pin 用户消息。
---

# 前端 Pin 状态一致性

## 目标

消除 Pin 状态在计数、弹窗列表、角标、边框和菜单之间不同步的问题。

## 前置条件

- 后端 Pin API 正常同步落库。
- 前端使用 Zustand store 和 React Query。

## 预期触达路径

- `agenthub-web/src/components/chat/PinnedMessages.tsx`
- `agenthub-web/src/components/chat/MessageList.tsx`
- `agenthub-web/src/components/chat/MessageActions.tsx`
- `agenthub-web/src/components/layout/ChatArea.tsx`
- `agenthub-web/src/stores/chatStore.ts`

## 执行步骤

1. 纯状态指示改用 store。
2. 写操作后失效 pins 和 messages。
3. PinnedMessages refetchOnMount always。
4. spinner 使用 isFetching 兜底。
5. 右键菜单支持用户消息 Pin。

## 验收标准

- [ ] 连续 Pin 多条后弹窗即时显示全部。
- [ ] 弹窗内 Unpin 后角标、边框、计数同步。
- [ ] 悬浮按钮和右键菜单入口行为一致。

## 实施记录

见 `TRACE-CONVERSATION-MESSAGE-PIN-001`。

## Obsidian 双链

Related:

- [[SPEC-CONVERSATION-MESSAGE-PIN-001]]
- [[PLAN-CONVERSATION-MESSAGE-PIN-001]]
- [[TASK-CONVERSATION-MESSAGE-PIN-004]]
- [[TRACE-CONVERSATION-MESSAGE-PIN-001]]
