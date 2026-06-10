---
id: TASK-AGENT-MANAGEMENT-005
type: task
title: 前端创建和管理 UI
status: implemented
owner: Frontend
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-AGENT-MANAGEMENT-001
specs:
  - SPEC-AGENT-MANAGEMENT-001
source_assets:
  - agenthub-web/docs/plans/phase-4-agent-management.md
  - archive/development/summaries/AgentHub-2026-06-01-Agent创建流程全面改造.md
depends_on:
  - TASK-AGENT-MANAGEMENT-001
  - TASK-AGENT-MANAGEMENT-003
relates_to: []
implements:
  - agenthub-web/src/types/agent.ts
  - agenthub-web/src/components/agent/CreateAgentModal.tsx
  - agenthub-web/src/components/agent/AgentManageModal.tsx
  - agenthub-web/src/components/agent/index.ts
  - agenthub-web/src/hooks/useAgents.ts
  - agenthub-web/src/lib/api.ts
traces:
  - TRACE-AGENT-MANAGEMENT-001
blocked_by: []
acceptance:
  - 创建/编辑表单支持 name、provider、model、baseUrl、apiKey、systemPrompt、capabilities、tools。
  - 模型名和能力标签可自由输入。
  - 工具提交为对象数组格式。
  - 回填兼容旧字符串数组工具格式。
---

# 前端创建和管理 UI

## 目标

提供用户可用的 Agent 创建、编辑和管理体验，并与后端字段契约对齐。

## 前置条件

- Agent CRUD API 可用。
- 前端 hooks 和 API client 支持 Agent 接口。

## 预期触达路径

- `agenthub-web/src/types/agent.ts`
- `agenthub-web/src/components/agent/CreateAgentModal.tsx`
- `agenthub-web/src/components/agent/AgentManageModal.tsx`
- `agenthub-web/src/components/agent/index.ts`
- `agenthub-web/src/hooks/useAgents.ts`
- `agenthub-web/src/lib/api.ts`

## 执行步骤

1. 定义前端 Agent 类型。
2. 实现创建/编辑 Modal。
3. 实现 AgentManageModal。
4. 对齐 apiKey/baseUrl camelCase 字段。
5. 对齐后端 builtin 工具列表。

## 验收标准

- [ ] 用户能创建、编辑、删除 Agent。
- [ ] 工具和能力配置能回填。
- [ ] 字段名与后端响应一致。

## 实施记录

见 `TRACE-AGENT-MANAGEMENT-001`。

## Obsidian 双链

Related:

- [[SPEC-AGENT-MANAGEMENT-001]]
- [[PLAN-AGENT-MANAGEMENT-001]]
- [[TASK-AGENT-MANAGEMENT-001]]
- [[TASK-AGENT-MANAGEMENT-003]]
- [[TRACE-AGENT-MANAGEMENT-001]]
