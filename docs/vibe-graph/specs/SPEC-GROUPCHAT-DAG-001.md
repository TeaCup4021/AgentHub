---
id: SPEC-GROUPCHAT-DAG-001
type: spec
title: 群聊 DAG 执行与 Orchestrator 总结
status: implemented
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
source_assets:
  - archive/development/plans/群聊DAG执行与Orchestrator总结重构.md
  - archive/development/summaries/群聊DAG执行与Orchestrator总结重构-summary.md
  - docs/ai-collab/decisions/orchestration/002-group-chat-dag-execution.md
depends_on: []
relates_to: []
plans:
  - PLAN-GROUPCHAT-DAG-001
acceptance:
  - 确认群聊计划后走 DAG 执行路径，而不是丢弃计划退回 Coordinator。
  - DAG 执行遵循 subtask 依赖关系，有依赖串行，无依赖可并行。
  - 一个 ADK invocation 下的多个 Agent 必须拆成独立消息和独立执行记录。
  - 工作流自身 author 不应被当成 Agent 消息。
  - 前端流式回调必须按 SSE 事件 message_id 分发 token、artifact、thinking 和 message_end。
  - 执行完成后由 Orchestrator 生成自然语言总结，并保留结构化指标。
non_goals:
  - 删除旧的 _coordinator_stream 死代码。
  - 解决 CLI Agent 会话复用能力。
  - 将所有历史群聊相关文档一次性迁移。
contracts:
  - docs/AgentHub 响应格式与前后端对齐约定.md
---

# 群聊 DAG 执行与 Orchestrator 总结

## 背景

历史联调中，用户在群聊中选择多个 Agent 并确认计划后，实际执行只触发了一个 Agent。已有 plan、summary 和 ADR 将根因定位为：确认后路由走 Coordinator，计划分工和依赖被丢弃；ADK Workflow 内多个 Agent 共享同一 invocation_id；前端和后端落库按全局当前消息或 `(sender_type, sender_id)` 聚合，导致多 Agent 消息被合并或显示错名。

## 目标

- 群聊计划确认后按 DAG 执行。
- 依赖图驱动 Agent 串行或并行执行。
- 每个 Agent 拥有独立 message、tracer record、status、latency 和 output_message_id。
- Orchestrator 在所有 Agent 完成后生成最终自然语言总结。
- 前端和后端读取消息时保持每个 Agent 的独立归属。

## 范围

- 后端 `confirm_plan` 到 `_dag_workflow_stream` 的执行路由。
- DAG subtask 依赖字段的前端确认传递。
- ADK SSE translator 的多 Agent 消息分桶。
- ExecutionTracer 的多 Agent 记录。
- MergeAggregator 的自然语言总结。
- 前端 SSE 回调按 `message_id` 分发。
- 消息列表按单条 message 的 `meta_data.agent_name` 解析显示名。

## 非目标

- 不删除保留的 Coordinator 路径。
- 不重构整个 ADK Runner。
- 不修改 CLI Agent 的进程模型。
- 不补录所有群聊编排历史问题。

## 输入

- 用户群聊消息。
- Planner 生成并由用户确认的 subtask DAG。
- 会话绑定 Agent 与真实 `@mentions`。
- ADK Workflow 事件流。

## 输出

- 多条独立 Agent 消息。
- 每个 subtask 的执行指标。
- DAG 结构化 artifact。
- Orchestrator 最终总结消息。
- 可被前端正确显示和刷新读取的消息列表。

## 关键约束

- 不得用 invocation_id 单独区分 Agent。
- DAG 模式下必须跳过不在 `agent_name_map` 中的工作流自身 author。
- 不得依赖 author 切换来提前关闭上一条 Agent 消息。
- 前端处理 SSE token、artifact、thinking、message_end 时优先使用事件自带 `message_id`。
- 需要排在最后的 summary 消息必须显式设置创建时间，避免事务开始时间导致排序提前。

## 验收标准

- [ ] 确认计划后 `_dag_workflow_stream` 被调用。
- [ ] `depends_on`、`mode`、`output_key` 从前端确认 payload 传回后端。
- [ ] 并行 Agent 事件交错时不会截断各自消息内容。
- [ ] `agent_breakdown`、`tracer_records` 和 subtask metrics 能区分多个 Agent。
- [ ] 工作流自身 author 不生成伪 Agent 消息。
- [ ] 刷新消息列表后，各 Agent 显示真实名字。
- [ ] 最后一条 Orchestrator 消息为自然语言总结。

## 追溯

- Plan: `PLAN-GROUPCHAT-DAG-001`
- Tasks: `TASK-GROUPCHAT-DAG-001` 至 `TASK-GROUPCHAT-DAG-008`
- Trace: `TRACE-GROUPCHAT-DAG-001`

## Obsidian 双链

Related:

- [[PLAN-GROUPCHAT-DAG-001]]
- [[TASK-GROUPCHAT-DAG-001]]
- [[TASK-GROUPCHAT-DAG-002]]
- [[TASK-GROUPCHAT-DAG-003]]
- [[TASK-GROUPCHAT-DAG-004]]
- [[TASK-GROUPCHAT-DAG-005]]
- [[TASK-GROUPCHAT-DAG-006]]
- [[TASK-GROUPCHAT-DAG-007]]
- [[TASK-GROUPCHAT-DAG-008]]
- [[TRACE-GROUPCHAT-DAG-001]]

