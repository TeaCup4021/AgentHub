---
id: PLAN-AGENT-MANAGEMENT-001
type: plan
title: Agent 管理与模型配置历史实施计划映射
status: implemented
owner: Backend B
created: 2026-06-10
updated: 2026-06-10
specs:
  - SPEC-AGENT-MANAGEMENT-001
source_assets:
  - archive/development/plans/AgentHub-后端B-Day02-[ADK] Agent CRUD + 模型配置验证.md
  - archive/development/summaries/AgentHub-后端B-Day02-[ADK] Agent CRUD + 模型配置验证.md
  - archive/development/summaries/AgentHub-2026-06-01-Agent创建流程全面改造.md
depends_on: []
relates_to:
  - PLAN-GROUPCHAT-DAG-001
tasks:
  - TASK-AGENT-MANAGEMENT-001
  - TASK-AGENT-MANAGEMENT-002
  - TASK-AGENT-MANAGEMENT-003
  - TASK-AGENT-MANAGEMENT-004
  - TASK-AGENT-MANAGEMENT-005
  - TASK-AGENT-MANAGEMENT-006
review:
  required: true
  confirmed_by: historical-summary
  confirmed_at: 2026-06-01
risks:
  - API Key 明文返回和存储存在安全风险，历史实现未做脱敏。
  - Agent CRUD 的真实权限依赖 get_current_user_id 后续替换为 JWT。
  - 当前模型验证可能因外部 provider key 或网络环境失败。
verification:
  - command: Import OK
    result: passed
    notes: 历史 summary 记录核心 Python 导入检查通过。
  - command: manual API verification
    result: passed
    notes: 历史 plan 记录 CRUD 和 verify 端点已验证。
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 本次补录后运行。
---

# Agent 管理与模型配置历史实施计划映射

## 来源 Spec

- `SPEC-AGENT-MANAGEMENT-001`: Agent CRUD、模型验证、Agent 级模型配置和前端管理体验。

## 实施目标

把 Agent 管理后端能力和 2026-06-01 前端/配置全面改造合并补录为一条可追溯图谱链路。

## 实施范围

- 后端 Agent schema/service/API/model/migration。
- ADK 模型解析、runner、coordinator builder、tool loader。
- 前端 Agent 类型、创建/编辑表单、管理弹窗、设置页调整。

## 方案

1. 建立 Agent CRUD schema、service 和 API。
2. 提供模型连通性验证。
3. 增加 Agent 级 apiKey/baseUrl 和用户隔离。
4. 扩展 ADK 模型解析和工具加载。
5. 重构前端创建/管理表单。
6. 对齐 camelCase 字段和工具配置格式。

## Task 拆分

| Task ID | 标题 | 预期触达路径 | 验收点 |
| --- | --- | --- | --- |
| `TASK-AGENT-MANAGEMENT-001` | 后端 Agent Schema 与 CRUD API | `schemas/agent.py`, `services/agent.py`, `api/v1/agents.py` | CRUD 端点可用。 |
| `TASK-AGENT-MANAGEMENT-002` | 模型验证端点 | `services/agent.py`, `api/v1/agents.py` | `/verify` 可测试 provider/model。 |
| `TASK-AGENT-MANAGEMENT-003` | Agent 级凭证和用户隔离 | `models/agent.py`, migration, `services/agent.py` | apiKey/baseUrl 和 created_by 权限。 |
| `TASK-AGENT-MANAGEMENT-004` | ADK 模型解析和工具配置 | `adk/models.py`, `runner.py`, `coordinator_builder.py`, `tool_loader.py` | 凭证透传和工具格式兼容。 |
| `TASK-AGENT-MANAGEMENT-005` | 前端创建和管理 UI | `CreateAgentModal.tsx`, `AgentManageModal.tsx`, `types/agent.ts` | 自由模型名、能力标签、工具配置。 |
| `TASK-AGENT-MANAGEMENT-006` | 设置页和 Mock 数据对齐 | settings, mocks | 移除死 LLM 配置并对齐 camelCase。 |

## 契约与兼容性

- 后端仍使用统一响应包装中间件。
- Python 侧 snake_case，API 输出 camelCase。
- ToolLoader 兼容旧字符串工具配置，避免旧数据失效。

## 风险

- API Key 明文暴露需要后续安全加固。
- 内置 Agent 与用户 Agent 权限需要真实认证接入后复核。
- 模型验证依赖外部 provider。

## 验证计划

- [ ] CRUD 手动 API 验证。
- [ ] `/agents/verify` provider/model 验证。
- [ ] 前端创建/编辑表单类型检查。
- [ ] Vibe Graph 校验。

## Review

该节点为历史补录，review 信息来自历史 plan 和 summary。

## Obsidian 双链

Related:

- [[SPEC-AGENT-MANAGEMENT-001]]
- [[TASK-AGENT-MANAGEMENT-001]]
- [[TASK-AGENT-MANAGEMENT-002]]
- [[TASK-AGENT-MANAGEMENT-003]]
- [[TASK-AGENT-MANAGEMENT-004]]
- [[TASK-AGENT-MANAGEMENT-005]]
- [[TASK-AGENT-MANAGEMENT-006]]
- [[TRACE-AGENT-MANAGEMENT-001]]
