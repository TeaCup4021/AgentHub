# 群聊 DAG 执行与 Orchestrator 总结重构 — Summary

完成日期：2026-06-06

## 背景

群聊联调（提示词「写网页 + 代码检查 + 部署 8090」，选 4.8 / 5.4 / Claude Code CLI）时，
计划生成了三段分工，但执行摘要里只有 4.8 工作了，5.4 和 CLI 显示未执行，且 4.8 自述
「沙箱无法绑定宿主机端口」。期望效果是「一个对话里多 Agent 按依赖依次/并行回复，最后由
Orchestrator 汇总总结」。

## 根因（已定位）

1. 确认计划后 `stream_conversation` 无条件走 `_coordinator_stream`（注释自写 "always
   Coordinator mode"），能按计划分工执行的 `_dag_workflow_stream` 从不被调用（CLAUDE.md 已知问题 #7）。
2. Coordinator 只从计划抽 agent_id，分工/顺序全丢，发给协调者的只有原始 prompt + 专家列表；
   ADK Collaborative Workflow 的 transfer 是单跳委派，软约束压不住，于是整件事被 transfer 给一个
   Agent（4.8）。5.4 / CLI 的 before_agent 从未触发 → 摘要标记未执行。
3. 「沙箱无法绑定端口」是 4.8 这个纯 LLM 自己编的叙述，真正能起服务的 CLI 子 Agent 没被调用。

## 改动清单

| 文件 | 改动 |
|------|------|
| `backend/app/api/v1/conversations.py` | ① `confirmed` 路由由 `_coordinator_stream` 改为 `_dag_workflow_stream`；② DAG translator 由 `sequential=True` 改 `sequential=False`（关闭强制串行化，让无依赖 Agent 并行流式回复，依赖关系由 WorkflowBuilder 图边保证）；③ `_run_merge_aggregator` 改为 async generator：调 Orchestrator 模型生成自然语言总结、先落库再流式回复（遵守 CLAUDE.md「yield 前持久化」规则），结构化指标表存入 artifact |
| `backend/app/api/v1/messages.py` | auto_orchestrate 分支按 @ 顺序解析设定 Orchestrator：单 @ 直接用、多 @ 调默认 deepseek 消歧（`_disambiguate_orchestrator`，失败取第一个 @）、无 @ 用下拉框值；@ 覆盖下拉框 |
| `backend/app/services/adk/merge_aggregator.py` | 新增 `summarize_with_llm`：用 planner_agent 的模型（无则默认 deepseek）读各 Agent 输出生成自然语言总结；失败返回空串由调用方回退模板 |
| `agenthub-web/src/components/layout/ChatArea.tsx` | `handleSend` 不再把无 @ 的群聊 mentions 自动填全员（否则后端无法区分真实 @）；守卫改为校验会话绑定的 Agent 数；执行者集合由后端 mentions→参与者兜底 |

## 行为变化

- **确定 Orchestrator**：消息 @B 覆盖下拉框；多 @ 用默认 deepseek 读消息消歧，分析不出取第一个 @；
  都没有 → 默认 deepseek-v4-pro。
- **执行**：走 DAG，遵循 Planner 的依赖图——有依赖串行、无依赖并行；并行 Agent 前端也并行流式回复。
- **Orchestrator 身份**：默认 deepseek 不在执行候选里、纯协调；被 @ 指定的 Agent 在执行列表中、
  可被分配 subtask。
- **总结**：执行完真·调用 Orchestrator 模型读各 Agent 输出生成一段自然语言总结，作为最后一条
  orchestrator 回复；结构化指标（各 Agent 状态/耗时表）保留为 artifact。

## 验证

- 后端：modified 文件 `import OK`；`pytest tests/` → 24 passed，7 failed 全部是 `async def`
  缺 `pytest-asyncio` 的预存环境问题（含未改动的 `test_stream_sequentializer.py`），非本次回归；
  `test_artifact_service.py`（唯一引用 MergeAggregator 的同步测试）7 passed。
- 前端：`tsc --noEmit` 通过；`vitest run` → 16 files / 104 tests 全过。

## 遗留 / 观察项

