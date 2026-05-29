# AgentHub 后端B Day13 实施计划 - 聚合输出与 DAG 接口

日期：2026-05-29

## 目标
- 实现 MergeAggregator：多 Agent 执行完成后聚合子 Agent 输出，生成 orchestrator 汇总消息（sender_type="orchestrator"）
- 实现 DAG 数据接口 `GET /api/v1/orchestrator/tasks/{id}/dag`：返回 nodes + edges 供前端渲染执行轨迹
- 将 MergeAggregator 注入 `_coordinator_stream` 和 `_dag_workflow_stream` 执行末尾
- 群聊执行全链路联调验收

## 输入与约束
- 参照 `AgentHub-后端开发20天实施计划.md` Day 13（第 300-318 行）
- Plan JSON 格式：`{ subtasks: [{ subtaskId, dependsOn, outputKey }] }`，约定文档 §29
- MergeAggregator 数据来源：OrchestratorTask.plan、OrchestratorSubtask（Day 11-12 已落库）、各 output_message_id 对应的 Message.content
- DAG 端点数据来源：**ADK Workflow.edges（ADK 原生 DAG 拓扑）+ ExecutionTracer Callback 收集的计时数据**，不再从 DB plan JSON 重新计算拓扑。DAGBuilder 自研组件取消
- 汇总消息需遵循约定：sender_type="orchestrator"、camelCase 序列化、artifact 内联
- 响应格式：`{ code, data, message }` 包裹

## 缺口分析

| 计划任务 | 当前状态 | 缺口 |
|---------|---------|------|
| MergeAggregator | 未实现 | ~150 行，聚合 + 冲突检测 + 汇总文本生成 |
| orchestrator_summary artifact | 未实现 | MergeAggregator 输出落库为 message + artifact |
| DAG 数据接口 | 未实现 | 新路由 + 新 Schema（DagNode/DagEdge/DagResponse） |
| MergeAggregator 注入 | 未实现 | `_coordinator_stream` / `_dag_workflow_stream` 末尾调用 |

## 数据流

```
Coordinator / DAG 执行完成
  │
  ├─ ExecutionTracer 已收集计时 + 状态
  ├─ OrchestratorSubtask 行已由 _update_subtask_metrics() 更新
  │
  ▼
MergeAggregator.aggregate(db, orch_task_id)
  │
  ├─ 读 OrchestratorTask.plan.subtasks[]（获取拓扑）
  ├─ 读 OrchestratorSubtask 行（获取 status / latency_ms / output_message_id）
  ├─ 读 messages 表（通过 output_message_id 获取子 Agent 实际输出文本）
  ├─ 冲突检测：同语言代码块内容不同 / 同 outputKey 不同值
  ├─ 组装汇总文本（Markdown：表格 + 依赖链 + 冲突说明）
  │
  ▼
写入 messages 表
  │  sender_type = "orchestrator"
  │  content = MergeResult.summary_text
  │  status = "done"
  │
  ▼
写入 artifacts 表
  │  artifact_type = "orchestrator_summary"
  │  content = { sub_summaries, has_conflict, conflict_detail }
  │
  ▼
GET /api/v1/orchestrator/tasks/{id}/dag
  │
  ├─ 查 OrchestratorTask（获取 task 状态 + plan.instruction 等元数据）
  ├─ **edges**：从 ADK Workflow.edges 直接读取（执行时已由 WorkflowBuilder 构建，拓扑即 DAG）
  ├─ **nodes**：从 ExecutionTracer.records 获取（agent_name, latency_ms, status, output_message_id）
  ├─ Tracer 在执行时同步捕获 Workflow.edges，执行后一并持久化到 OrchestratorTask.result_summary JSONB
  ▼
返回 { taskId, status, nodes: [...], edges: [...] }
```

## 实施步骤

### Step 1: MergeAggregator 类

- 新建 `backend/app/services/adk/merge_aggregator.py`
- dataclass：
  - `SubAgentSummary`：agent_name, subtask_id, status, latency_ms, summary（截取前 300 字符）, output_message_id, depends_on
  - `MergeResult`：summary_text（完整 Markdown 汇总）, sub_summaries, has_conflict, conflict_detail
- 方法：`MergeAggregator.aggregate(db: AsyncSession, orch_task_id: UUID) -> MergeResult`
- 核心逻辑：
  1. 查 OrchestratorTask + 关联 OrchestratorSubtask 行
  2. 通过 output_message_id 查 messages.content 获取子 Agent 输出
  3. 截取前 300 字符为摘要
  4. 冲突检测（初版规则）：多个 Agent 对同一 outputKey 写入不同值 → has_conflict=True + 冲突说明
  5. 组装 Markdown 汇总：表格（Agent / 状态 / 耗时 / 摘要）+ 依赖链 ASCII + 冲突段（如有）
- 汇总文本格式示例：
  ```
  ## 执行摘要
  - 总耗时: 3500ms | 成功: 3 / 3
  
  ### 各 Agent 输出
  | Agent | 状态 | 耗时 | 摘要 |
  |-------|------|------|------|
  | WeatherAgent | ✅ | 1200ms | 查询东京天气... |
  
  ### 依赖执行链
  s1 ──┐
       ├── s3
  s2 ──┘
  ```

