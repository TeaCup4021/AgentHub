# AgentHub-群聊模式 Agent 依次回复修复 — 实施总结

**日期**: 2026-06-02
**关联计划**: `vibeCodingPlan/AgentHub-前后端-DayXX-群聊模式Agent依次回复修复.md`

---

## 问题

群聊模式下多个 Agent 并行执行，SSE 输出交织混乱，无法像群聊成员一样依次回复各自的产出。

## 根因

问题链跨越 Backend SSE 层和 Frontend 流式状态管理两层：

| 层 | 根因 |
|----|------|
| **ADKToSSETranslator** | 无缓冲层，ADK 并行事件直通 SSE，多 Agent token 交织 |
| **ChatArea** | `streamMsgIdRef` 只有一个 ref，被后续 Agent 覆盖 |
| **chatStore** | `finalizeStreaming` 全局设 `isStreaming: false`，杀死未完成的流 |
| **MessageList** | 只渲染一个 `StreamingMessageBubble` |

## 方案

**不牺牲并行执行性能**，在 SSE 输出管道加一层 `StreamSequentializer`：

```
ADK Workflow (并行，不改)
  → StreamSequentializer (活跃穿透 + 非活跃暂存)
    → SSE (顺序化)
      → Frontend (基本不改)
```

- **活跃 Agent**：事件实时穿透，保持流式体验
- **非活跃 Agent**：事件暂存 buffer
- **切换时**：回放缓冲事件（已完成的瞬间输出）+ 后续事件实时穿透

## 修改清单

### Backend — 3 个文件 + 1 个新文件

| 文件 | 改动 |
|------|------|
| `backend/app/services/adk/stream_sequentializer.py` | **新增**: StreamSequentializer 类（活跃穿透 + 暂存切换） |
| `backend/app/services/adapters/adk_to_sse.py` | `__init__` 新增 `sequential` + `agent_order` 参数；`translate()` 注入 Sequentializer |
| `backend/app/api/v1/conversations.py` | `_dag_workflow_stream` 和 `_coordinator_stream` 启用 `sequential=True`；新增 `_build_agent_order()` |

### Frontend — 2 个文件（防御性修复）

| 文件 | 改动 |
|------|------|
| `agenthub-web/src/stores/chatStore.ts` | `finalizeStreamingMessage` 不再全局 `isStreaming: false`；新增 `stopAllStreaming` |
| `agenthub-web/src/components/layout/ChatArea.tsx` | `handleStop` 和会话切换用 `stopAllStreaming` |

### 不需要改的文件

- `WorkflowBuilder` — 保持并行执行
- `Planner` — 不改 prompt
- `MessageList` — 单气泡够用

## 测试

**StreamSequentializer 单元测试 5/5 通过** (`backend/tests/test_stream_sequentializer.py`)：

| 测试 | 场景 |
|------|------|
| 无 agent_order → 穿透 | 事件原样输出 |
| 顺序到达 → 实时穿透 | 活跃 Agent 流式体验 |
| 交织到达 → 解交织 | A/B/C 事件交织，按 plan 顺序输出 |
| 早完成 → 缓冲回放 | B 在 A 完成前跑完，A 结束→回放 B |
| 非 plan agent → 穿透 | orchestrator 等不在 order 中，直接输出 |

**TypeScript 编译检查** — 通过 (`tsc --noEmit`)

## 关键设计决策

1. **StreamSequentializer 放在 ADKToSSETranslator 之前**（操作 ADK Event），而不是 SSE 字符串之后，避免解析 SSE 格式
2. **发言顺序 = Planner subtasks 数组顺序**，与用户看到的执行计划卡片一致
3. **非 plan 中的 Agent（如 orchestrator 汇总）直接穿透**，不阻塞
4. **前端不改流式追踪**，因为后端已保证同一时刻只有一个 Agent 在发射
