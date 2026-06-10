# Phase: ReAct 面板可见性与状态回溯

**日期**: 2026-06-01  
**对应 Spec**: [2026-06-01-react-panel-visibility.md](../specs/2026-06-01-react-panel-visibility.md)  
**状态**: in_progress

---

## 任务列表

### T1: ReActPanel 常驻 — visible 逻辑改为用户手动关闭

**文件**: `src/components/chat/ReActPanel.tsx`  
**依赖**: 无  
**状态**: pending

- [ ] `visible` 条件去掉 `|| isStreaming`，改为 `(allSteps.length > 0 || dagTaskId) && !closed`
- [ ] 新增 `closed` 状态
- [ ] 关闭按钮设置 `closed=true`
- [ ] 切换会话时重置 `closed=false`（通过监听 activeId 或 streamingContent 变化）

### T2: ChatArea 不清空执行状态 — 仅在切换会话时清理

**文件**: `src/components/layout/ChatArea.tsx`  
**依赖**: 无  
**状态**: pending

- [ ] `onMessageEnd` 回调中去掉 `clearAgentStatuses()` 和 `setDagTaskId(null)`
- [ ] `useEffect([activeId])` 保留 `clearAgentStatuses()` 和 `setDagTaskId(null)`
- [ ] `executeSend` 发送新消息时不清空（保留上一轮的状态直到新状态覆盖）

### T3: ChatHeader 状态浮标 — 任务完成/执行中指示器

**文件**: `src/components/chat/ChatHeader.tsx`  
**依赖**: T2  
**状态**: pending

- [ ] 新增 prop：`taskSummary: { total: number; completed: number; failed: number } | null`
- [ ] 渲染浮标按钮：执行中 = 蓝色脉冲点 + 文字；完成 = 绿色点；失败 = 橙色点
- [ ] 点击浮标触发 `window.dispatchEvent(new CustomEvent("open-react-panel"))`
- [ ] ChatArea 传入 taskSummary（从 agentStatuses 和 dashboardStore 派生）

### T4: Summary 消息"查看任务图"链接

**文件**: `src/components/chat/MessageList.tsx`  
**依赖**: T1  
**状态**: pending

- [ ] MessageBubble 中判断 `meta.summary` 存在且 `dagTaskId` 有值
- [ ] 在气泡底部加一个小链接"查看任务图 →"
- [ ] 点击触发 `window.dispatchEvent(new CustomEvent("open-react-panel", { detail: { tab: "dag" } }))`

### T5: ReActPanel 响应外部打开事件 + 标签切换

**文件**: `src/components/chat/ReActPanel.tsx`  
**依赖**: T1, T3, T4  
**状态**: pending

- [ ] 监听 `open-react-panel` 自定义事件
- [ ] 事件 detail 含 `tab` 时切换到对应标签
- [ ] 打开时将 `closed` 设为 false

### T6: 类型检查 + 测试

**文件**: 全部  
**依赖**: T1-T5  
**状态**: pending

- [ ] `npx tsc -b --noEmit` 零错误
- [ ] `npx vitest run` 全部通过

---

## 依赖图

```
T1 (ReActPanel 常驻) ──┐
                        ├──→ T5 (外部打开事件) ──→ T6 (验证)
T2 (ChatArea 不清空) ───┤
                        │
T3 (状态浮标) ─────────┤
                        │
T4 (查看任务图链接) ────┘
```
