# AgentHub 后端B Day09-10 完成总结 - Planner 集成与两阶段协议

日期：2026-05-27

## 1. 环境变更与基础设施
- **依赖引用**：无新增 Python 包；ADK BuiltInPlanner / AnthropicLlm 均为 google-adk 2.0.0 已有
- **数据库迁移**：新增 `f72b69d795df`，将 `orchestrator_tasks.status` 和 `orchestrator_subtasks.status` 从 `VARCHAR(20)` 扩为 `VARCHAR(50)`
- **项目结构**：
  - `backend/app/schemas/orchestrator.py`（新建）— SubTaskPlan (subtask_id: str)、OrchestratorPlan
  - `backend/app/schemas/message.py`（修改）— content 放松 + 新增 plan_id/plan 字段
  - `backend/app/services/message.py`（修改）— 业务层非空校验
  - `backend/app/services/adk/planner.py`（新建）— OrchestratorPlanner (BuiltInPlanner + JSON 提取 + subtask_id 生成)
  - `backend/app/services/adk/workflow_builder.py`（新建）— WorkflowBuilder
  - `backend/app/services/adk/runner.py`（修改）— 新增 run_single_turn()
  - `backend/app/api/v1/messages.py`（修改）— confirm_plan 提前拦截 + auto_orchestrate 创建 OrchestratorTask
  - `backend/app/api/v1/conversations.py`（修改）— SSE 流新增 _orchestrator_plan_stream；删除旧 confirm 端点
  - `backend/app/models/orchestrator_task.py`、`orchestrator_subtask.py`（修改）— status 列宽

## 2. 当前项目进度与测试结果
- **完成的接口**：
  - `POST /api/v1/conversations/{id}/messages` (mode=auto_orchestrate) — 创建 OrchestratorTask(status="planning")，不阻塞等待 Planner
  - `GET /api/v1/conversations/{id}/stream` — 检测 planning → Planner → SSE message_start(meta.plan) → token → message_end(plan_draft) → 落库
  - `POST /api/v1/conversations/{id}/messages` (mode=confirm_plan) — 查 task → 补全 agent_name → 重建 Workflow → status="confirmed" + state_delta
- **测试结果**：
  - 所有新模块导入通过，camelCase 序列化正确
  - auto_orchestrate：201 返回 user 消息 + OrchestratorTask(status="planning") 落库
  - SSE stream：正确检测 planning task → Planner 执行（无 API Key 时返回 SSE error 事件 + status="failed"）
  - confirm_plan：200 / 404 / 409 全部通过；plan 含 subtask_id + agent_name；state_delta 正确写入
  - 旧 `POST /orchestrator/confirm` 端点已删除

## 3. 测试中修复的问题
- `orchestrator_tasks.status` VARCHAR(20) → VARCHAR(50)（"awaiting_confirmation" 22 字符超长）
- `LlmAgent.name` 含连字符 → 替换为下划线（ADK 要求 Python 标识符）
- `Edge(from_node="START")` → `Edge(from_node=START)`（ADK 要求 BaseNode 实例）
- `SubTaskPlan.subtask_id` UUID → str（契约 v2 使用 "sub-1" 格式，非 UUID）

## 4. 下一步工作计划
- **数据库同步**：需执行 `alembic upgrade head` 应用 migration
- **依赖配置**：需设置 `ANTHROPIC_API_KEY` 环境变量才能完成 SSE plan 生成
- **下阶段开发**：Day 11-12 — Workflow 并发执行 + SSE 直推 + ExecutionTracer
