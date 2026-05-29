# 群聊前后端集成 — Bug 排查报告 (2026-05-30)

明天进行群聊前后端接口对接，以下为全链路代码审查发现的全部问题。

---

## 🔴 P0 — 阻塞集成

### 1. Mock SSE `agent_status` 的 subtask_id 每个事件独立生成

**文件**: `src/mocks/sse.ts` 第 147 行  
**现象**: 4 个 agent_status 事件 (queued→running→running→success) 各自调用 `generateId()`，每个事件的 `subtask_id` 不同  
**影响**: 后端真实 SSE 同一 Agent 的整个生命周期共享一个 `subtask_id`，前端 mock 行为不一致，agent_status 生命周期跟踪逻辑可能无法正确测试  
**修复**: 在 forEach 循环开始时为每个 Agent 预生成 `const subtaskId = "sub-${generateId()}"`，4 个事件共用

### 2. Mock SSE 不支持 Orchestrator Plan 流程

**文件**: `src/mocks/sse.ts` 第 125-136 行  
**现象**: 群聊模式 `message_start` 的 `sender.type = "orchestrator"` 但缺少 `meta.plan` 字段，`finish_reason` 固定为 `"completed"` 而非 `"plan_draft"`  
**影响**: Orchestrator 的第一阶段（生成计划→用户确认）在 Mock 模式完全无法测试，`pendingPlan` 永远不会被设置  
**修复**: 群聊模式下先发送带 `meta.plan` 的消息流→ `message_end(finish_reason="plan_draft")`，用户确认后再发真正的执行流

### 3. Mock SSE `sendEvent` 缺少 `error` 事件类型

**文件**: `src/mocks/sse.ts` 第 75-96 行  
**现象**: sendEvent 的 switch 只处理 message_start/token/artifact/agent_status/thinking/message_end，无 error 分支  
**影响**: Mock 模式无法模拟 SSE error 事件（如 `PLANNER_ERROR`/`COORDINATOR_ERROR`），错误处理代码无法在 Mock 下测试  
**修复**: 添加 `case "error": callbacks.onError?.(data as SSEError); break;`

### 4. `handleStop` 和 `onError` 未清除 `dagTaskId`

**文件**: `src/components/layout/ChatArea.tsx` 第 203-206 行 + 第 505-517 行  
**现象**: 停止流式或 SSE 出错后，`dagTaskId` 不清零，agentStatuses 不清零  
**影响**: 群聊中断后再发消息，ReActPanel 可能仍显示旧的任务图  
**修复**: handleStop 和 onError 中加 `setDagTaskId(null)` + `clearAgentStatuses()`

### 5. 中文输入法 Enter 键误发送

**文件**: `src/components/chat/ChatInput.tsx` 第 224-227 行  
**现象**: `keyDown` 事件未处理 `compositionstart`/`compositionend`，中文输入法选词过程中的 Enter 直接发送消息  
**影响**: 群聊场景频繁 @提及中文名 → 输入法选词 → 消息被截断发送  
**修复**: 添加 `isComposing` ref，compositionstart=true / compositionend=false，keyDown 中 isComposing 时跳过 Enter

---

## 🟡 P1 — 集成前建议修复

### 6. Orchestrator 消息的 Token 用量模型查找失败

**文件**: `src/components/layout/ChatArea.tsx` 第 198 行  
**现象**: `agents.find((a) => a.id === streamSenderIdRef.current)?.model` — 群聊时 sender_id 为 `"orchestrator"`，不在 agents 列表中，model 为 undefined，cost 使用默认值  
**影响**: Orchestrator 本身产生的 token 用量无法按模型计价  
**修复**: cost 估算保留 undefined 回退逻辑即可（当前已有默认值），不影响功能

### 7. `buildCallbacks` 闭包过时问题

