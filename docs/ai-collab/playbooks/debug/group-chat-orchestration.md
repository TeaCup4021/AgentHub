# 群聊编排（DAG）故障诊断

当群聊「确认计划后只有部分 Agent 工作」「消息归属错乱/同名」「内容被截断」「总结顺序/语言不对」时，
按本指南从后端日志逐层定位。配套背景见 `decisions/002-group-chat-dag-execution.md`。

## 前提

- `VITE_USE_MOCK=false`，后端走 `.venv` 直接起（CLI Agent 子进程才能 spawn）。
- 群聊已绑定 ≥2 个 Agent。

## 诊断必看的 4 行日志

每次群聊执行，按出现顺序抓这几行（都在 `agenthub.workflow_builder` / `agenthub.stream`）：

1. **`Workflow.build: agents=N edges=M`** + 每条 `edge: X -> Y`
   → 看依赖图结构。无依赖应是 `__START__ -> X`；有依赖应是 `X -> Y` / `X -> join_* -> Y`。
   若依赖链丢失、全是 `__START__`，查**前端确认时是否漏传 `depends_on`**（`handleConfirmPlan`）。

2. **`DAG raw author breakdown: authors={...}`**（翻译层**之前**的原始事件）
   → 这是判断「引擎有没有真正跑多个 Agent」的金标准。
   - 只有 1 个真实 agent → 引擎没推进下游（查依赖图/退化计划），或某节点静默失败（看 `DAG raw event error`）。
   - 有 N 个真实 agent + `orchestrator_plan`（工作流自身，正常，会被翻译层过滤）→ 引擎 OK，问题在翻译/归属层。

3. **`DAG workflow done: ... agent_breakdown={...} tracer_records=K`**（翻译**之后**）
   → `agent_breakdown` 应含 N 个真实 agent 名、无 `orchestrator_plan`；`tracer_records` 应 = 子任务数。
   - `tracer_records=1` 但 raw 有 N 个 → tracer 键退化（应为 `inv_id|agent_name`）。
   - `agent_breakdown` 有 `orchestrator_plan` → DAG 模式未跳过工作流自身 author。

4. **`UPDATE orchestrator_subtasks SET status=...`**
   → 应每个子任务一行 `success` + latency。只有 1 行 → 见下「症状表」。

## 症状 → 根因速查

| 症状 | 根因 | 修复位置 |
|------|------|----------|
| 确认后只有 1 个 Agent 工作 | `confirmed` 走了 Coordinator 而非 DAG | `stream_conversation` 路由到 `_dag_workflow_stream` |
| edge 全是 `__START__`、依赖丢失 | 前端确认漏传 `depends_on` | `ChatArea.handleConfirmPlan` 传全字段 |
| 多 Agent 揉成一条消息 / tracer_records=1 / subtask 只 1 行 success | 用 `invocation_id` 区分 Agent（一图共享一个） | 翻译器 `agent_message_id(inv,author)`、tracer `inv_id\|agent_name` 键 |
| 多出一条空消息 / 流被切碎 | 工作流自身 author（`orchestrator_plan`）被当 Agent | 翻译器 DAG 模式跳过 `agent_name_map` 外的 author |
| 并行时 Agent 内容截断（半句 / 只剩 `<`） | 「author 切换关闭上一条」在交错时误伤 | 删除该逻辑，靠各自 `message_end` + 末尾 fallback |
| 刷新后多 Agent 显示同名 | `list_messages` 按 `(sender_type,sender_id)` 解析、DAG 消息 sender_id 全 None | 优先取消息自己的 `meta_data.agent_name` |
| 流式期间 Agent 消息混到一条 | 前端回调用全局 `streamMsgIdRef` 而非事件 `message_id` | `ChatArea` 回调用 `data.message_id` |
| 总结排在中间而非最后 | summary 用服务端 `now()`=事务起点 | 显式 `created_at=datetime.now(utc)` |
| 计划草稿 Agent 名是 prompt 片段 | 信任了 Planner LLM 的 `agentName` | `_override_plan_agent_names` 按 id 回查 DB |
| Agent 用英文回复 | Planner 生成英文 instruction | `planner.py` instruction 语言对齐规则 |
| 总结说「queued 无输出」 | `output_message_id` 没回填 | `_update_subtask_metrics` 用 `agent_message_id` 反推回填 |

## 关键认知

ADK Workflow 把整张图的**所有 Agent 跑在同一个 `invocation_id`** 下，`author` 才是区分 Agent 的维度。
几乎所有「多 Agent 塌缩/归属错」的 bug 都源于误用 invocation_id 区分 Agent。详见 CLAUDE.md 纠正类规则。
