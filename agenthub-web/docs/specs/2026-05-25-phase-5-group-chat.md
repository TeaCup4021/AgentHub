# Spec: Phase 5 — 群聊 + Orchestrator 多 Agent 协作

**日期**: 2026-05-25
**状态**: 待 review
**范围**: 仅前端，纯 UI 组件 + ChatArea 集成

## 1. 目标

实现群聊模式下多 Agent 协作的两个核心 UI 能力：
- **OrchestratorPlan 卡片**：展示 Orchestrator 拆分出的子任务计划，用户可确认或调整
- **AgentProgressBar**：实时显示各 Agent 的执行状态（排队/执行中/完成/失败/超时）

以及 ChatArea 集成：群聊自动切换 `auto_orchestrate` 模式 + 处理 `agent_status` SSE 事件。

## 2. 用户流程

```
1. 用户在群聊中输入消息并发送
2. POST /messages 携带 mode: "auto_orchestrate"
3. SSE 流返回 agent_status 事件 → AgentProgressBar 实时更新各 Agent 状态
4. 各 Agent 依次输出消息（现有 message_start → token → message_end 流程已支持）
5. 全部完成时进度条自动清空
```

> 注：Orchestrator 计划展示（步骤 3.5）依赖后端在 SSE 中返回 `orchestrator` sender_type 的计划消息。后端就绪前，OrchestratorPlan 卡片作为独立组件先行开发和导出，MessageList 在收到对应消息类型时渲染。

## 3. 组件设计

### 3.1 OrchestratorPlan

**位置**: `src/components/chat/OrchestratorPlan.tsx`

**职责**: 展示 Orchestrator 拆解出的子任务列表，每条子任务显示序号、指令描述、被指派 Agent。

**Props**:
```typescript
interface SubTask {
  agentId: string;
  agentName: string;
  instruction: string;
}

interface OrchestratorPlanProps {
  planId: string;
  subtasks: SubTask[];
  onConfirm: () => void;
  onAdjust: (subtasks: SubTask[]) => void;
}
```

**UI 规格**:
- 紫色调卡片（border-purple-200 / bg-purple-50），宽度 max-w-[75%] 居中
- 标题栏：图层图标 + "Orchestrator 任务拆解"
- 子任务列表：白色圆角行，左侧序号圆标 + 中间描述 + 右侧 @AgentName
- 底部两个按钮：「调整分派」(outline) 和「确认执行」(filled purple)

**边界情况**:
- 空 subtasks：不渲染此组件
- onConfirm / onAdjust 由父组件 ChatArea 提供具体逻辑（当前为占位回调）

### 3.2 AgentProgressBar

**位置**: `src/components/chat/AgentProgressBar.tsx`

**职责**: 紧凑横条，显示群聊中各 Agent 的当前执行状态。

**数据模型**:
```typescript
interface AgentProgress {
  agentId: string;
  agentName: string;
  status: "queued" | "running" | "success" | "failed" | "timeout";
  progress: number; // 0-100
}
```

**UI 规格**:
- 水平滚动横条（`overflow-x-auto`），位于 ChatHeader 和 MessageList 之间
- 每个 Agent 一项：彩色圆点(带 pulse 动画当 running) + 名称 + 状态标签 + 百分比(running 时)
- 颜色映射：queued=gray, running=blue+pulse, success=emerald, failed=red, timeout=yellow
- 状态文本：等待中/执行中/完成/失败/超时

**边界情况**:
- agents 为空：返回 null，不渲染
- 全部 success/failed 后自动清空（由 ChatArea 管理）

## 4. ChatArea 集成改造

### 4.1 mode 自动选择

```typescript
// 当前：hardcoded "direct"
mode: "direct"

// 改为：根据对话类型自动选择
const msgMode = conversation?.type === "group" ? "auto_orchestrate" : "direct";
```

### 4.2 agentStatuses 状态

```typescript
const [agentStatuses, setAgentStatuses] = useState<AgentProgress[]>([]);
```

- `onAgentStatus` 回调中 upsert：按 agentId 查找，找到则更新，否则追加
- `onMessageEnd` 回调中清理：全部 agent 为 success/failed 时清空数组

### 4.3 进度条渲染

在 ChatHeader 和 MessageList 之间：
```typescript
{conversation.type === "group" && (
  <AgentProgressBar agents={agentStatuses} />
)}
```

### 4.4 流切换时的状态重置

切换 activeId 时已有 `useEffect(() => { return () => disconnectRef.current?.(); }, [activeId])`，需同时清空 agentStatuses。

## 5. 已有基础设施（无需改动）

以下已在前序 Phase 中就位，Phase 5 直接使用：

| 能力 | 位置 | 状态 |
|------|------|------|
| `SSEAgentStatus` 类型 | `src/types/chat.ts:198-208` | ✅ |
| `onAgentStatus` SSE 回调 | `src/lib/sse.ts:41` | ✅ |
| `SendMessageRequest.mode` 字段 | `src/lib/api.ts:125` | ✅ |
| `Conversation.type` 字段 | `src/types/chat.ts:77` | ✅ |
| SSE agent_status 事件解析 | `src/lib/sse.ts:79-86` | ✅ |

## 6. 涉及文件

| 文件 | 操作 | 内容 |
|------|------|------|
| `src/components/chat/OrchestratorPlan.tsx` | 新建 | 子任务计划卡片 |
| `src/components/chat/AgentProgressBar.tsx` | 新建 | 多 Agent 进度条 |
| `src/components/layout/ChatArea.tsx` | 修改 | 集成 agent_status + 群聊 mode |
| `src/components/chat/index.ts` | 可能修改 | 新增 barrel 导出 |

## 7. 验收标准

- [ ] `npx tsc -b --noEmit` 零错误
- [ ] OrchestratorPlan 在传入 subtasks 时正确渲染所有子任务
- [ ] AgentProgressBar 正确显示各 status 的颜色和动画
- [ ] 群聊发送消息时请求携带 `mode: "auto_orchestrate"`
- [ ] 单聊发送消息时请求携带 `mode: "direct"`（不回退）
- [ ] agent_status SSE 事件正确更新进度条状态
- [ ] 全部 Agent 完成后进度条自动清空
- [ ] 切换会话时清空进度条状态

## 8. 不在此范围

- Orchestrator 计划确认/调整的后端 API（待后端就绪后对接）
- @mention 自动补全（Phase 6）
- 群聊创建入口的 UI 改造（Phase 4 Agent 管理的扩展）
- OrchestratorPlan 在 MessageList 中的实际渲染位置（需等后端协议确定）
