---
id: TASK-AGENT-MANAGEMENT-002
type: task
title: 模型验证端点
status: implemented
owner: Backend B
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-AGENT-MANAGEMENT-001
specs:
  - SPEC-AGENT-MANAGEMENT-001
source_assets:
  - archive/development/plans/AgentHub-后端B-Day02-[ADK] Agent CRUD + 模型配置验证.md
depends_on:
  - TASK-AGENT-MANAGEMENT-001
relates_to: []
implements:
  - backend/app/services/agent.py
  - backend/app/api/v1/agents.py
traces:
  - TRACE-AGENT-MANAGEMENT-001
blocked_by: []
acceptance:
  - POST /agents/verify 存在。
  - 验证逻辑能通过 adapter 或 ADK fallback 测试 provider/model。
  - InMemorySessionService 创建 session 后再 run_async。
---

# 模型验证端点

## 目标

让用户在保存 Agent 前验证 provider 和 model 是否能被后端调用。

## 前置条件

- AgentService 可构造临时 Agent 或 ADK LlmAgent。
- provider 凭证可用。

## 预期触达路径

- `backend/app/services/agent.py`
- `backend/app/api/v1/agents.py`

## 执行步骤

1. 定义 AgentVerifyRequest。
2. 根据 provider 选择 adapter 或 ADK fallback。
3. 创建 session 并触发一条测试消息。
4. 收到非 user event 即视为通过。

## 验收标准

- [ ] Anthropic/LiteLLM 历史验证通过。
- [ ] 外部 provider 不可用时返回失败而非崩溃。

## 实施记录

见 `TRACE-AGENT-MANAGEMENT-001`。

## Obsidian 双链

Related:

- [[SPEC-AGENT-MANAGEMENT-001]]
- [[PLAN-AGENT-MANAGEMENT-001]]
- [[TASK-AGENT-MANAGEMENT-001]]
- [[TRACE-AGENT-MANAGEMENT-001]]
