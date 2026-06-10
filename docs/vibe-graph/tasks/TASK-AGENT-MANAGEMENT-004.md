---
id: TASK-AGENT-MANAGEMENT-004
type: task
title: ADK 模型解析和工具配置
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
  - TASK-AGENT-MANAGEMENT-003
relates_to: []
implements:
  - backend/app/services/adk/models.py
  - backend/app/services/adk/runner.py
  - backend/app/services/adk/coordinator_builder.py
  - backend/app/services/adk/tool_loader.py
  - backend/app/services/adapters/adk_to_sse.py
traces:
  - TRACE-AGENT-MANAGEMENT-001
blocked_by: []
acceptance:
  - AnthropicLlm 支持 Agent 级 api_key/base_url。
  - LiteLlm 接收 api_key/api_base。
  - Runner 和 coordinator_builder 透传配置。
  - ToolLoader 兼容字符串和对象工具配置。
  - ADK token 输出过滤 thought=True。
---

# ADK 模型解析和工具配置

## 目标

让 Agent 级模型配置和工具配置真正进入 ADK 执行链路。

## 前置条件

- Agent 记录包含 provider、model、api_key、base_url、tool_config。

## 预期触达路径

- `backend/app/services/adk/models.py`
- `backend/app/services/adk/runner.py`
- `backend/app/services/adk/coordinator_builder.py`
- `backend/app/services/adk/tool_loader.py`
- `backend/app/services/adapters/adk_to_sse.py`

## 执行步骤

1. 增加 ConfigurableAnthropicLlm。
2. resolve_agent_model 根据 provider 返回 AnthropicLlm 或 LiteLlm。
3. 运行链路透传 api_key/base_url。
4. ToolLoader 兼容旧字符串工具配置。
5. 过滤 thought=True token。

## 验收标准

- [ ] 自定义端点 Agent 可以被解析为对应 LLM。
- [ ] 旧 tool_config 不会崩溃。
- [ ] 思考内容不会泄露到用户回复。

## 实施记录

见 `TRACE-AGENT-MANAGEMENT-001`。

## Obsidian 双链

Related:

- [[SPEC-AGENT-MANAGEMENT-001]]
- [[PLAN-AGENT-MANAGEMENT-001]]
- [[TASK-AGENT-MANAGEMENT-003]]
- [[TRACE-AGENT-MANAGEMENT-001]]
