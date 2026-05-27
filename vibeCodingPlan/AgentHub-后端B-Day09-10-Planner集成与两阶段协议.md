# AgentHub 后端B Day09-10 实施计划 - Planner 集成与两阶段协议

日期：2026-05-27

## 目标
- **Day 09**：ADK BuiltInPlanner 拆解意图 → SSE 流式输出计划（`message_start → token → message_end: plan_draft`）→ Plan JSON 落库
- **Day 10**：`POST /messages` (`mode=confirm_plan`) 接收确认/调整 → 更新 Workflow → state_delta 状态推进

## 输入与约束
- 参照 `AgentHub-后端开发20天实施计划.md` Day 9-10（第 217-234 行）
- 参照 `AgentHub-前后端接口契约-v2.md` §3.1（mode/plan_id/plan 字段）、§6.2（message_start.meta.plan）、§6.3（Orchestrator SSE 时序）
- Plan JSON 格式：`{ "subtasks": [{ "subtaskId", "agentId", "agentName", "instruction" }] }`，`subtask_id` 由后端 uuid4() 生成
- SSE `message_start.meta.plan` 格式对齐契约 v2 第 525-537 行

## 数据流

```
Day 09: 计划生成（SSE 流式）
═══════════════════════════════════════
POST /messages (mode=auto_orchestrate)
  ├─ MessageService.create_message() → user_msg
  └─ 创建 OrchestratorTask(status="planning") → 返回 user_msg

GET /stream
  ├─ 检测 OrchestratorTask(status="planning")
  ├─ OrchestratorPlanner.plan()
  ├─ SSE 流式输出: message_start(orchestrator, meta.plan) → token → message_end(plan_draft)
  └─ 落库: orchestrator Message + plan Artifact + 更新 OrchestratorTask

Day 10: 确认执行
═══════════════════════════════════════
POST /messages (mode=confirm_plan, plan_id, plan)
  ├─ 查 OrchestratorTask(status="awaiting_confirmation")
  ├─ 比对/更新 plan → 重建 Workflow
  ├─ status → "confirmed" + state_delta
  └─ 返回 { code: 200, data: null, message: "ok" }
```

## 实施步骤

### Step 1: Schema 定义
- 新建 `schemas/orchestrator.py`：`SubTaskPlan`（subtask_id, agent_id, agent_name, instruction）、`OrchestratorPlan`
- 修改 `schemas/message.py`：`MessageCreate` 新增 `plan_id`、`plan` 字段

### Step 2: ADK Planner + Workflow 服务
- 新建 `services/adk/planner.py`：`OrchestratorPlanner.plan()` — BuiltInPlanner → JSON 提取 → 补全 subtask_id
- 新建 `services/adk/workflow_builder.py`：`WorkflowBuilder.build(plan) → Workflow`
- 修改 `services/adk/runner.py`：新增 `run_single_turn()` 方法

### Step 3: messages 端点（Day 09 + Day 10）
- 修改 `api/v1/messages.py` `create_message`：
  - `auto_orchestrate` → MessageService 返回后 → 创建 OrchestratorTask(status="planning") → 返回 user_msg
  - `confirm_plan` → 提前拦截 → 查 task → 补全 agent_name → 更新 plan + 重建 Workflow → status → "confirmed" → 返回 JSONResponse

### Step 4: SSE Plan 流（Day 09）
- 修改 `api/v1/conversations.py` `stream_conversation`：
  - 检测 OrchestratorTask(status="planning") → `_orchestrator_plan_stream`
  - 新协程：查 user_msg + mentions → Planner → **先 commit 落库** → SSE 输出 message_start(meta.plan) → token → message_end(plan_draft)

### Step 5: 导出与验证
- 更新 `services/adk/__init__.py`
- 验证：导入检查、camelCase、swagger、单聊不破坏

## 预期交付物
- `backend/app/schemas/orchestrator.py`（新建）
- `backend/app/schemas/message.py`（修改）
- `backend/app/services/adk/planner.py`（新建）
- `backend/app/services/adk/workflow_builder.py`（新建）
- `backend/app/services/adk/runner.py`（修改）
- `backend/app/api/v1/messages.py`（修改）
- `backend/app/api/v1/conversations.py`（修改）

## 风险与降级
- LLM 调用耗时 → SSE 流式输出让用户看到进度
- JSON 解析失败 → 正则提取 + 单任务 fallback
- 中文 token 拆分 → 按字符拆分
