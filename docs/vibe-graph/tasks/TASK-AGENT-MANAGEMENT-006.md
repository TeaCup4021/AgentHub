---
id: TASK-AGENT-MANAGEMENT-006
type: task
title: 设置页和 Mock 数据对齐
status: implemented
owner: Frontend
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-AGENT-MANAGEMENT-001
specs:
  - SPEC-AGENT-MANAGEMENT-001
source_assets:
  - archive/development/summaries/AgentHub-2026-06-01-Agent创建流程全面改造.md
depends_on:
  - TASK-AGENT-MANAGEMENT-005
relates_to: []
implements:
  - agenthub-web/src/components/settings/SettingsPage.tsx
  - agenthub-web/src/components/settings/index.ts
  - agenthub-web/src/mocks/data.ts
traces:
  - TRACE-AGENT-MANAGEMENT-001
blocked_by: []
acceptance:
  - Settings 页移除未被后端消费的 LLM 配置。
  - Mock Agent 数据使用 camelCase apiKey/baseUrl。
  - 前端字段不再使用 base_url/api_key。
---

# 设置页和 Mock 数据对齐

## 目标

移除死 UI，并让 mock 数据与后端 Agent 级模型配置契约一致。

## 前置条件

- Agent 级 apiKey/baseUrl 已进入创建/编辑表单。

## 预期触达路径

- `agenthub-web/src/components/settings/SettingsPage.tsx`
- `agenthub-web/src/components/settings/index.ts`
- `agenthub-web/src/mocks/data.ts`

## 执行步骤

1. 移除 Settings 页 LLM 配置组件。
2. 更新 settings 导出。
3. 更新 mock 数据字段。

## 验收标准

- [ ] 没有独立于后端的 LLM localStorage 死配置入口。
- [ ] mock 数据字段与 API 一致。

## 实施记录

见 `TRACE-AGENT-MANAGEMENT-001`。

## Obsidian 双链

Related:

- [[SPEC-AGENT-MANAGEMENT-001]]
- [[PLAN-AGENT-MANAGEMENT-001]]
- [[TASK-AGENT-MANAGEMENT-005]]
- [[TRACE-AGENT-MANAGEMENT-001]]
