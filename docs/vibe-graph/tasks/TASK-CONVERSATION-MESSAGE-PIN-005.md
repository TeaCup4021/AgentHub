---
id: TASK-CONVERSATION-MESSAGE-PIN-005
type: task
title: PinSpec 注入流式链路
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-CONVERSATION-MESSAGE-PIN-001
specs:
  - SPEC-CONVERSATION-MESSAGE-PIN-001
source_assets:
  - archive/development/plans/AgentHub-后端A-Day05-PinSpec注入与流式联调.md
  - archive/development/summaries/AgentHub-后端A-Day05-PinSpec注入与流式联调.md
depends_on:
  - TASK-CONVERSATION-MESSAGE-PIN-004
relates_to:
  - TASK-GROUPCHAT-DAG-001
implements:
  - backend/app/services/pin_spec_injector.py
  - backend/app/services/adk/runner.py
traces:
  - TRACE-CONVERSATION-MESSAGE-PIN-001
blocked_by: []
acceptance:
  - before_agent_callback 从 state 获取 conversation_id。
  - 读取 pinned 消息并组装注入文本。
  - runner 将 callback 接入单聊 Agent。
  - state_delta 携带 conversation_id。
  - 不改变 SSE 事件结构。
---

# PinSpec 注入流式链路

## 目标

在 Agent 执行前把 pinned 消息作为上下文注入，让用户固定的信息参与后续回答。

## 前置条件

- Pin/Unpin 数据已落库。
- ADK runner 支持 before_agent_callback。

## 预期触达路径

- `backend/app/services/pin_spec_injector.py`
- `backend/app/services/adk/runner.py`

## 执行步骤

1. 实现 `_load_pinned_messages`。
2. 实现 `_build_injection_text`。
3. 实现 `before_agent_callback`。
4. 在 build_single_chat_agent 中接入 callback。
5. 在 run_async 中传递 conversation_id。

## 验收标准

- [ ] 历史 summary 记录语法编译通过。
- [ ] 真实 pinned 数据注入效果仍待端到端联调。

## 实施记录

见 `TRACE-CONVERSATION-MESSAGE-PIN-001`。

## Obsidian 双链

Related:

- [[SPEC-CONVERSATION-MESSAGE-PIN-001]]
- [[PLAN-CONVERSATION-MESSAGE-PIN-001]]
- [[TASK-CONVERSATION-MESSAGE-PIN-004]]
- [[TRACE-CONVERSATION-MESSAGE-PIN-001]]
