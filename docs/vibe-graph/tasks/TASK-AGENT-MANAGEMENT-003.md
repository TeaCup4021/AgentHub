---
id: TASK-AGENT-MANAGEMENT-003
type: task
title: Agent 级凭证和用户隔离
status: implemented
owner: Backend B
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-AGENT-MANAGEMENT-001
specs:
  - SPEC-AGENT-MANAGEMENT-001
source_assets:
  - archive/development/summaries/AgentHub-2026-06-01-Agent创建流程全面改造.md
depends_on:
  - TASK-AGENT-MANAGEMENT-001
relates_to: []
implements:
  - backend/app/models/agent.py
  - backend/alembic/versions/7e319cd8e98b_add_api_key_and_base_url_to_agents.py
  - backend/app/schemas/agent.py
  - backend/app/services/agent.py
  - backend/app/api/v1/agents.py
traces:
  - TRACE-AGENT-MANAGEMENT-001
blocked_by: []
acceptance:
  - agents 表包含 api_key 和 base_url。
  - AgentCreate 中 apiKey/baseUrl 对普通 provider 必填。
  - 内置 Agent 全员可见但不可删改。
  - 用户 Agent 仅创建者可读写。
---

# Agent 级凭证和用户隔离

## 目标

让每个 Agent 拥有独立模型端点和凭证，并避免用户看到或修改他人 Agent。

## 前置条件

- Agent CRUD 已存在。
- 当前用户 id 可从 API 依赖中获得。

## 预期触达路径

- `backend/app/models/agent.py`
- `backend/alembic/versions/7e319cd8e98b_add_api_key_and_base_url_to_agents.py`
- `backend/app/schemas/agent.py`
- `backend/app/services/agent.py`
- `backend/app/api/v1/agents.py`

## 执行步骤

1. 增加 api_key 和 base_url 字段。
2. 更新 schema 必填/可选策略。
3. 查询时过滤内置和当前用户 Agent。
4. 更新和删除时做权限校验。

## 验收标准

- [ ] 他人 Agent 不可读写。
- [ ] 内置 Agent 不可删改。
- [ ] Agent 级凭证优先于环境变量。

## 实施记录

见 `TRACE-AGENT-MANAGEMENT-001`。

## Obsidian 双链

Related:

- [[SPEC-AGENT-MANAGEMENT-001]]
- [[PLAN-AGENT-MANAGEMENT-001]]
- [[TASK-AGENT-MANAGEMENT-001]]
- [[TRACE-AGENT-MANAGEMENT-001]]
