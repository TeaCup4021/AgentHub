# Vibe Graph 节点模板

本目录提供 `docs/vibe-graph/` 的最小可用节点模板。

## 模板列表

| 模板 | 目标目录 | 说明 |
| --- | --- | --- |
| `spec-template.md` | `docs/vibe-graph/specs/` | 需求、能力、行为或契约定义。 |
| `plan-template.md` | `docs/vibe-graph/plans/` | 基于 spec 生成的实施计划。 |
| `task-template.md` | `docs/vibe-graph/tasks/` | 可执行、可验收的任务。 |
| `trace-template.md` | `docs/vibe-graph/traces/` | 实施路径、验证结果、偏差和 summary 追踪。 |

## 使用方式

1. 根据节点类型复制对应模板。
2. 将文件命名为 `{id}.md`，例如 `SPEC-GROUPCHAT-DAG-001.md`。
3. 按 `docs/vibe-graph/rules.md` 填写 frontmatter。
4. 不确定的信息使用 `TBD`、`unknown` 或在正文中标注“待确认”，不得臆造。
5. 历史补录时，只引用原文档路径，不搬迁、不重写历史文档。

## 最小链路

```text
SPEC -> PLAN -> TASK -> TRACE
```

其中 `IMPLEMENTS` 是 `TASK` 或 `TRACE` 中记录的实际触达路径，`SUMMARY` 是 `TRACE.summaries` 引用的总结文档。

