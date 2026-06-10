# Phase 8 — Agent 仪表盘

日期：2026-05-26 | 状态：待确认

---

## 1. 需求范围

### 1.1 AgentDashboard 可展开面板

在群聊 `AgentProgressBar` 下方增加可展开的详细面板。点击 ProgressBar 切换展开/收起。

面板展示内容：
- Agent 头像（首字母 + 渐变背景）
- Agent 名称 + 状态标签（排队中 / 执行中 / 已完成 / 失败 / 超时）
- 任务描述（可选文案）
- 执行进度百分比（运行中时显示）
- Token 消耗（可选数值）
- 执行耗时（XXms / X.Xs 格式）
- 委派层级缩进（预留字段，Mock 阶段均为 0 级）

### 1.2 dashboardStore 集中式状态管理

将 `agentStatuses` 从 ChatArea 本地 `useState` 迁移到 Zustand store：

- `dashboardOpen` / `toggleDashboard` / `setDashboardOpen` — 仪表盘展开/收起
- `agentStatuses` / `updateAgentStatus` / `clearStatuses` — Agent 状态列表
- `allDone()` — 检查是否所有 Agent 均已完成

### 1.3 ChatArea 重构

- 移除本地 `useState<AgentProgress[]>`
- 接入 `useDashboardStore`
- `AgentProgressBar` 添加点击事件（toggle dashboard）
- 在 ProgressBar 下方渲染 `AgentDashboard`

---

## 2. 用户流程

```
群聊发送消息
  → SSE 推送 agent_status 事件
  → AgentProgressBar 显示每个 Agent 的状态圆点 (queued → running → success)
  → 用户点击 ProgressBar
  → AgentDashboard 展开，显示表格化详情（头衔、状态标签、进度、Token、耗时）
  → 用户点击关闭按钮或再次点击 ProgressBar
  → AgentDashboard 收起
  → 所有 Agent 完成 (success/failed/timeout)
  → ProgressBar 和 Dashboard 自动消失
```

---

## 3. 组件设计

### 3.1 AgentDashboard

| 项目 | 说明 |
|------|------|
| Props | `agents: AgentProgress[]`, `open: boolean`, `onClose: () => void` |
| open=false | 返回 null |
| 标题栏 | "Agent 仪表盘 (N 个 Agent)" + ✕ 关闭按钮 |
| 空列表 | "暂无活跃 Agent" |
| 列表项 | 头像(首字母) + 名称 + 状态标签 + 进度/Token/耗时 |
| 委派缩进 | `paddingLeft = 12 + delegationLevel * 16px`，有委派时行首显示 └ |
| 状态标签 | queued=排队中(gray), running=执行中(blue), success=已完成(green), failed=失败(red), timeout=超时(yellow) |

### 3.2 AgentDetail 接口

```typescript
// 继承自 AgentProgress，增加仪表盘专用字段
// TODO: delegationLevel / parentAgentId / taskDescription / tokensUsed / elapsedMs
// 字段预留完成后端数据对接，Mock 阶段默认 delegationLevel=0 扁平展示
```

### 3.3 AgentProgressBar（改动点）

- 外层包裹 `<div onClick={toggleDashboard} className="cursor-pointer">`
- 视觉效果：hover 时颜色变化，提示可点击

---

## 4. 数据流

```
SSE agent_status
  → useDashboardStore.updateAgentStatus({ agentId, agentName, status, progress })
  → agentStatuses 更新
  → AgentProgressBar + AgentDashboard 自动响应渲染

对话切换 (activeId 变化)
  → useEffect cleanup
  → useDashboardStore.clearStatuses()
  → ProgressBar 和 Dashboard 清空

消息结束 (onMessageEnd)
  → 检查 allDone()
  → 若全部完成 → clearStatuses() + setDashboardOpen(false)
```

---

## 5. 边界情况

- 单聊（`conversation.type !== "group"`）不渲染 ProgressBar 和 Dashboard
- 切换对话时清空 agentStatuses 并关闭仪表盘
- 无 Agent 运行时 Dashboard 显示空状态提示
- 流式结束后自动清理，避免残留状态
- 委派层级超过 5 级时缩进不再增加（上限保护）

---

## 6. 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/stores/dashboardStore.ts` | 仪表盘状态 + Agent 状态集中管理 |
| 新建 | `src/components/chat/AgentDashboard.tsx` | 可展开详情面板 |
| 修改 | `src/components/layout/ChatArea.tsx` | 从 useState 迁移到 dashboardStore |
| 修改 | `src/components/chat/index.ts` | 新增 AgentDashboard 导出 |

## 7. 不复用已有代码

- `AgentProgressBar` 组件不变，仅 ChatArea 中使用方式改变（外层包 clickable div）
- `AgentProgress` 接口已有，AgentDetail 继承它
- `chatStore` 只管理流式消息内容，agentStatuses 由新 store 管理，职责分离