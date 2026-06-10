# ADR-001: Planner/Coordinator Prompt 中 Agent 分配策略

## 日期

2026-06-04

## 状态

已实施

## 上下文

群聊编排流程中，Planner 和 Coordinator 是两个独立的 LLM 环节：

- **Planner**（DeepSeek 默认，或用户指定的 planner_agent）负责将用户需求拆解为 subtask 列表
- **Coordinator**（同样 DeepSeek 默认或用户指定）负责在运行时动态调用子 Agent

### 问题 1 — Plan 只说"display only"

之前 Planner prompt 写的是：
```
IMPORTANT: This plan is for DISPLAY ONLY — a coordinator LLM will dynamically
dispatch tasks to agents at runtime. dependsOn is purely for frontend visualization.
```

导致 LLM 不关心 subtask 分配（因为"只是展示用的"），倾向于把所有 subtask 分配给同一个 Agent。并且告示用户在回复文案中自己说"本次计划采用 DAG 模式"，但实际上 Coordinator 模式完全不使用 `depends_on`。

### 问题 2 — Coordinator 说"如果 1 个 Agent 够就用 1 个"

之前 Coordinator instruction 中的 guideline #2 是：
```
If only one specialist was needed, present their output directly without rephrasing
```

这条直接**鼓励** Coordinator 把所有工作合并到单个 Agent，不做分配。

### 结果

群聊绑定了 3 个 Agent（如 Claude Code CLI, Ant, Coder），但所有 subtask 全部分配给 Claude Code CLI 串行执行。Claude Code CLI 的每个 subtask 耗时 ~96 秒，总耗时 = 96 × N 秒。

## 决策

修改两处 Prompt，核心原则从"display only"和"合并"改为"**必须分发**"：

### Planner prompt 改动

```python
# 删除:
"List which agents should participate and in what order."
"IMPORTANT: This plan is for DISPLAY ONLY..."
"Break it into subtasks with dependencies."
'dependsOn controls frontend display ordering'

# 新增 Rule 2:
"DISTRIBUTE subtasks across DIFFERENT agents — do not assign all work "
"to a single agent. Each available agent should be assigned at least one "
"subtask that matches its expertise."
```

### Coordinator instruction 改动

```python
# 删除:
"2. If only one specialist was needed, present their output directly..."

# 替换为:
"2. DISTRIBUTE work across the specialists — call each one that can contribute. "
"Do not consolidate everything into a single specialist."
"3. Call specialists in parallel/interleaved order where their tasks are independent."
```

## 后果

- 正向：多 Agent 群聊的负载会被分散到所有绑定的 Agent，减少单个 Agent 的串行 subtask 堆积
- 正向：Planner 不再自称为"DAG 模式"，因为实际执行是 Coordinator 动态分派
- 注意：Coordinator 仍然是串行调用每个 Agent（ADK 的 LlmAgent 逐个调用 `request_task_<name>`），"并行"指 plan 上显示的并行关系，不是真正的异步并行
- CLI Agent 的耗时问题仍需额外处理（每个 subtask 启动独立子进程）
