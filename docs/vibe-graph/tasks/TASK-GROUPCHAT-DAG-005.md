---
id: TASK-GROUPCHAT-DAG-005
type: task
title: 前端 SSE 事件归属
status: implemented
owner: Frontend
created: 2026-06-09
updated: 2026-06-09
plan: PLAN-GROUPCHAT-DAG-001
specs:
  - SPEC-GROUPCHAT-DAG-001
source_assets:
  - vibeCodingSummary/群聊DAG执行与Orchestrator总结重构-summary.md
depends_on:
  - TASK-GROUPCHAT-DAG-003
relates_to: []
implements:
  - agenthub-web/src/components/layout/ChatArea.tsx
traces:
  - TRACE-GROUPCHAT-DAG-001
blocked_by: []
acceptance:
  - token、artifact、thinking、message_end 优先使用事件 message_id。
  - 多 Agent 交错流式时不再全部 append 到最后一条消息。
---

# 前端 SSE 事件归属

## 目标

修复前端回调用全局当前消息 ref，导致一条 SSE 连接上的多 Agent 事件被归入同一条消息的问题。

## 前置条件

- 后端 SSE 事件携带每个 Agent 独立 `message_id`。

## 预期触达路径

- `agenthub-web/src/components/layout/ChatArea.tsx`

## 执行步骤

1. `onToken` 使用 `data.message_id` 定位消息。
2. `onArtifact` 使用 `data.message_id` 定位消息。
3. `onThinking` 使用 `data.message_id` 定位消息。
4. `onMessageEnd` 使用 `data.message_id` 完成对应消息。
5. 保留 fallback 到 runtime messageId，兼容非 DAG 场景。

## 验收标准

- [ ] 并行 Agent 流式输出各自累积到自己的消息。
- [ ] message_end usage 归属到正确 Agent。

## 实施记录

见 `TRACE-GROUPCHAT-DAG-001`。

## Obsidian 双链

Related:

- [[SPEC-GROUPCHAT-DAG-001]]
- [[PLAN-GROUPCHAT-DAG-001]]
- [[TASK-GROUPCHAT-DAG-003]]
- [[TRACE-GROUPCHAT-DAG-001]]
