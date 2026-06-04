# 群聊编排流程

## 完整管线

```
用户 @mention 发送消息 (mode=auto_orchestrate)
    │
    ▼
创建 OrchestratorTask (status=planning)
    │
    ▼
GET /stream 触发 _orchestrator_plan_stream
    │
    ▼
OrchestratorPlanner.plan()
    ├── 读取 @mentions 或 ConversationParticipants
    ├── 调用 Planner LLM 拆解为 SubTask 列表
    └── 返回 OrchestratorPlan
    │
    ▼
SSE: message_start (meta.plan = [...])
SSE: token (逐字输出计划文本)
SSE: message_end (finish_reason=plan_draft)
    │
    ▼
前端展示计划 → 用户审视
    ├── 满意 → POST confirm_plan
    └── 不满意 → 输入修改反馈 (mode=refine_plan)
                     │
                     ▼
                 OrchestratorPlanner.refine()
                 SSE: plan_draft → 用户再审
    │
    ▼
confirm_plan → task.status = confirmed
    │
    ▼
GET /stream 检测 confirmed task
    │
    ├─▶ _coordinator_stream (Coordinator 模式)
    │       CoordinatorBuilder.build()
    │       → 协调者 LLM 动态分派 request_task_<name>
    │       → ADKToSSETranslator (sequential mode)
    │       → MergeAggregator 汇总
    │       → SSE 流到前端
    │
    └─▶ _dag_workflow_stream (DAG 模式)
            WorkflowBuilder.build(plan, edges)
            → ADK Workflow 按依赖顺序执行
            → ADKToSSETranslator (sequential mode)
            → MergeAggregator 汇总
            → DAG data 持久化到 OrchestratorTask
```

## 关键文件

| 组件 | 文件 |
|------|------|
| Planner | `services/adk/planner.py` |
| Coordinator 构建 | `services/adk/coordinator_builder.py` |
| DAG Workflow 构建 | `services/adk/workflow_builder.py` |
| 执行追踪 | `services/adk/execution_tracer.py` |
| 顺序化输出 | `services/adk/stream_sequentializer.py` |
| 结果汇总 | `services/adk/merge_aggregator.py` |
| SSE 翻译 | `services/adapters/adk_to_sse.py` |
| 流式路由 | `api/v1/conversations.py:_orchestrator_plan_stream` et al. |

## 执行模式选择

- **Coordinator 模式**：目前是 `stream_conversation` 中 `confirmed` 任务的唯一路由
- **DAG 模式**：`_dag_workflow_stream` 已实现但当前未在路由中使用（历史代码，可做备选）
- 单聊：Conversation 无 OrchestratorTask，直接通过 AgentAdapter 流式响应

## 异常处理

- `PLANNER_TIMEOUT`（默认 90s）→ 前端提示重试
- `PLANNER_ERROR` → 规划失败，修改需求重试
- `COORDINATOR_ERROR` → 执行失败
- 并发防护：`_planning_locks` set 防止同一 conversation 重复规划
