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
    └─▶ _dag_workflow_stream (DAG 模式，2026-06-06 起为 confirmed 唯一路由)
            WorkflowBuilder.build(plan, edges)
            → ADK Workflow 按依赖图执行（无依赖并发、有依赖串行）
            → ADKToSSETranslator(sequential=False, agent_name_map)
              · 按 (invocation_id, author) 拆成「每 Agent 一条消息」
              · 跳过工作流自身 author（orchestrator_plan）
            → _update_subtask_metrics 回填 status/latency/output_message_id
            → _run_merge_aggregator: Orchestrator 模型读各 Agent 真实输出生成
              自然语言总结，作为最后一条流式回复（结构化指标降级为 artifact）
            → DAG data 持久化到 OrchestratorTask

（_coordinator_stream 暂保留为死代码，不再被路由引用）
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

- **DAG 模式**（`_dag_workflow_stream`）：2026-06-06 起为 `confirmed` 任务的唯一路由。
  按 Planner 拆出的依赖图执行——无依赖 subtask 并发并流式、有依赖的按 Edge 串行。
  详见 `decisions/002-group-chat-dag-execution.md`。
- **Coordinator 模式**（`_coordinator_stream`）：已不再被路由引用（死代码），确认稳定后可删。
- 单聊：Conversation 无 OrchestratorTask，直接通过 AgentAdapter 流式响应。

> 关键认知：ADK Workflow 把整张图所有 Agent 跑在**同一 invocation_id** 下，区分 Agent 靠 `author`。
> 排障见 `debug-group-chat-orchestration.md`。

## 异常处理

- `PLANNER_TIMEOUT`（默认 90s）→ 前端提示重试
- `PLANNER_ERROR` → 规划失败，修改需求重试
- `COORDINATOR_ERROR` → 执行失败
- 并发防护：`_planning_locks` set 防止同一 conversation 重复规划
