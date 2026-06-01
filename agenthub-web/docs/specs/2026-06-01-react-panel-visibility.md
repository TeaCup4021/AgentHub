# Spec: ReAct 面板可见性与状态回溯

**日期**: 2026-06-01  
**状态**: review  
**关联**: ReActPanel 常驻、关闭后重开入口、AgentProgressBar 常驻、dagTaskId 不清空

---

## 动机

当前 ReActPanel 和 AgentProgressBar 在流式结束后立即消失，用户来不及查看推理过程和任务图。dagTaskId 和 agentStatuses 在流式结束时被清空，导致历史状态无法回溯。

## 设计目标

1. ReActPanel 默认常驻，流式结束后不消失，用户手动关闭
2. 关闭后提供两个重开入口：ChatHeader 状态浮标 + summary 消息气泡上的"查看任务图"
3. dagTaskId 和 agentStatuses 流式结束后保留，切换会话时才清空
4. AgentProgressBar 执行完成后保持可见

## 交互流程

### 面板生命周期

```
用户发送消息
  → SSE 返回 thinking 步骤
    → ReActPanel 出现（ReAct 标签，步骤实时更新）
    → AgentProgressBar 出现（agent 状态实时更新）
  → SSE 返回 agent_status
    → AgentProgressBar 更新
  → SSE 返回 message_end
    → ReActPanel 保持可见，不消失
    → AgentProgressBar 保持可见，agent 状态为 completed/failed
    → ChatHeader 旁出现状态浮标
  → 用户点 × 关闭面板
    → 面板隐藏，浮标保留
  → 用户点浮标
    → ReActPanel 重新打开
  → 用户切换会话
    → ReActPanel 关闭、浮标消失、状态清空
```

### 状态浮标

```
┌──────────────────────────────┐
│ ChatHeader              [●] │  ← 小绿点/蓝点浮标
└──────────────────────────────┘
```

- 无任务时：不显示
- 执行中：蓝色脉冲点 + "执行中 (2/3)"
- 全部完成：绿色点 + "3 个任务已完成"
- 有失败：橙色点 + "2/3 完成，1 失败"
- 点击：打开 ReActPanel

## 改动范围

### ReActPanel.tsx

| 改动 | 说明 |
|------|------|
| `visible` 条件 | 去掉 `|| isStreaming`，内容 > 0 且未手动关闭就显示 |
| 新增 `closed` 状态 | 存储用户手动关闭的 panel id，用于判断是否重新打开 |

### ChatArea.tsx

| 改动 | 说明 |
|------|------|
| `onMessageEnd` | 去掉 `clearAgentStatuses()`，不去掉 `setDagTaskId(null)` |
| `useEffect([activeId])` | 保留 `clearAgentStatuses()` 和 `setDagTaskId(null)`，切换会话时清 |
| `handleConfirmPlan` 等 | 执行完成后的 summary 消息保留 dagTaskId |

### ChatHeader.tsx

| 改动 | 说明 |
|------|------|
| 新增 prop `taskSummary` | 接收 { total, completed, failed, hasDag } 状态 |
| 渲染浮标按钮 | 根据 taskSummary 决定是否显示 |

### MessageList.tsx / MessageBubble

| 改动 | 说明 |
|------|------|
| Summary 消息 | 当 meta.summary 存在且 dagTaskId 有值时，显示"查看任务图"链接 |
| 点击行为 | 触发 window event 或回调打开 ReActPanel 的 DAG 标签 |

### dashboardStore.ts / chatStore.ts

| 改动 | 说明 |
|------|------|
| dagTaskId 不清空 | 去掉流式结束时的清理调用 |
| agentStatuses 不清空 | 仅在切换会话时 clear |

## 非目标

- 不改 DAG 图本身的渲染方式（那属于 Spec 2）
- 不改 OrchestratorPlan 的 UI（那属于 Spec 3）
- 不持久化 ReAct 历史到 localStorage

## 验收标准

1. 流式结束后 ReActPanel 保持可见，不会自动消失
2. AgentProgressBar 执行完成后保持可见
3. ChatHeader 旁浮标正确显示任务完成状态
4. 点击浮标可重新打开 ReActPanel
5. 切换会话时状态正确清空
6. `npx tsc -b --noEmit` 零错误
7. `npx vitest run` 全部通过
