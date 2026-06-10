# 群聊 Orchestrator 模型参数传递修复 — 实施总结

**日期**: 2026-06-02  
**关联计划**: `vibeCodingPlan/群聊Orchestrator模型参数传递修复.md`

---

## 问题

群聊模式下，前端选择 Agent 作为 Planner 后，后端未使用选定 Agent 的模型进行任务规划，走了内置 DeepSeek 降级策略。根因是 `planner_agent_id` 在多层传递链路中存在丢失路径。

---

## 修改清单

### Bug 1（主因）：`plannerAgentIdRef` 通过 `useEffect` 异步同步导致竞态

**文件**: `agenthub-web/src/components/layout/ChatArea.tsx`

| 改动 | 说明 |
|------|------|
| 移除 `useEffect(() => { plannerAgentIdRef.current = plannerAgentId; }, [plannerAgentId])` | 消除异步同步的竞态窗口 |
| `Select.onChange` 中同步更新 ref | `plannerAgentIdRef.current = value`，立即生效 |
| 3 处 `createSSEStream()` 调用增加第5参数 `plannerAgentIdRef.current` | reconnect / main-send / confirm-plan 三条路径全部透传 |

### Bug 2：`refine_plan` 后端忽略 `planner_agent_id`

**文件**: `backend/app/api/v1/messages.py`

| 改动 | 说明 |
|------|------|
| `refine_plan` 分支新增 `data.planner_agent_id` 处理 | 若用户修改 Planner 选择则更新 `task.planner_agent_id`；校验 Agent 存在性 |

### Bug 3：SSE 流链路缺少 `planner_agent_id`

**文件**:

| 文件 | 改动 |
|------|------|
| `agenthub-web/src/lib/sse.ts` | `createSSEStream()` 增加 `plannerAgentId` 参数 → URL query string |
| `backend/app/api/v1/conversations.py` | `stream_conversation` 端点接收 `planner_agent_id` query param；`_orchestrator_plan_stream` / `_orchestrator_refine_stream` 增加 `planner_agent_id_fallback` 参数，作为 DB 查询的 fallback |

---

## 防御性增强

### Planner Agent 工具清理

**文件**: `backend/app/services/adk/planner.py`

| 改动 | 说明 |
|------|------|
| `_plan_with_agent()` 增加 `agent.tools = []` | 防止 Agent 工具干扰规划任务 |
| `_refine_with_agent()` 增加 `agent.tools = []` | 同上 |

### 诊断日志

**文件**:

| 文件 | 改动 |
|------|------|
| `backend/app/main.py` | 新增 `logging.basicConfig(level=INFO)`，使应用层日志可见 |
| `backend/app/services/adk/planner.py` | `plan()` / `refine()` 增加分支日志：`agent-based` vs `built-in orchestrator` |
| `backend/app/services/adk/models.py` | `get_deepseek_llm()` 增加模型解析日志 + DeepSeek API Key/Base URL 配置支持 |

---

## 验证结果

群聊中不选 Planner Agent（默认），日志输出：

```
INFO [agenthub.planner] Orchestrator LLM resolved: deepseek/deepseek-v4-pro
INFO [agenthub.planner] Planner mode: built-in orchestrator | model=deepseek/deepseek-v4-pro
INFO [LiteLLM] LiteLLM completion() model= deepseek-v4-pro; provider = deepseek
```

确认默认 Orchestrator 使用 DeepSeek V4 Pro 模型。选取 Agent 做 Planner 后日志将切换为 `agent-based`。

---

## 涉及文件总览

```
agenthub-web/src/
├── components/layout/ChatArea.tsx    ← Bug 1 核心修复
└── lib/sse.ts                       ← Bug 3 前端侧

backend/app/
├── main.py                          ← 日志配置
├── api/v1/
│   ├── conversations.py             ← Bug 3 后端侧
│   └── messages.py                  ← Bug 2
└── services/adk/
    ├── planner.py                   ← 防御性 + 诊断日志
    └── models.py                    ← 诊断日志 + DeepSeek 凭证
```
