# 群聊 DAG 执行与 Orchestrator 总结重构

## 背景与问题

群聊联调时，提示词「写网页 + 代码检查 + 部署到 8090 端口」选了 4.8 / 5.4 / Claude Code CLI 三个 Agent，
生成的计划是「4.8 写、5.4 检查、CLI 部署」，但执行摘要里只有 4.8 工作了，5.4 和 CLI 显示未执行，
且 4.8 自述「沙箱无法绑定宿主机端口」。

### 根因（已确认）

1. **确认后只走 Coordinator，计划被丢弃** — `stream_conversation` 在 `confirmed` 后无条件调
   `_coordinator_stream`（`conversations.py:1476`，注释自写 "always Coordinator mode"）。能按计划分工
   执行的 `_dag_workflow_stream` 存在但从不被调用（CLAUDE.md 已知问题 #7）。
2. **Coordinator 把计划降级成纯展示** — `_coordinator_stream` 只从 subtasks 抽 agent_id 去 load model
   （`conversations.py:998`），分工/顺序全丢弃；真正发给协调者的只有原始 prompt + 一段「专家列表」
   指令。协调者（ADK Collaborative Workflow）的 transfer 是单跳委派，软约束「DISTRIBUTE work」压不住，
   于是把整件事 transfer 给一个 Agent（4.8）。5.4 / CLI 从未被 before_agent 触发，
   `_update_subtask_metrics` 找不到它们的 tracer 记录 → 摘要标记为未执行。
3. **「沙箱无法绑定端口」是 4.8 自己编的叙述** — 真正能起服务的 CLI 子 Agent 压根没被调用。

## 目标（用户期望）

```
群聊发消息
  → 确定 Orchestrator：消息 @B 覆盖下拉框；多 @ 用默认 deepseek 消歧，分析不出取第一个 @；
    都没有 → 默认 deepseek-v4-pro
  → Orchestrator 拆解任务、分配 subtask（默认 deepseek 纯协调不执行；被 @ 指定的 Agent 可参与执行）
  → 走 DAG 路径执行：遵循依赖图——有依赖串行、无依赖并行
  → 执行中各 Agent 依次回复；并行的 Agent 在前端也并行流式回复
  → 执行完，真·调用 Orchestrator 模型读各 Agent 输出，生成自然语言总结，再回复一次
```

---

## 修改方案

### 改动 1：确认后路由改走 DAG（核心）

**文件**: `backend/app/api/v1/conversations.py`（`stream_conversation`，约 1476 行）

`confirmed_task` 分支由 `_coordinator_stream` 改为 `_dag_workflow_stream`。两者签名一致
`(conv_id, user_id, prompt, orch_task, db)`，直接替换调用即可。`_coordinator_stream` 暂时保留
（不再被引用），避免一次性删除影响其它分支。

### 改动 2：DAG 依赖层并行输出

**文件**: `backend/app/api/v1/conversations.py`（`_dag_workflow_stream`，约 1243 行）

现在 `ADKToSSETranslator(sequential=True, agent_order=...)` 会经 `StreamSequentializer` 把所有 Agent
输出**强制线性串行**，与「无依赖并行回复」矛盾。

改为 `ADKToSSETranslator(sequential=False)`：关闭串行化，事件按 ADK Workflow 实际产生顺序透传。
依赖关系已由 `WorkflowBuilder` 的图边（START→无依赖节点并发、依赖边串行）保证：

- 无依赖的 subtask 都从 START 出发、在 `max_concurrency` 内并发 → 事件交错实时透传 = 前端并行回复；
- 有依赖的 subtask 由 Edge 串到上游之后 → 上游 message_end 后才开始 = 串行回复。

`agent_order` 仅原本用于串行化，关闭后不再需要；保留 `_build_agent_order` 调用但不传入 translator。

> 风险：需验证 ADK Workflow 是否真的交错 flush 并发节点的事件。实现后看后端日志
> `agent_breakdown` 与时间戳确认；若 ADK 内部按节点串行 flush，则在 runner 层调整（保留为后续观察项）。

### 改动 3：后端按 @ 顺序解析并消歧设定 Orchestrator

**文件**: `backend/app/api/v1/messages.py`（auto_orchestrate 分支，约 160 行）

当前：`planner_agent_id` 只来自前端下拉框。

改为（@ 覆盖下拉框）：
1. 取本条消息的 mentions（`data.mentions`，前端按 @ 出现顺序去重，见改动 5）。
2. 若 mentions 为空 → 用 `data.planner_agent_id`（下拉框值，可为 None=默认 deepseek）。
3. 若恰好 1 个 @ → 用该 agent 作 Orchestrator。
4. 若多个 @ → 调用默认 deepseek 读消息内容消歧（新函数 `_disambiguate_orchestrator`），
   让它从候选里挑用户最可能想作为「协调者/任务分配者」的那个；解析不出 → 取第一个 @。
5. 结果写入 `OrchestratorTask.planner_agent_id`。

新增 helper（同文件或 `services/adk/planner.py`）：
```python
async def _disambiguate_orchestrator(message: str, candidates: list[Agent]) -> UUID:
    # 用 get_deepseek_llm() 跑单轮，prompt 给出候选 name+id，要求只输出一个 id；
    # 解析失败/越界 → candidates[0].id
```
消歧用默认 deepseek（`get_deepseek_llm()`），不依赖任何用户凭证，符合「凭证在后端」。

