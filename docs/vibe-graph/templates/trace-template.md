---
id: TRACE-{DOMAIN}-{TOPIC}-{NNN}
type: trace
title: "{实施追踪标题}"
status: draft
owner: "{Backend A | Backend B | Frontend | AI Collaboration | TBD}"
created: YYYY-MM-DD
updated: YYYY-MM-DD
tasks:
  - TASK-{DOMAIN}-{TOPIC}-{NNN}
source_assets: []
depends_on: []
relates_to: []
implements:
  - path/to/changed-file
summaries:
  - vibeCodingSummary/path-to-summary.md
verification:
  - command: "{验证命令}"
    result: not_run
    notes: "{验证结果或未运行原因}"
deviations: []
followups: []
---

# {实施追踪标题}

## 对应任务

- `TASK-{DOMAIN}-{TOPIC}-{NNN}`

## 实际触达路径

- 与 frontmatter `implements` 保持一致。

## 实施摘要

说明实际完成了什么，不复制长篇 summary。

## 验证结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `{验证命令}` | `not_run` | `{验证结果或未运行原因}` |

## 与计划的偏差

如实际实现与 plan 不一致，在此说明：

| 计划项 | 实际实现 | 原因 |
| --- | --- | --- |
| 无 | 无 | 无 |

## 后续事项

- 未完成项。
- 需要用户确认的事项。
- 建议后续 task。

## Summary 链接

- 见 frontmatter `summaries`。

## Obsidian 双链

Related:

- [[SPEC-{DOMAIN}-{TOPIC}-{NNN}]]
- [[PLAN-{DOMAIN}-{TOPIC}-{NNN}]]
- [[TASK-{DOMAIN}-{TOPIC}-{NNN}]]