### Step 2: MergeAggregator 注入执行流

- 修改 `backend/app/api/v1/conversations.py`
- 在 `_coordinator_stream()` 和 `_dag_workflow_stream()` 中，`orch_task.status = "completed"` 之前调用 MergeAggregator
- 写入汇总消息（sender_type="orchestrator"）+ orchestrator_summary artifact
- 确保 `orch_task.status = "completed"` 在汇总消息落库之后执行

### Step 3: DAG 数据端点（ADK 原生拓扑）

- 新建 `backend/app/api/v1/orchestrator.py`
- 端点：`GET /api/v1/orchestrator/tasks/{task_id}/dag`
- 修改 `backend/app/schemas/orchestrator.py`：新增 DagNode、DagEdge、DagResponse
- 修改 `backend/app/api/router.py`：挂载 orchestrator 路由（prefix="/v1/orchestrator"）

```python
class DagNode(BaseSchema):
    subtask_id: str
    agent_id: str
    agent_name: str
    instruction: str
    status: str
    latency_ms: Optional[int] = None
    output_message_id: Optional[str] = None

class DagEdge(BaseSchema):
    from_node: str  # agent_name (from Workflow.edges)
    to_node: str    # agent_name (from Workflow.edges)

class DagResponse(BaseSchema):
    task_id: str
    status: str
    nodes: List[DagNode]
    edges: List[DagEdge]
```

- **edges 来源 — ADK Workflow.edges（原生 DAG 拓扑）**：
  - `WorkflowBuilder.build()` 返回的 `Workflow` 对象，其 `.edges` 属性即为完整的 DAG 拓扑
  - 边类型：`Edge(from_node=START, to_node=agent)`（无依赖） / `Edge(from_node=agent_A, to_node=agent_B)`（单依赖） / `Edge(from_node=dep, to_node=JoinNode)` + `Edge(from_node=JoinNode, to_node=agent)`（多依赖汇聚）
  - **取消 DAGBuilder 自研组件**，不再从 plan JSON 手动计算拓扑
- **nodes 来源 — ExecutionTracer.records（执行计时数据）**：
  - `ExecutionTracer.records` 中每条 `ExecutionRecord` 含 agent_name, invocation_id, start_time, end_time, status, output_message_id
  - `get_dag_data(edges)` 方法组合 Workflow.edges + records → 完整 DAG JSON
- **持久化方案**：
  - 执行完成后，在 `_dag_workflow_stream()` / `_coordinator_stream()` 末尾调用 `tracer.get_dag_data(workflow.edges)` 序列化到 `OrchestratorTask.result_summary` JSONB
  - DAG 端点从 DB 读取持久化后的数据直接返回，不再依赖内存中的 Tracer

- 实施步骤：
  1. `ExecutionTracer` 新增 `capture_edges(edges: list[Edge])` 方法，将 Workflow.edges 写入内部存储
  2. `get_dag_data()` 用已捕获的 edges + records 生成 `{nodes, edges}`
  3. `_dag_workflow_stream()` / `_coordinator_stream()` 执行末尾调用 `tracer.capture_edges(workflow.edges)` + `tracer.get_dag_data()` 序列化落库
  4. DAG 端点从 `OrchestratorTask.result_summary` 读取 `dag_data` JSONB 字段返回

### Step 4: 群聊联调验证

- 单聊不破坏（Mock + ADK 双模式回归）
- Plan 生成 → 确认 → Coordinator 执行 → 聚合汇总
- Plan 生成 → 确认 → DAG 执行 → 聚合汇总
- agent_status SSE 事件推送
- 多 Agent sender 区分
- DAG 数据查询
- Plan B2 降级（`AGENTHUB_WORKFLOW_MAX_CONCURRENCY=1`）

## 预期交付物

- `backend/app/services/adk/merge_aggregator.py`（新建，~150 行）
- `backend/app/services/adk/execution_tracer.py`（修改，新增 `capture_edges` + 增强 `get_dag_data`）
- `backend/app/api/v1/orchestrator.py`（新建）
- `backend/app/schemas/orchestrator.py`（修改，新增 DagNode/DagEdge/DagResponse）
- `backend/app/api/router.py`（修改，注册 orchestrator 路由）
- `backend/app/api/v1/conversations.py`（修改，注入 MergeAggregator + tracer.capture_edges + dag_data 落库）

## 风险与降级

- 子 Agent 输出过大 → 截取前 300 字符为摘要，完整内容通过 output_message_id 查 messages 表
- 冲突检测规则过于简单（初版仅同 outputKey 不同值） → 后续可升级为 LLM 驱动的冲突仲裁
- 若子 Agent 全部失败（无 output_message_id） → MergeAggregator 仅输出失败摘要，不生成汇总 artifact
- DAG 端点数据不完整（Workflow 执行失败无 edges） → 从 `OrchestratorTask.plan.subtasks[].depends_on` 兜底重建拓扑
