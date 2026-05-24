# Phase 4 补全 + Phase 6 增强 — Spec

## 背景

Phase 4（Agent 管理）和 Phase 6（@提及）有两个缺口：

1. **新建对话时无法选择 Agent** — Phase 4 缺失，当前 `handleNewConversation` 固定传 `agentIds: []`
2. **点击头像无法查看 Agent 信息** — Phase 4 缺失
3. **右键头像快捷 @提及** — Phase 6 增强，当前只能在 ChatInput 手动打 `@` 触发补全

## 功能概览

### Feature 1: 新建对话选 Agent

在 Sidebar "新建对话" 弹窗中增加 Agent 选择器。

**交互流程：**
1. 用户点击 Sidebar 的 "+" 按钮
2. 弹出新建对话对话框，包含：标题输入框、对话类型切换 (single/group)、Agent 选择列表
3. single 模式：单选 Agent，默认选中第一个
4. group 模式：多选 Agent，至少选 2 个
5. 每个 Agent 显示头像（首字母）、名称、模型标签
6. 选中态有视觉反馈（蓝色边框 + 勾选图标）
7. 创建按钮在 single 模式未选 Agent 或 group 模式选 < 2 个时禁用
8. 创建成功后自动激活该对话

**数据流：**
- Sidebar 通过 props 接收 `agents: Agent[]`（从 AppLayout 传入）
- `handleNewConversation` 传递选中的 agentIds 给 `onCreateConversation`

**对话类型切换：**
- 默认 single
- 切换为 group 时，已选中的 agent 保留（从单选变多选）
- 切换为 single 时，只保留第一个已选 agent

### Feature 2: Agent 头像详情 Popover

在 MessageBubble 中，点击非用户消息的头像，展示 Agent 详情。

**交互流程：**
1. Hover Agent 头像时，光标变为 pointer，提示可点击
2. 点击头像 → 弹出 Popover（绝对定位，浮在头像旁边）
3. Popover 内容：
   - 头像（大号首字母）+ Agent 名称
   - 提供商标识（anthropic / litellm）
   - 模型名称
   - 能力标签（capsules: coding, review, etc.）
   - 工具列表（read_file, write_file, etc.）
   - "提及此 Agent" 按钮 → 将 `@AgentName ` 写入 ChatInput
4. 点击 Popover 外部关闭
5. 再次点击同一头像关闭 Popover

**组件设计：**
- 新建 `AgentDetailPopover.tsx` — 纯展示组件，通过 props 接收 agent 数据
- 在 MessageBubble 中集成，仅对非 user 消息的头像生效
- 也适用于 StreamingMessageBubble

**Agent 数据获取：**
- ChatArea 已有 `agents` 列表，通过 `senderId` 匹配
- MessageList / MessageBubble 新增 `agents` prop 传递链路
- 找不到对应 agent 时（比如 senderType 是 orchestrator），不显示 popover

### Feature 3: 右键头像快捷 @提及

在 MessageBubble 中，右键非用户消息的头像，弹出上下文菜单。

**交互流程：**
1. 右键 Agent 头像 → `preventDefault()` 阻止浏览器默认菜单
2. 弹出小型上下文菜单，定位在鼠标位置
3. 菜单项："提及 @AgentName"
4. 点击后：
   - 将 `@AgentName ` 插入 ChatInput 当前光标位置
   - 聚焦 ChatInput
   - 关闭菜单
5. 点击菜单外部关闭
6. 如果 ChatInput 已有末写完的 `@`，自动替换 `@` 之后的文本

**实现方式：**
- 在 MessageBubble 中添加 `onContextMenu` 到头像元素
- 使用 chatStore 新增一个 action：`insertMentionToInput(agentName: string)`
- ChatInput 监听该 action，执行文本插入 + 光标定位

**与现有 @mention 的关系：**
- 右键 @mention 直接插入 `@AgentName ` ，不弹出下拉
- ChatInput 手动打 `@` 仍然触发下拉补全（已有功能）
- 两种方式互不干扰

## 状态管理变更

### chatStore 新增

```typescript
// zustand chatStore
pendingMention: string | null;          // 待插入的 @AgentName
setPendingMention: (name: string | null) => void;
```

ChatInput 用 `useEffect` 监听 `pendingMention` 变化，当非 null 时执行插入 + 清空。

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `src/components/layout/Sidebar.tsx` | 新建对话弹窗加 Agent 选择器 |
| 修改 | `src/components/layout/AppLayout.tsx` | 传 `agents` 给 Sidebar |
| 新建 | `src/components/chat/AgentDetailPopover.tsx` | Agent 详情浮窗组件 |
| 修改 | `src/components/chat/MessageList.tsx` | MessageBubble 加头像 click/右键；传 agents |
| 修改 | `src/components/layout/ChatArea.tsx` | 传 agents 给 MessageList |
| 修改 | `src/stores/chatStore.ts` | 新增 pendingMention 状态 |
| 修改 | `src/components/chat/ChatInput.tsx` | 监听 pendingMention，执行插入 |
| 新建 | `src/components/chat/AgentAvatarContextMenu.tsx` | 右键头像上下文菜单 |

## 边界情况

- **Orchestrator 消息**：senderType 为 orchestrator 时，头像不显示 Agent popover/右键菜单
- **Agent 已删除但消息仍引用**：senderId 在 agents 列表中找不到时，不显示交互
- **多 Agent 群聊**：每个 agent 消息的头像都可独立点击/右键
- **Sidebar 新建弹窗**：切换 single/group 类型时，保留已有选择（single→group 保留；group→single 只保留第一个）
- **ChatInput disabled**：当正在流式传输时，右键 @mention 仍然可以预填到输入框（输入框 disabled 但值可以预填，等 streaming 结束后发送）

## 不做什么

- 不修改 Agent 列表页（那是 Phase 4 的独立界面，暂未实现）
- 不修改后端 API
- 不在 Sidebar 对话列表中显示 Agent 头像（那是另一个 UI 优化）
