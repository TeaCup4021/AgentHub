---
id: PLAN-{DOMAIN}-{TOPIC}-{NNN}
type: plan
title: "{实施计划标题}"
status: draft
owner: "{Backend A | Backend B | Frontend | AI Collaboration | TBD}"
created: YYYY-MM-DD
updated: YYYY-MM-DD
specs:
  - SPEC-{DOMAIN}-{TOPIC}-{NNN}
source_assets:
  - path/to/source-asset.md
depends_on: []
relates_to: []
tasks: []
review:
  required: true
  confirmed_by: null
  confirmed_at: null
risks: []
verification: []
---

# {实施计划标题}

## 来源 Spec

- `SPEC-{DOMAIN}-{TOPIC}-{NNN}`: 说明本 plan 覆盖的 spec 范围。

## 实施目标

一句话描述本次计划要达成的结果。

## 实施范围

- 涉及的后端模块、前端模块、接口、数据结构或文档。
- 不在本次计划内的内容。

## 方案

1. 关键步骤一。
2. 关键步骤二。
3. 关键步骤三。

## Task 拆分

| Task ID | 标题 | 预期触达路径 | 验收点 |
| --- | --- | --- | --- |
| `TASK-{DOMAIN}-{TOPIC}-001` | 待拆分 | `backend/...` 或 `agenthub-web/src/...` | 待填写 |

## 契约与兼容性

- 是否涉及 API 响应 `{ code, data, message }`。
- 是否涉及 snake_case 存储与 camelCase 序列化。
- 是否涉及分页、日期格式、SSE 事件或前后端对齐文档。

## 风险

- 技术风险。
- 依赖风险。
- 与既有文档或实现可能冲突的地方。

## 验证计划

- [ ] 导入检查、单元测试、接口测试、前端测试或手动验证。
- [ ] 未能自动验证时，需要在 trace 中说明原因。

## Review

新功能默认需要用户确认。用户确认前，不进入业务代码实现阶段。

## Obsidian 双链

Related:

- [[SPEC-{DOMAIN}-{TOPIC}-{NNN}]]
- [[TASK-{DOMAIN}-{TOPIC}-001]]
- [[TRACE-{DOMAIN}-{TOPIC}-{NNN}]]

