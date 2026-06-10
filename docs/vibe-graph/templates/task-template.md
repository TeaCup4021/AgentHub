---
id: TASK-{DOMAIN}-{TOPIC}-{NNN}
type: task
title: "{任务标题}"
status: todo
owner: "{Backend A | Backend B | Frontend | AI Collaboration | TBD}"
created: YYYY-MM-DD
updated: YYYY-MM-DD
plan: PLAN-{DOMAIN}-{TOPIC}-{NNN}
specs:
  - SPEC-{DOMAIN}-{TOPIC}-{NNN}
source_assets: []
depends_on: []
relates_to: []
implements: []
traces: []
blocked_by: []
acceptance:
  - "{任务级验收标准}"
---

# {任务标题}

## 目标

说明这个 task 要完成的最小可执行目标。

## 前置条件

- 依赖的 spec、plan、task、环境或用户确认。

## 预期触达路径

- `backend/...`
- `agenthub-web/src/...`
- `docs/...`

实际触达路径以实施后的 frontmatter `implements` 和 TRACE 为准。

## 执行步骤

1. 读取相关上下文。
2. 实施最小变更。
3. 更新必要测试或文档。
4. 记录实现路径和验证结果。

## 验收标准

- [ ] 与 frontmatter `acceptance` 保持一致。
- [ ] 能映射回父 plan 和相关 spec。

## 实施记录

实施后更新：

- `status`
- `implements`
- `traces`

## Obsidian 双链

Related:

- [[SPEC-{DOMAIN}-{TOPIC}-{NNN}]]
- [[PLAN-{DOMAIN}-{TOPIC}-{NNN}]]
- [[TRACE-{DOMAIN}-{TOPIC}-{NNN}]]

