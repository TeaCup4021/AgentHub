# Codex 固定使用口令

本文档沉淀 AgentHub 使用 Codex 执行 Vibe Graph 工作时的固定口令。

目标是避免直接进入“帮我实现某功能”的模式，而是稳定执行：

```text
SPEC -> PLAN -> TASK -> IMPLEMENTS -> TRACE -> SUMMARY
```

## 1. 新需求：只生成 SPEC，不写代码

适用于用户刚提出一个新需求、功能、接口、交互或协作规则时。

```text
按 docs/vibe-graph/rules.md 处理这个需求。

先生成 SPEC，不写代码。

要求：
1. 先读取相关已有文档和代码上下文。
2. 判断是否已有可复用 spec 或历史设计。
3. 若没有，创建新的 SPEC-* 节点。
4. SPEC 必须包含目标、范围、非目标、输入、输出、关键约束、验收标准和 source_assets。
5. 不修改业务代码。

需求：
{在这里写需求}
```

## 2. 审完 SPEC 后：生成 PLAN 和 TASK，不写代码

适用于用户已经确认某个 SPEC，可以进入实施规划阶段，但还不希望动代码。

```text
基于 {SPEC-ID} 生成 {PLAN-ID} 和 TASK-*。

要求：
1. 遵循 docs/vibe-graph/rules.md。
2. 使用 docs/vibe-graph/templates/ 中的模板结构。
3. PLAN 必须引用 {SPEC-ID}。
4. TASK 必须足够小，能独立实施和验收。
5. 明确每个 TASK 的预期触达路径、验收标准和风险。
6. 不修改业务代码。
```

示例：

```text
基于 SPEC-GROUPCHAT-DAG-001 生成 PLAN-GROUPCHAT-DAG-002 和 TASK-GROUPCHAT-DAG-009..N，不写代码。
```

## 3. 确认后：实施指定 TASK，并回写 TRACE

适用于用户已经确认 plan/task，可以进入代码实现。

```text
实施 {TASK-ID}。

要求：
1. 先读取 {TASK-ID}、父 PLAN、相关 SPEC 和已有代码上下文。
2. 严格按 TASK 的范围实施。
3. 如发现必须偏离 PLAN，先说明偏离点；必要时等待确认。
4. 完成后更新或创建 TRACE-*。
5. TRACE 必须记录 implements、verification、deviations、followups 和 summaries。
6. 若新增或更新 summary，记录实现文件、验证结果、未完成项。
```

示例：

```text
实施 TASK-GROUPCHAT-DAG-009。
完成后更新 TRACE-GROUPCHAT-DAG-002，并在 summary 中记录实现文件、验证结果和未完成项。
```

## 4. 历史补录：只补图谱，不改业务代码

适用于把 Claude Code、Codex 或历史 Vibecoding 文档纳入图谱。

```text
按 docs/vibe-graph/rules.md 和 docs/vibe-graph/references/migration-guide.md 做历史补录。

试点对象：
{历史功能名}

要求：
1. 读取相关 archive/development/plans/、archive/development/summaries/、docs、backend、agenthub-web 文件。
2. 生成 SPEC-*、PLAN-*、TASK-*、TRACE-*。
3. 每个节点都要填写 source_assets。
4. 只记录能从历史文档或当前仓库确认的事实。
5. 对无法确认的信息标注 unknown 或待确认，不得臆造。
6. 不修改业务代码。
7. 最后运行 docs/vibe-graph/scripts/validate-vibe-graph.py。
```

示例：

```text
按 docs/vibe-graph/rules.md 和 docs/vibe-graph/references/migration-guide.md 做历史补录。

试点对象：PPT 内联浏览

要求：只补文档和追踪关系，不修改业务代码。
```

## 5. 图谱校验

适用于新增或更新图谱节点后。

```text
运行 Vibe Graph 校验。

命令：
python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph

如果校验失败，只修复 docs/vibe-graph/ 下的图谱文件或校验脚本问题，不修改业务代码。
```

当前校验覆盖：

- ID 格式与唯一性。
- 节点文件名与 ID 一致性。
- `depends_on`、`plans`、`tasks`、`traces` 等节点引用是否存在。
- `source_assets`、`implements`、`summaries` 等路径是否存在。
- `TASK.plan` 是否指向存在的父 `PLAN`。
- `PLAN.tasks` 与 `TASK.plan` 是否双向一致。
- `SPEC.plans` 与 `PLAN.specs` 是否双向一致。
- `implemented` / `verified` 状态的 `TASK` 是否关联 `TRACE`。
- `TRACE` 是否记录 `verification` 和 `implements`。

## 6. 协作规范交付：给项目负责人

适用于需要把 Vibecoding 过程中沉淀出的 spec、skill、rules 等协作规范整理成可交付资产。

```text
按 docs/vibe-graph/rules.md 的“负责人交付规则”整理协作规范包。

要求：
1. 确认或创建 AICOLLAB 领域的 SPEC/PLAN/TASK/TRACE 链路。
2. 更新 docs/vibe-graph/handoff.md，面向项目负责人说明背景、资产、样例、使用方式、验收清单和后续路线。
3. 检查 docs/vibe-graph/SKILL.md、prompts.md、templates/、references/ 和 scripts/ 是否可复用。
4. 至少引用一个真实业务样例，优先保留两个以上样例。
5. 不修改业务代码。
6. 最后运行 validate-vibe-graph.py，并把结果写入 TRACE 和 summary。
```

## 7. 使用约束

- 不要在新需求阶段直接要求“实现某功能”。
- 新功能默认先要有 `SPEC`。
- 代码实现前默认要有 `PLAN` 和 `TASK`。
- 实施后必须有 `TRACE`。
- 验证结果必须真实；未运行就写 `not_run` 和原因。
- 历史补录时，不要把历史 summary 当成当前代码事实；需要对照当前仓库路径。