- **并行 flush 验证**：「无依赖并行回复」依赖 ADK Workflow 真的交错 flush 并发节点事件。需在真实
  联调时看后端日志 `agent_breakdown` + message_start/end 时间戳确认；若 ADK 内部按节点串行 flush，
  需在 runner 层调整。
- `_coordinator_stream` 暂保留（不再被引用）；如确认 DAG 路径稳定可后续删除，连同 CLAUDE.md 已知问题
  #7 一并清账。
- CLI Agent 在编排中仍是一次性 `claude -p` 子进程、无会话复用（已知问题 #8），部署类任务能力受限，
  本次未触及。

---

## 联调修复轮（2026-06-06，3 个真实问题）

首次联调（提示词「写网页+检查+说明」选 4.8/5.4/CLI）暴露：路由已成功改走 DAG，但
摘要仍显示 5.4/CLI 未工作。逐层定位出 3 个问题（其中 2、3 同根因）。

### 问题 1：确认计划时前端丢弃 depends_on → 计划退化成全并行

- **现象**：edge 日志三条全是 `__START__ -> agentX`，依赖链丢失。
- **根因**：`ChatArea.tsx:handleConfirmPlan` 的 `plan` 只传 `subtask_id/agent_id/instruction`，
  后端 `item.get("depends_on", [])` 取不到 → 全部无依赖。
- **修复**：`types/chat.ts` 的 `PlanSubtask` 补 `depends_on/mode/output_key`；`handleConfirmPlan`
  传全这些字段。修后 edge 正确呈依赖链（`4.8→5.4→join→CLI`）。

### 问题 4：Agent 名字显示成 `agent_<uuid>`

- **根因**：DAG 节点内部名（`agent_<uuid>`）经 message meta 漏到前端；Coordinator 路径用真名，
  DAG 路径切过来后没做映射。
- **修复**：`ADKToSSETranslator` 加 `agent_name_map`（节点名→{id,name}），`_to_message_start`
  用它；`_dag_workflow_stream` 按 WorkflowBuilder dedup 规则构建该映射。

### 问题 2（核心）：ADK Workflow 把所有 Agent 跑在同一 invocation_id 下 → 多 Agent 塌缩成一个

- **现象**：`agent_breakdown={'4.8':1, 'unknown':299}`、`tracer_records=1`、只有 1 行 subtask
  success、总结收到"queued 无输出"。**串行链路下也发生**（与并行无关，是 Workflow 固有结构）。
- **根因**：翻译器 `message_id=invocation_id`、tracer `records[inv_id]`，两处都用 invocation_id
  区分 Agent，但一张图所有 Agent 共享同一 invocation_id → message_start 被去重挡掉、tracer 记录互相覆盖。
- **修复**：
  - `adk_to_sse.py`：新增 `agent_message_id(inv_id, author)`（uuid5 确定性派生）；翻译器按
    `(invocation_id, author)` 区分消息，author 切换时给上一个 Agent 补 `message_end`、新 Agent 发
    `message_start`，每个 Agent 一条独立消息。
  - `execution_tracer.py`：`records` 改用 `inv_id|agent_name` 复合键，每个 Agent 独立记录。
  - `_update_subtask_metrics`：用 `agent_message_id(rec.invocation_id, rec.agent_name)` 反推每个
    Agent 的持久化消息 UUID 回填 `output_message_id`（此前 `set_output_message` 从未被调用，恒为 None），
    让总结能拿到各 Agent 真实输出。
- **新增测试**：`tests/services/adapters/test_adk_to_sse_multiagent.py`（3 个同步测试，绕开缺失的
  pytest-asyncio）——验证「一个 invocation 拆成多条按 author 区分的消息」「author 切换关闭上一条」
  「name_map 解析真名」。

### 联调轮验证

- 后端 `pytest tests/`：27 passed（+3 新增），7 failed 全为预存 `async def` 缺 pytest-asyncio 环境问题。
- 前端 `tsc` 通过；`vitest` 16 文件 / 104 测试全过。
- 待真机复测：三个 Agent 各出独立消息、各自 success/latency、总结基于真实三段输出、名字显示真名。
  这同时是「无依赖并行回复」的前提（并行多 author 交错时按 author 分流才正确）。

---

