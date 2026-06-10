---
id: SPEC-{DOMAIN}-{TOPIC}-{NNN}
type: spec
title: "{能力或需求标题}"
status: draft
owner: "{Backend A | Backend B | Frontend | AI Collaboration | TBD}"
created: YYYY-MM-DD
updated: YYYY-MM-DD
source_assets:
  - path/to/source-asset.md
depends_on: []
relates_to: []
plans: []
acceptance:
  - "{可验收标准 1}"
  - "{可验收标准 2}"
non_goals: []
contracts: []
---

# {能力或需求标题}

## 背景

说明该能力为什么存在，来自哪个用户需求、历史文档、缺陷或协作要求。

## 目标

- 明确本 spec 要稳定表达的能力、行为或契约。

## 范围

- 包含的功能边界。
- 涉及的角色、模块、接口、事件或数据结构。

## 非目标

- 本 spec 明确不解决的问题。
- 容易被误认为相关、但不属于本节点的内容。

## 输入

- 用户输入、API 请求、事件、配置或上游状态。

## 输出

- API 响应、SSE 事件、UI 状态、文件、产物或下游调用。

## 关键约束

- 必须遵守的项目约定、架构边界、数据格式或兼容性要求。

## 验收标准

- [ ] 与 frontmatter `acceptance` 保持一致。
- [ ] 每一项都能被 plan/task/trace 映射。

## 追溯

- Source assets: 见 frontmatter `source_assets`。
- Plans: 见 frontmatter `plans`。

## Obsidian 双链

Related:

- [[PLAN-{DOMAIN}-{TOPIC}-{NNN}]]
- [[TASK-{DOMAIN}-{TOPIC}-{NNN}]]
- [[TRACE-{DOMAIN}-{TOPIC}-{NNN}]]
