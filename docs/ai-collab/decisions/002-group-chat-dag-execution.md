# ADR-002: 群聊确认后走 DAG 执行 + 多 Agent 依次/并行回复

## 日期

2026-06-06

## 状态

已实施

## 上下文

群聊编排「确认计划后只有一个 Agent 工作」。用户选 3 个 Agent（4.8/5.4/CLI），
计划拆成三段分工，但执行摘要里只有一个 Agent 有产出，其余显示未执行。

逐层定位出一连串问题（按发现顺序）：

1. **确认后只走 Coordinator，计划被丢弃**：`stream_conversation` 在 `confirmed` 后无条件调
   `_coordinator_stream`（注释自写 "always Coordinator mode"），能按计划分工执行的
   `_dag_workflow_stream` 存在但从不被调用（旧已知问题 #7）。Coordinator 只从 plan 抽 agent_id，
   分工/顺序全丢，发给协调者的只有原始 prompt——ADK Collaborative Workflow 的 transfer 是单跳
   委派，于是把整件事 transfer 给一个 Agent。

2. **前端确认时丢弃 depends_on**：`handleConfirmPlan` 只传 `subtask_id/agent_id/instruction`，
   依赖关系丢失，DAG 退化成全并行。

3. **多 Agent 在同一 invocation_id 下塌缩成一个**：ADK Workflow 把整张图所有节点跑在**同一个
   invocation_id** 下。翻译器 `message_id=invocation_id`、tracer `records[inv_id]` 都用
   invocation_id 区分 Agent → 多 Agent 揉成一条消息、tracer 只剩 1 条、subtask 只有 1 个 success、
   总结拿到「queued 无输出」。

4. **工作流自身 author 被当成 Agent**：`Workflow(name="orchestrator_plan")`，ADK 把工作流自己发的
   事件标成 author=`orchestrator_plan`，被「按 author 拆消息」逻辑当成第四个 Agent。

5. **前端/落库归属并到同名**：流式回调用全局「当前消息」ref 而非事件自带 message_id；
   `list_messages` 按 `(sender_type, sender_id)` 解析名，DAG agent 消息 `sender_id` 全 None →
   全部同名。

6. **「author 切换关闭上一条」在并行下截断内容**：为「串行依次输出」加的逻辑，在并行交错
   （A→B→A→B）时每次切换都给上一个 Agent 提前 `message_end`，内容被截断（4.8 代码半截、5.4 只剩 `<`）。

7. **总结排序、Agent 名、回复语言**：总结消息服务端 `now()`=事务起点导致排到前面；Planner 的
   `agentName` 误填 system_prompt 片段；Planner 生成英文 instruction 导致英文回复。

## 决策

### 路由：确认后走 DAG，不走 Coordinator

`confirmed` 任务改调 `_dag_workflow_stream`。计划的依赖图驱动执行：无依赖 subtask 从 START
并发、有依赖的按 Edge 串行。`_coordinator_stream` 暂保留（不再引用）。

### 执行单位标识：(invocation_id, author) 而非 invocation_id

ADK Workflow 共享一个 invocation_id，所以**区分 Agent 必须靠 author**：

- 翻译器：`agent_message_id(invocation_id, author)`（uuid5 确定性派生，命名空间固定），
  保证同一 Agent 在翻译/落库/metrics 回填三处始终映射到同一 UUID。
- `ExecutionTracer.records`：键改为 `inv_id|agent_name`。
- DAG 模式（`agent_name_map` 非空）跳过不在 map 里的 author（工作流自身的 `orchestrator_plan`）。
- `_update_subtask_metrics` 用 `agent_message_id(rec.invocation_id, rec.agent_name)` 反推每个
  Agent 的持久化消息 UUID，回填 `output_message_id`，让总结拿到真实输出。

### 消息边界：靠 message_end，不靠 author 切换

删除「author 切换 → 关闭上一条」逻辑。按 `(invocation, author)` 分桶后 token 天然各归各，
消息结束靠各 Agent 自己的 `message_end`（turn_complete/end_of_agent）+ translate 末尾对
「已 seen 未 ended」invocation 的 fallback 兜底。**这是支持并行交错流式的关键**。

### 输出顺序与并行

translator `sequential=False`（关闭 StreamSequentializer 强制串行化），事件按 ADK 实际产生
顺序透传 → 无依赖 Agent 并行流式、有依赖的自然串行。

### Orchestrator 真·LLM 总结

`MergeAggregator.summarize_with_llm` 用 Orchestrator 模型（指定 agent 或默认 deepseek）读各
Agent 真实输出生成自然语言总结，作为最后一条流式回复；结构化指标表降级为 artifact。
summary 消息显式设 `created_at=now(UTC)`（避免服务端 `now()`=事务起点排到前面）。

### @ 指定 Orchestrator + 多@消歧

消息 @ 覆盖下拉框；单 @ 直接用、多 @ 调默认 deepseek 消歧（`_disambiguate_orchestrator`，
失败取第一个 @）。前端不再把无 @ 群聊 mentions 自动填全员（否则后端无法区分真实 @）。

### 权威化与语言

- Agent 名按 agent_id 从 DB 用 `AgentModel.name` 覆盖（不信任 Planner 的 agentName）。
- Planner instruction 用与用户请求相同的语言书写并要求 Agent 用该语言回复。

## 后果

- 正向：群聊真正按计划分工执行；无依赖并行、有依赖串行；每个 Agent 独立成消息、独立 success/
  latency；总结基于真实输出且排在最后。串行（写→检查→说明）与并行（独立任务）两条链路都已联调通过。
- 前端流式回调改用事件自带 `message_id`，`list_messages` 显示名优先取消息自己的 `meta_data.agent_name`。
- 遗留：`_coordinator_stream` 死代码待删；DAG 诊断日志（`DAG raw author breakdown` 等）待清理；
  CLI Agent 编排中仍串行无会话复用（已知问题 #8）；中文回复为 prompt 软约束（已知问题 #11）。
- 沉淀为 CLAUDE.md 纠正类规则：①(invocation,author) 区分 Agent；②不靠 author 切换关闭消息；
  ③长事务 session 插入需排最后的消息要显式 created_at；④不信任 LLM 回填的权威字段。