> 注意：执行者集合（谁干活）仍来自 `_orchestrator_plan_stream` 里 mentions→会话参与者兜底逻辑。
> 被选为 Orchestrator 的 agent 是否参与执行交给 Planner 的 prompt 决定（见改动 4 的指令微调）：
> 默认 deepseek 不在候选执行列表里、天然不执行；被 @ 的 agent 在执行列表里、可被分配 subtask。

### 改动 4：Orchestrator 真·LLM 总结

**文件**: `backend/app/services/adk/merge_aggregator.py` + `conversations.py:_run_merge_aggregator`

当前 `_build_summary_text` 只拼静态 Markdown 表格，没调 LLM。

改为：
1. `MergeAggregator.aggregate` 仍产出结构化 `sub_summaries`（保留，作为 artifact 卡片数据）。
2. 新增 `MergeAggregator.summarize_with_llm(orch_task, sub_summaries) -> str`：
   - 解析 Orchestrator 模型：`orch_task.planner_agent_id` 有值 → 用该 agent 的模型；否则 `get_deepseek_llm()`。
   - 组 prompt：原始用户需求 + 各 Agent（name/status/输出摘要）→ 要求生成一段自然语言总结
     （完成了什么、各 Agent 贡献、是否有冲突/失败、给用户的结论）。
   - 跑单轮 `AgentHubRunner.run_single_turn`，返回文本。
3. `_run_merge_aggregator` / `_coordinator_stream` 内联总结段：把 `summary_text` 由模板换成 LLM 文本，
   仍作为 `sender_type="orchestrator"` 的消息流式回复；结构化表格塞进 artifact content。
   LLM 调用失败兜底回退到原模板文本（不阻断流程）。

> `MergeAggregator` 现无 DB-LLM 依赖，新增方法需传入 `db`/task。沿用 `aggregate(db, orch_task_id)` 风格，
> 把 LLM 调用做成独立方法，由调用方在 aggregate 之后调用，便于失败兜底与测试。

### 改动 5：前端 mentions 只携带真实 @

**文件**: `agenthub-web/src/components/layout/ChatArea.tsx`（`handleSend`，约 592 行）

当前群聊无 @ 时把 `mentions` 自动填成全部 agentIds（`mentions = conversation.agentIds`），
导致后端无法区分「用户真的 @B」与「前端兜底全员」，破坏改动 3 的 @ 语义。

改为：
- 删除「无 @ 自动填全员」，`mentions` 只保留用户真正 @ 的（`mentionsFromText` 已按首次出现去重，
  顺序即 @ 顺序，满足「取第一个 @」）。
- 群聊「至少一个 Agent」的守卫改为校验 `conversation.agentIds.length`（会话有没有绑定 Agent），
  而非校验 mentions。
- 执行者集合兜底已在后端 `_orchestrator_plan_stream`（mentions 空 → 会话参与者）实现，前端无需再填。

> 不改 SSE/接口/事件类型；`mentions` 字段语义不变（仍是 UUID 列表），仅不再人为塞全员。

---

## 涉及文件总览

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `backend/app/api/v1/conversations.py` | 修改 | confirmed 路由改 `_dag_workflow_stream`；DAG translator `sequential=False`；总结段换 LLM 文本 |
| 2 | `backend/app/api/v1/messages.py` | 修改 | auto_orchestrate 分支按 @ 顺序解析 + 多@消歧设 planner_agent_id |
| 3 | `backend/app/services/adk/merge_aggregator.py` | 修改 | 新增 `summarize_with_llm`，真·调 Orchestrator 模型总结 |
| 4 | `agenthub-web/src/components/layout/ChatArea.tsx` | 修改 | mentions 只传真实 @，守卫改校验会话 Agent 数 |

（消歧 helper 视实现就近放 `messages.py` 或 `planner.py`）

---

## 实现顺序

```
Step 1: conversations.py — confirmed 路由改走 _dag_workflow_stream            ← 核心，立即修「只有一个 Agent 工作」
Step 2: conversations.py — _dag_workflow_stream translator sequential=False   ← 并行回复
Step 3: messages.py — @ 顺序解析 + 多@消歧 设 planner_agent_id                ← @ 指定 Orchestrator
Step 4: merge_aggregator.py + conversations.py — LLM 总结                      ← 真·总结
Step 5: ChatArea.tsx — mentions 只传真实 @ + 守卫改写                          ← 配合 Step 3
Step 6: 验证（pytest / vitest / tsc）
```

## 验证方案

1. **分工执行**：群聊选 3 个 Agent、不 @，发「写网页+检查+部署」→ 计划三段分给三个 Agent →
   执行摘要三个都有 ✅、各有 latency；后端日志 `agent_breakdown` 含三个 agent。
2. **并行回复**：构造两个无依赖 subtask（如「写前端」「写后端」）→ 前端两条消息几乎同时开始流式。
3. **依赖串行**：检查依赖写、部署依赖检查 → 后端日志 edge 串行、message_end 时间戳前后衔接。
4. **@ 指定 Orchestrator**：消息 @某Agent → 后端日志 planner=该 Agent；多 @ → 日志显示消歧结果。
5. **LLM 总结**：最后一条 orchestrator 消息是自然语言段落（非 Markdown 表格），结构化数据在 artifact。
6. **回归**：`pytest` 与前端 `vitest`/`tsc`，区分预存失败（pytest-asyncio 缺失）与本次引入。
