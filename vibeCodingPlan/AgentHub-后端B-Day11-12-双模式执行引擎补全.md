# AgentHub-后端B-Day11-12-双模式执行引擎补全

## 实施目标
补齐 Day 11-12 中双模式执行引擎（Coordinator + Static DAG）的 4 个缺失模块：ExecutionTracer 回调、消息持久化、OrchestratorSubtask 落库、Plan B2 串行降级。

## 缺口分析（基于当前代码）

| 计划任务 | 当前状态 | 缺口 |
|---------|---------|------|
| ExecutionTracer Callback | 未实现 | ~100 行 after_agent_callback 计时器 |
| Coordinator/DAG 流消息持久化 | 未实现 | `_coordinator_stream` / `_dag_workflow_stream` 无落库 |
| orchestrator_subtasks 表更新 | 未实现 | 子任务执行结果未写回 DB |
| Plan B2 串行降级 | 未实现 | 无 Demux 混乱时的降级逻辑 |

---

## 1. ExecutionTracer（回调 + 数据类）

### 设计

- `ExecutionRecord` dataclass：agent_name, invocation_id, start_time, end_time, status, error
- `ExecutionTracer` 类：
  - `before_agent_callback` — 记录 start_time，status="running"
  - `after_agent_callback` — 记录 end_time，status="success"/"failed"
  - `get_dag_data(edges)` — 输出 `{nodes, edges}` 供 DAG API 使用
  - `get_subtask_metrics()` — 输出 `{invocation_id: {latency_ms, status}}` 供 SubTask 落库

### 注入点

- `WorkflowBuilder.build()` 接受可选 `ExecutionTracer` 参数，为每个 LlmAgent 注入 before/after callback
- `CoordinatorBuilder.build()` 同理
- Stream 函数创建 ExecutionTracer 实例并传入 Builder

---

## 2. 消息持久化（Coordinator/DAG 流）

### 设计

复用 `_adk_sse_stream()` 的 accumulator 模式：
- `message_start` → 创建 accumulator entry（message_id → {content, sender_name}）
- `token` → 追加 delta
- `message_end` → `MessageService.persist_stream_message()` 落库
- `error` → 落库为 status="failed"

在 `_coordinator_stream()` 和 `_dag_workflow_stream()` 中注入此逻辑。

---

## 3. OrchestratorSubtask 表更新

### 设计

执行完成后（所有 agent_status 事件收齐后），根据 ExecutionTracer 收集的指标：
- 为每个 Plan subtask 找到对应的 ExecutionRecord
- 更新 `OrchestratorSubtask.latency_ms`、`status`、`output_message_id`
- 在 `_dag_workflow_stream()` 结尾处批量写入

---

## 4. Plan B2 串行降级

### 设计

- 环境变量 `AGENTHUB_WORKFLOW_MAX_CONCURRENCY` 控制 max_concurrency
- 默认值 3，可设为 1 强制串行
- WorkflowBuilder 已支持 `max_concurrency=min(len(agent_map), 3)`，改为读取环境变量即可

---

## 5. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/app/services/adk/execution_tracer.py` | **新增** | ExecutionTracer 类 + ExecutionRecord |
| `backend/app/services/adk/workflow_builder.py` | 修改 | 接受 ExecutionTracer，注入 callback |
| `backend/app/services/adk/coordinator_builder.py` | 修改 | 接受 ExecutionTracer，注入 callback |
| `backend/app/api/v1/conversations.py` | 修改 | _coordinator_stream / _dag_workflow_stream 加持久化 + SubTask 落库 + Tracer 集成 |

---

## 6. 验证检查点

- [ ] 导入检查通过（`python -c "from app.services.adk.execution_tracer import ExecutionTracer"`）
- [ ] WorkflowBuilder 注入 callback 后 Agent 创建成功
- [ ] CoordinatorBuilder 注入 callback 后 Agent 创建成功
- [ ] SSE 流中消息正确落库（messages 表有记录）
- [ ] orchestrator_subtasks 表 latency_ms 有值
- [ ] `AGENTHUB_WORKFLOW_MAX_CONCURRENCY=1` 时 max_concurrency=1
