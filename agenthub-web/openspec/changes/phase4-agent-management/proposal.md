## Why

Phase 4 Agent 管理目前只有一个创建 Agent 表单，缺失三个核心交互：新建对话时无法选择 Agent、点击头像无法查看 Agent 信息、右键头像无快捷操作。这导致用户必须在 ChatInput 手动输入 @ 来关联 Agent，体验断裂。

## What Changes

- 新建对话弹窗增加 Agent 选择器：single 模式单选、group 模式多选，类型切换时保留已有选择
- Agent 头像变为可交互：点击弹出详情 Popover（名称、模型、能力标签、工具列表），右键弹出上下文菜单（快捷 @提及）
- ChatArea → MessageList → MessageBubble 增加 `agents` prop 传递链路
- chatStore 新增 `pendingMention` 状态，ChatInput 监听并执行文本插入

## Capabilities

### New Capabilities
<!-- None — all changes are modifications to existing capabilities -->

### Modified Capabilities
- `agent-management`: 新建对话 Agent 选择器 + Agent 详情 Popover（变更现有 Agent 管理需求）
- `at-mention`: 右键头像快捷 @提及（扩展 @提及的需求范围，增加触发方式）

## Impact

- 修改：`src/components/layout/Sidebar.tsx`（新建对话弹窗）、`src/components/layout/AppLayout.tsx`（传 agents）、`src/components/layout/ChatArea.tsx`（传 agents）、`src/components/chat/MessageList.tsx`（头像交互 + agents 传递）、`src/components/chat/ChatInput.tsx`（监听 pendingMention）
- 新建：`src/components/chat/AgentDetailPopover.tsx`、`src/components/chat/AgentAvatarContextMenu.tsx`
- 修改：`src/stores/chatStore.ts`（新增 pendingMention）
- 不修改后端 API