**文件**: `src/components/layout/ChatArea.tsx` 第 125-207 行  
**现象**: `buildCallbacks` 的依赖数组包含 `initStreaming`/`appendToken` 等 Zustand selector，但 `planMetaRef`/`streamMsgIdRef`/`streamAgentRef` 是 ref，不过时。而 `agents` 不在依赖中  
**影响**: `onMessageEnd` 中 model 查找使用的是 `buildCallbacks` 创建时的 `agents` 快照，如果 Agent 列表在流式期间更新（创建/删除 Agent），model 查找可能过时  
**修复**: 🟢 极端场景，实际中 Agent 列表不会在流式期间变动

### 8. Mock SSE 群聊模式没有 `plan_draft` 分阶段

**文件**: `src/mocks/sse.ts` 组消息 message_end 第 390 行  
**现象**: `finish_reason` 固定 `"completed"`，与后端 Orchestrator 实际流程的 `"plan_draft"` → confirm → `"completed"` 两阶段不一致  
**影响**: 前端 plan 确认流程 (OrchestratorPlan 组件) 无法在 Mock 下端到端测试  
**修复**: 与问题 #2 同一修复

### 9. `activeId` 切换时 dashboardStore 状态不完全清理

**文件**: `src/components/layout/ChatArea.tsx` 第 102-123 行  
**现象**: activeId 变化的 useEffect 调了 `clearAgentStatuses()` 和 `setDagTaskId(null)`（T8 已加），但 `dashboardOpen` 状态未关闭  
**影响**: 切换会话后 Agent 仪表板可能仍打开但显示空数据  
**修复**: 加 `setDashboardOpen(false)`

### 10. SSE 重连时 `buildCallbacks` 重建不包含 `planMetaRef` 已有值

**文件**: `src/components/layout/ChatArea.tsx` 第 309 行  
**现象**: 重连时 `planMetaRef.current` 可能保留旧值，新连接的 `message_start` 覆盖 `planMetaRef`，但如果新连接直接发 `token` 而不先发 `message_start`（异常情况），旧 plan 数据残留在内存  
**影响**: 🟢 极端异常场景，正常 SSE 协议保证 message_start 先于 token

---

## 🟢 P2 — 代码质量

### 11. 卡片组件类型断言

**文件**: `src/components/cards/` 下 5 个文件  
**现象**: 每个卡片用 `as unknown as XxxContent` 强转 artifact.content  
**影响**: 类型不安全，若后端改字段名，编译期无法发现  
**建议**: 后续用 discriminated union 重构 Artifact 类型

### 12. 暗色模式 CSS 变量不完整

**文件**: `src/App.tsx`  
**现象**: `lightColors` 定义了完整 token，暗色模式依赖 Semi UI 默认值，与项目自定义变量存在冲突  
**影响**: 暗色模式下部分区域颜色异常  
**建议**: 补全 `darkColors` 对象

---

## 集成测试 Checklist

| # | 测试项 | Mock 可测？ |
|---|-------|:--:|
| 1 | 创建群聊对话（选 2+ Agent） | ✅ |
| 2 | 群聊发送消息 → SSE 流式返回（orchestrator 身份） | ✅ |
| 3 | agent_status 事件正确更新仪表板 | ✅ |
| 4 | task_id 捕获 → ReActPanel 显示"任务图"tab | ✅ |
| 5 | DAG 拓扑图渲染（节点+连线） | ✅ |
| 6 | Orchestrator Plan 生成 → 用户确认 → 执行 | ❌ Mock 不支持 |
| 7 | SSE 断连重试（3 次指数退避） | ✅ (sessionStorage mock_fail_mode=sse_disconnect) |
| 8 | 停止流式 → 状态完全清理 | ✅ |
| 9 | 切换会话 → dagTaskId/agentStatuses 清理 | ✅ |
| 10 | 中文输入法 @提及 → Enter 不误发 | ✅ |
| 11 | 消息过滤 senderType=senderId | ✅ |

---

## 修复优先级

```
明天集成前必做：🔴 #1 #2 #3 #4 #5
集成后尽快做：🟡 #6 #9
后续迭代：    🟢 #11 #12
```