## 联调修复轮 2（2026-06-06）：工作流自身 author 被误当 Agent

### 定位手段：原始事件诊断日志

复现中出现「只有 CLI 跑了一个节点」的异常 run。为区分「ADK 引擎没推进下游」与
「翻译层归属错」，在 `_dag_workflow_stream` 加了 `_logged_runner_stream` 包装，记录翻译层
**之前**的原始 ADK 事件 author 分布（`DAG raw author breakdown`）和节点错误（`DAG raw event error`）。

诊断日志一锤定音：
```
authors={'agent_<4.8>': 298, 'agent_<5.4>': 306, 'orchestrator_plan': 1, 'agent_<CLI>': 1}
```
→ 三个 Agent 都正常启动并产出（edge 也是正确依赖链）。**ADK Workflow 推进机制正常**，
此前「只有 CLI」是一次 Planner 退化计划的偶发 run，非引擎固有故障。

### 新发现的真实 bug：`orchestrator_plan` 被当成第四个 Agent

`WorkflowBuilder` 建的 `Workflow(name="orchestrator_plan")`，ADK 在 `_workflow.py` 用
`ctx.event_author = self.name` 把**工作流自身**发的事件也标成 author=`orchestrator_plan`。
联调轮把翻译器改成「按 author 切换拆消息」后，这个非 Agent 的 author 会被当成一个 Agent，
凭空生成一条消息，且夹在 5.4 和 CLI 之间会把 per-agent 流切碎。

- **修复**（`adk_to_sse.py`）：DAG 模式下（`agent_name_map` 非空），author 不在 map 里的事件
  直接跳过（不建消息、不切流）。单聊/Coordinator 路径 map 为空，不受影响。
- **新增测试**：`test_dag_skips_workflow_own_author` —— 验证 `orchestrator_plan` 这类工作流
  自身 author 被跳过、只有真实 Agent 产出消息。

### 验证

- 后端 `pytest tests/`：28 passed（再 +1），7 failed 仍为预存 async/pytest-asyncio 环境问题。
- `import OK`。
- 诊断日志（`DAG raw author breakdown` / `DAG raw event error`）保留，便于后续观察。

---

## 联调修复轮 3（2026-06-06）：多 Agent 消息在前端/落库被并到同一名下

复测日志确认后端 SSE 流归属正确（`agent_breakdown={'4.8':1,'5.4':1,'Claude Code CLI':1}`、
`tracer_records=3`、无 `orchestrator_plan`），但前端仍把三条消息显示成同一个 Agent。
定位出两个**独立**的归属 bug：

### Bug A（前端流式）：回调用全局「当前消息」ref 而非事件自带 message_id

- **根因**：`ChatArea` 的 `onToken/onArtifact/onThinking/onMessageEnd` 都用全局
  `streamMsgIdRef.current`（只存最后一个 message_start 的 id）。DAG 在**一条 SSE 连接**上交错
  发多个 Agent 的消息，每个事件本身带 `message_id`，但回调忽略它 → 所有 token 被 append 到
  最后一条消息。
- **修复**：回调改用 `data.message_id` 路由到各自消息；新增 `streamMetaByMsgIdRef`
  （message_id→{agentName,senderId}）让 `message_end` 的 usage 归属到正确 Agent。

### Bug B（后端落库读取）：name 解析按 (sender_type, sender_id) 聚合，DAG 消息 sender_id 全为 None

- **根因**：`list_messages` 的 `meta_fallbacks` 和 `_batch_get_sender_names` 都以
  `(sender_type, sender_id)` 为 key 解析显示名。DAG/群聊的 agent 消息 `sender_id=None`，
  真实名字在 `meta_data.agent_name` —— 于是所有 agent 消息的 key 都是 `("agent", None)`，
  互相覆盖成同一个名字（刷新后三条显示同名）。
- **修复**：items 构建改用 `_resolve_name(m)`，优先取该消息**自己**的 `meta_data.agent_name`，
  再退回 `(sender_type, sender_id)` 批量解析。

### 验证

- 后端 `pytest tests/`：28 passed，7 failed 仍为预存 async 环境问题；`import OK`。
- 前端 `tsc` 通过；`vitest` 16 文件 / 104 测试全过。
- 待复测：流式期间三条 Agent 消息各自独立累积、刷新后各显示真名（4.8 / 5.4 / CLI）。

