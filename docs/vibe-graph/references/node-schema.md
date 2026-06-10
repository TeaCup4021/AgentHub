# Vibe Graph 节点 Schema

本文档是 `docs/vibe-graph/rules.md` 的精简 schema 参考。完整规则以 `rules.md` 为准。

## 通用字段

所有节点必须使用 YAML frontmatter。

```yaml
---
id: SPEC-DOMAIN-TOPIC-001
type: spec
title: 节点标题
status: draft
owner: TBD
created: YYYY-MM-DD
updated: YYYY-MM-DD
source_assets: []
depends_on: []
relates_to: []
---
```

必填字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定 ID，格式 `{TYPE}-{DOMAIN}-{TOPIC}-{NNN}`。 |
| `type` | `spec`、`plan`、`task`、`trace`。 |
| `title` | 人类可读标题。 |
| `status` | 节点状态。 |
| `created` | 创建日期，`YYYY-MM-DD`。 |
| `updated` | 更新日期，`YYYY-MM-DD`。 |

## SPEC

额外字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `acceptance` | 是 | 可验收标准。 |
| `plans` | 否 | 派生 plan ID。 |
| `non_goals` | 否 | 明确不做的内容。 |
| `contracts` | 否 | API、SSE、数据结构等契约引用。 |

正文至少包含：背景、目标、范围、非目标、输入、输出、关键约束、验收标准、追溯。

## PLAN

额外字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `specs` | 是 | 来源 spec ID。 |
| `tasks` | 否 | 拆分出的 task ID。 |
| `review.required` | 是 | 新功能默认 `true`。 |
| `review.confirmed_by` | 否 | 确认来源。 |
| `review.confirmed_at` | 否 | 确认日期。 |
| `risks` | 否 | 风险列表。 |
| `verification` | 否 | 计划验证方式。 |

正文至少包含：来源 Spec、实施目标、实施范围、方案、Task 拆分、契约与兼容性、风险、验证计划、Review。

## TASK

额外字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `plan` | 是 | 父 plan ID。 |
| `specs` | 是 | 关联 spec ID。 |
| `implements` | 否 | 实际触达路径。 |
| `traces` | 否 | 关联 trace ID。 |
| `blocked_by` | 否 | 阻塞项。 |
| `acceptance` | 否 | 任务级验收标准。 |

正文至少包含：目标、前置条件、预期触达路径、执行步骤、验收标准、实施记录。

## TRACE

额外字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `tasks` | 是 | 被追踪 task ID。 |
| `implements` | 是 | 实际触达路径。 |
| `summaries` | 否 | summary 文件路径。 |
| `verification` | 否 | 验证命令和结果。 |
| `deviations` | 否 | 与 plan 的偏差。 |
| `followups` | 否 | 后续事项。 |

正文至少包含：对应任务、实际触达路径、实施摘要、验证结果、与计划的偏差、后续事项、Summary 链接。

## 状态值

| 类型 | 允许状态 |
| --- | --- |
| `spec` | `draft`、`accepted`、`implemented`、`deprecated` |
| `plan` | `draft`、`reviewing`、`approved`、`implemented`、`superseded` |
| `task` | `todo`、`in_progress`、`implemented`、`verified`、`blocked`、`cancelled` |
| `trace` | `draft`、`implemented`、`verified`、`partial` |

## 关系规则

- `PLAN.specs` 必须引用存在的 `SPEC`。
- `TASK.plan` 必须引用存在的 `PLAN`。
- `TASK.specs` 必须引用存在的 `SPEC`。
- `TRACE.tasks` 必须引用存在的 `TASK`。
- `implements`、`source_assets`、`summaries` 应优先使用仓库相对路径。

