# 群聊模式重构计划

## 概述

重构群聊模式，实现：
1. 用户可指定某个 Agent 作为任务分配者（Planner）
2. 支持对话式修改执行计划
3. 执行模式自动路由：Agent 制定 → DAG 模式，LLM 制定 → Coordinator 模式
4. 执行时 Agent 像群聊成员一样依次输出

## 状态机

```
用户发送群聊消息
       │
       ├── planner_agent_id 已指定 → Agent-based Planning
       └── planner_agent_id 未指定 → Orchestrator (LLM) Planning
              │
              ▼
       status: "planning" → Planner 工作，流式输出
              │
              ▼
       status: "plan_draft" → 计划展示为特殊消息
              │
              ├── 用户发消息修改 → mode="refine_plan"
              │        │
              │        ▼
              │   status: "refining" → Planner 调整计划
              │        │
              │        ▼
              │   status: "plan_draft" → 新计划展示（可继续迭代）
              │
              └── 用户点击"确认执行" → mode="confirm_plan"
                       │
                       ▼
                status: "confirmed"
                       │
                       ├── planner_agent_id 存在 → DAG 模式
                       └── planner_agent_id 不存在 → Coordinator 模式
                              │
                              ▼
                       status: "completed"
```

## 修改清单

### Backend

| # | 文件 | 改动 |
|---|------|------|
| 1 | `backend/app/schemas/message.py` | MessageCreate 新增 planner_agent_id，mode 新增 refine_plan |
| 2 | `backend/app/schemas/orchestrator.py` | 新增 PlanStatus，OrchestratorPlan 新增 planner 字段 |
| 3 | `backend/app/models/orchestrator_task.py` | 新增 planner_agent_id 列 |
| 4 | `backend/app/api/v1/messages.py` | 处理 planner_agent_id 保存 + refine_plan 模式 |
| 5 | `backend/app/api/v1/conversations.py` | 新增 _orchestrator_refine_stream + 修改执行路由 |
| 6 | `backend/app/services/adk/planner.py` | 支持 Agent Planner + refine() 方法 |

### Frontend

| # | 文件 | 改动 |
|---|------|------|
| 7 | `agenthub-web/src/types/chat.ts` | 新增 planner_agent_id 等类型字段 |
| 8 | `agenthub-web/src/stores/chatStore.ts` | 新增 planRefining 状态 |
| 9 | `agenthub-web/src/components/chat/OrchestratorPlan.tsx` | 显示 Planner 来源 + 对话修改 |
| 10 | `agenthub-web/src/components/layout/ChatArea.tsx` | Planner 选择器 + 计划修改流程 |