---

## 联调修复轮 4（2026-06-06）：总结顺序 / Agent 回复语言 / 计划草稿 Agent 名

### 问题 1：Orchestrator 总结排在第 2 条而非最后一条

- **根因**：`summary_msg` 用服务端默认 `created_at` = PostgreSQL `now()`，它解析为**事务开始
  时间**。`db` 会话的事务在 `_dag_workflow_stream` 顶部就开始了，而各 Agent 消息是流式过程中用
  **各自新会话**落库（时间戳准、更晚）。于是 summary 的 created_at 反而最早，`list_messages`
  按 created_at 排序时它排到前面。
- **修复**（`conversations.py:_run_merge_aggregator`）：显式设 `created_at=updated_at=now(UTC)`。

### 问题 2：Agent 用英文回复，期望中文

- **根因**：Planner 生成英文 instruction，执行节点跟随 instruction 语言。
- **修复**（`planner.py:_plan_prompt`）：加规则 7——instruction 必须用与用户请求**相同的语言**
  书写，并在每条 instruction 末尾显式要求用该语言回复（中文请求→中文 instruction + 「用中文回复」）。

### 问题 3：计划草稿里 Agent 名显示成 system_prompt 片段（如「你最擅长代码的编写」）

- **根因**：plan 的 `agent_name` 来自 Planner LLM 输出的 `agentName`，LLM 有时把它填成 agent 的
  system_prompt 片段而非真实名字。
- **修复**（`conversations.py`）：新增 `_override_plan_agent_names(db, plan)`——按 `agent_id` 从
  DB 用 `AgentModel.name` 权威覆盖，绝不信任 LLM 的 agentName。在 plan 与 refine 两条流里都调用。

### 验证

- 后端 `pytest tests/`：28 passed，7 failed 仍为预存 async 环境问题；`import OK`。
- 前端 `tsc` 通过。
- 待复测：总结为最后一条、Agent 中文回复、计划草稿显示真实 Agent 名（4.8/5.4/CLI）。

---

## 联调修复轮 5（2026-06-06）：并行流式内容被「author 切换关闭」截断

并行场景（@4.8 快排 + @5.4 二分，互相独立）复测：依赖图正确并行、subtask 都 success、
总结顺序/中文/名字都对，但 4.8 消息在写 `<artifact>` 中途被截断、5.4 只存了一个 `<`。

- **根因**：联调轮 2 我加的「author 切换 → 关闭上一条消息」逻辑（`adk_to_sse.py`）只对**串行**
  成立。并行时两个 Agent 的事件**交错到达**（4.8 token → 5.4 token → 4.8 token…），每次 author
  变化就给上一个 Agent 提前发 `message_end`，`_accumulate_stream_events` 立即把半截内容落库并停止
  累积，后续 token 因消息已 ended 被丢弃。5.4 第一个 token 是 `<`，紧接着 author 切回 4.8，于是
  5.4 只剩 `<`。
- **修复**：**整段删除**「author 切换关闭」逻辑及其 `last_author/last_message_id` 状态。message_id
  已按 `(invocation, author)` 分桶，每个 Agent 的 token 天然各归各；消息结束靠各自真正的
  `message_end`（turn_complete/end_of_agent）+ translate 末尾的 fallback 兜底，不需要靠 author
  切换猜测。
- **测试调整**：删除断言旧行为的 `test_author_switch_closes_previous_message`，改为
  `test_interleaved_tokens_do_not_truncate_each_agent`（交错 A1/B1/A2/B2 → A、B 各自收齐 2 个 token）
  和 `test_author_switch_does_not_close_previous_message_midstream`（切换不再 mid-stream 关闭）。

### 验证

- 后端 `pytest tests/`：29 passed（+1），7 failed 仍为预存 async 环境问题；`import OK`。
- 前端 `tsc` 通过。
- 引擎层并行已确认（两条 `__START__` 边、两个 LiteLLM 调用同秒发起、tracer_records=2、双 success）。
- 待复测：并行两个 Agent 的消息内容**完整**落库（不再截断），各自完整流式回复。


