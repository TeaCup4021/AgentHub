# 历史文档迁移指南

本文档用于把历史 Claude Code、Codex、Vibecoding 文档补录进 `docs/vibe-graph/`。

迁移目标是建立追溯关系，不是重写历史文档。

## 适合优先迁移的对象

优先选择同时满足以下条件的功能：

1. 有明确 plan。
2. 有明确 summary、decision 或 bugfix 记录。
3. 能从仓库中确认主要实现路径。
4. 功能边界相对独立。

推荐试点：

- 群聊 DAG 执行与 Orchestrator 总结重构。
- PPT 内联浏览。
- 产物预览与编辑。

## 迁移步骤

1. 收集源资产。
   - `archive/development/plans/`
   - `archive/development/summaries/`
   - `docs/`
   - `docs/ai-collab/`
   - `agenthub-web/docs/specs/`
   - `agenthub-web/docs/plans/`

2. 提炼能力边界。
   - 从历史材料中找出可独立理解、可独立验收、可独立迭代的能力单元。
   - 一个历史文档覆盖多个能力时，拆成多个 `SPEC`。

3. 创建 `SPEC-*`。
   - 填写目标、范围、非目标、输入、输出、约束和验收标准。
   - 在 `source_assets` 中引用原始文档。

4. 创建 `PLAN-*`。
   - 将历史 plan 映射为 graph plan。
   - 不复制原 plan 全文，只提炼实施范围、方案、风险和验证计划。

5. 创建 `TASK-*`。
   - 按已经完成或计划完成的工作拆分。
   - 每个 task 必须引用父 plan 和相关 spec。

6. 创建 `TRACE-*`。
   - 记录实际触达路径。
   - 链接已有 summary。
   - 记录验证命令与结果；无法确认时写 `not_run` 或 `unknown`。
   - 如果历史 plan 与实际实现不一致，写入 `deviations`。

7. 回填关系。
   - 在 spec 中填 `plans`。
   - 在 plan 中填 `tasks`。
   - 在 task 中填 `implements` 和 `traces`。
   - 在 trace 中填 `summaries`。

## 禁止事项

- 不得修改业务代码。
- 不得移动或重写历史文档。
- 不得伪造用户确认。
- 不得伪造测试结果。
- 不得凭记忆写实现路径；必须读取仓库或标记待确认。

## 不确定信息写法

使用以下方式保留不确定性：

```yaml
owner: TBD
verification:
  - command: unknown
    result: unknown
    notes: 历史材料中未找到验证记录，待确认。
```

正文中可以写：

```text
待确认：该能力是否覆盖前端 mock 数据同步。
```


