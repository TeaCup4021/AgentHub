# Phase 4 补全 + Phase 6 增强 — 实施计划

## Task 1: 新建对话 Agent 选择器 ✅
**依赖**: 无  
**文件**:
- 修改 `src/components/layout/AppLayout.tsx`（传 `agents` 给 Sidebar）
- 修改 `src/components/layout/Sidebar.tsx`（弹窗加 Agent 选择器）

**Checklist**:
- [x] AppLayout 传入 `agents` prop 给 Sidebar
- [x] Sidebar 新增 `agents` prop
- [x] 新建弹窗加对话类型切换 (single/group)
- [x] Agent 列表渲染（头像首字母 + 名称 + 模型）
- [x] single 模式单选，group 模式多选
- [x] 选中态样式（蓝色边框 + 勾选）
- [x] 创建按钮 disabled 逻辑（single 未选 / group < 2）

---

## Task 2: chatStore 新增 pendingMention ✅
**依赖**: 无  
**文件**:
- 修改 `src/stores/chatStore.ts`

**Checklist**:
- [x] 新增 `pendingMention: string | null`
- [x] 新增 `setPendingMention(name: string | null)` action
- [x] ChatInput 监听 `pendingMention`，非 null 时插入文本 + 清空

---

## Task 3: AgentDetailPopover + 头像交互 ✅
**依赖**: Task 2  
**文件**:
- 新建 `src/components/chat/AgentDetailPopover.tsx`
- 新建 `src/components/chat/AgentAvatarContextMenu.tsx`
- 修改 `src/components/chat/MessageList.tsx`（MessageBubble 集成 click/右键）
- 修改 `src/components/layout/ChatArea.tsx`（传 agents 给 MessageList）

**Checklist**:
- [x] AgentDetailPopover 组件（名称、提供商、模型、能力标签、系统提示词）
- [x] "提及此 Agent" 按钮 → 调用 setPendingMention
- [x] MessageBubble 头像 hover 变 pointer
- [x] 点击头像 → 打开 Popover（非 user 消息）
- [x] 右键头像 → 打开上下文菜单
- [x] 上下文菜单"提及 @AgentName" → 调用 setPendingMention
- [x] orchestrator 消息不触发交互
- [x] 找不到 agent 时不触发交互
- [x] 点击外部关闭 Popover / 菜单

---

## Task 4: 类型检查 + 验收 ✅
**依赖**: Task 1-3  
**Checklist**:
- [x] `npx tsc -b --noEmit` 零错误
- [x] 功能验证
