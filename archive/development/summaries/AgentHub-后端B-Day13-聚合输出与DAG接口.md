# AgentHub 后端 B - Day 13 (聚合输出与 DAG 接口) 进度总结

## 1. 环境变更与基础设施
- **依赖引用**：无新增 Python 包；所有新增模块均使用已有依赖（SQLAlchemy、Pydantic、ADK 2.0）
- **数据库迁移**：无需新增 migration。`orchestrator_tasks.result_summary` JSONB 列已在 Day 1 建表，增量的 `dag_data` 字段写入该列
- **项目结构**：
  - `backend/app/services/adk/merge_aggregator.py`（新建）— MergeAggregator 类 + SubAgentSummary / MergeResult dataclass (~140 行)
  - `backend/app/services/adk/execution_tracer.py`（修改）— 新增 `capture_edges()` 方法 + 增强 `get_dag_data()` 自动使用已捕获的 edges
  - `backend/app/api/v1/orchestrator.py`（新建）— DAG 数据端点路由 (~95 行)
  - `backend/app/schemas/orchestrator.py`（修改）— 新增 DagNode、DagEdge（`from`/`to` alias）、DagResponse
  - `backend/app/api/router.py`（修改）— 注册 orchestrator 路由（prefix="/v1/orchestrator"）
  - `backend/app/api/v1/conversations.py`（修改）— 新增 `_run_merge_aggregator()` 辅助函数；`_coordinator_stream` 末尾注入 MergeAggregator + dag_data 落库；`_dag_workflow_stream` 末尾注入 `tracer.capture_edges(workflow.edges)` + MergeAggregator + dag_data 落库

## 2. 当前项目进度与测试结果

### 完成的 4 个模块

| # | 模块 | 说明 |
|---|------|------|
| 1 | MergeAggregator | `aggregate(db, orch_task_id)` — 查 OrchestratorSubtask 行 → 通过 output_message_id 查子 Agent 输出 → 截取前 300 字符为摘要 → 冲突检测（同一 outputKey 多个 Agent 输出不一致） → 生成 Markdown 汇总文本（表格 + 依赖链 + 冲突说明）。输出写入 messages 表（sender_type="orchestrator"）+ artifacts 表（artifact_type="orchestrator_summary"） |
| 2 | DAG 数据接口 | `GET /api/v1/orchestrator/tasks/{task_id}/dag` — 优先从 `result_summary.dag_data` 读取持久化数据，兜底从 plan + subtask 行重建。返回 `{ taskId, status, nodes: [{subtaskId, agentId, agentName, instruction, status, latencyMs, outputMessageId}], edges: [{from, to}] }` |
| 3 | ExecutionTracer 增强 | `capture_edges(edges)` — 从 ADK Workflow.edges 捕获原生 DAG 拓扑（取消 DAGBuilder 自研组件）；`get_dag_data()` 增强：自动组合已捕获的 edges + records 生成完整 `{nodes, edges}` JSON |
| 4 | 执行流注入 | `_coordinator_stream` / `_dag_workflow_stream` 末尾：tracer.capture_edges() → MergeAggregator.aggregate() → 写入 orchestrator 汇总消息 + artifact → dag_data 序列化到 result_summary → 更新 task.status="completed" |

### API 路由（当前全部端点）

```
GET  /v1/health
GET  /v1/conversations
POST /v1/conversations
PATCH  /v1/conversations/{conv_id}
DELETE /v1/conversations/{conv_id}
GET  /v1/conversations/{conv_id}
POST /v1/conversations/{conv_id}/pins
DELETE /v1/conversations/{conv_id}/pins/{message_id}
GET  /v1/conversations/{conv_id}/stream
GET  /v1/agents/capabilities
GET  /v1/agents
GET  /v1/agents/{agent_id}
POST /v1/agents
PATCH  /v1/agents/{agent_id}
DELETE /v1/agents/{agent_id}
POST /v1/agents/verify
GET  /v1/conversations/{conv_id}/messages
POST /v1/conversations/{conv_id}/messages
POST /v1/messages/{message_id}/regenerate
GET  /v1/messages/{message_id}/artifacts
GET  /v1/orchestrator/tasks/{task_id}/dag          ← NEW
```

### 测试结果

```
tests/services/test_execution_tracer.py::TestCaptureEdges::test_capture_edges_from_objects PASSED
tests/services/test_execution_tracer.py::TestCaptureEdges::test_capture_edges_empty PASSED
tests/services/test_execution_tracer.py::TestCaptureEdges::test_get_dag_data_with_records PASSED
tests/services/test_execution_tracer.py::TestCaptureEdges::test_get_dag_data_combines_edges_and_records PASSED
tests/services/test_execution_tracer.py::TestCaptureEdges::test_get_dag_data_with_null_times PASSED
tests/services/test_execution_tracer.py::TestCaptureEdges::test_edges_parameter_overrides_captured PASSED
tests/services/test_merge_aggregator.py::TestMergeAggregatorUnit::test_empty_plan_returns_empty_result PASSED
tests/services/test_merge_aggregator.py::TestMergeAggregatorUnit::test_summary_text_includes_table_rows PASSED
tests/services/test_merge_aggregator.py::TestMergeAggregatorUnit::test_summary_text_shows_dependency_chain PASSED
tests/services/test_merge_aggregator.py::TestMergeAggregatorUnit::test_summary_includes_conflict_section_when_present PASSED
tests/services/test_merge_aggregator.py::TestMergeAggregatorIntegration::test_no_task_returns_empty PASSED
tests/services/test_dag_schema.py::TestDagSchema::test_dag_edge_serializes_from_to PASSED
tests/services/test_dag_schema.py::TestDagSchema::test_dag_node_camelcase PASSED
tests/services/test_dag_schema.py::TestDagSchema::test_dag_node_optional_fields_none PASSED
tests/services/test_dag_schema.py::TestDagSchema::test_dag_response_full PASSED
tests/services/test_dag_schema.py::TestDagSchema::test_dag_edge_accepts_alias_in_constructor PASSED
tests/services/test_dag_schema.py::TestDagSchema::test_subtask_plan_unchanged PASSED
=== 22 new tests, 15 existing tests, all 37 PASSED ===
```

### 对齐约定文档更新
- **§35 DAG 数据接口**（新增）：`GET /api/v1/orchestrator/tasks/{task_id}/dag`，edges 来自 ADK Workflow.edges（原生 DAG 拓扑），nodes 来自 ExecutionTracer.records（计时数据），DAGBuilder 自研组件取消
- **§36 MergeAggregator 汇总产物**（新增）：`sender_type="orchestrator"` + `artifact_type="orchestrator_summary"`，artifact content 含 `sub_summaries` / `has_conflict` / `conflict_detail`

## 3. 下一步工作计划与要点分析
- **Day 14-16（阶段 4）**：ADK 容错降级（retry_config、error callback → SSE error 映射）、DAG 端点联调前端、MergeAggregator 冲突检测升级（LLM 驱动）
- **待联调验证（需要 ANTHROPIC_API_KEY）**：Coordinator 模式 + DAG 模式下 MergeAggregator 真实落库 → DAG 端点读取 `result_summary.dag_data` 返回
- **风险关注**：DAG 端点兜底路径（Workflow 执行失败 → 从 plan.depends_on 重建拓扑）尚未在真实 LLM 场景下验证
