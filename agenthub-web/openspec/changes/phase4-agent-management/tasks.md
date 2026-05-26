## 1. 状态管理 + 数据流

- [ ] 1.1 chatStore 新增 pendingMention 状态字段和 setPendingMention action
- [ ] 1.2 AppLayout 将 agents 传递给 Sidebar（新增 prop）
- [ ] 1.3 ChatArea 将 agents 传递给 MessageList（新增 prop）

## 2. 新建对话选 Agent

- [ ] 2.1 Sidebar 的 CreateConversationDialog 增加 Agent 选择列表区域（single 单选 / group 多选切换）
- [ ] 2.2 选中态视觉反馈 + 创建按钮禁用逻辑（single 未选或 group < 2 时禁用）
- [ ] 2.3 类型切换时保留已有选择（single→group 保留；group→single 只保留第一个）

## 3. Agent 详情 Popover

- [ ] 3.1 创建 AgentDetailPopover 组件（头像、名称、模型、能力标签、工具列表、「提及此 Agent」按钮）
- [ ] 3.2 MessageBubble 中集成点击头像弹出 Popover（仅 senderType 非 user 非 orchestrator）
- [ ] 3.3 Popover 关闭逻辑（点击外部 / 再次点击头像）+ Portal 渲染避免裁剪
- [ ] 3.4 MessageList 将 agents 和 agent 数据传给 MessageBubble

## 4. 右键快捷 @提及

- [ ] 4.1 创建 AgentAvatarContextMenu 组件（上下文菜单，定位在鼠标位置）
- [ ] 4.2 MessageBubble 中集成右键头像弹出菜单（preventDefault + 菜单定位）
- [ ] 4.3 点击「提及 @AgentName」写入 chatStore.pendingMention
- [ ] 4.4 ChatInput 监听 pendingMention 变化，执行文本插入 + 光标定位 + 清空

## 5. 验证

- [ ] 5.1 运行 `npx tsc -b --noEmit` 确保零类型错误
- [ ] 5.2 手工验证：新建 single 对话选 Agent → 创建成功自动激活
- [ ] 5.3 手工验证：新建 group 对话选多 Agent → 切换类型保留选择
- [ ] 5.4 手工验证：点击 Agent 头像 → Popover 展示 → 点击外部关闭
- [ ] 5.5 手工验证：右键 Agent 头像 → 菜单 → @AgentName 插入 ChatInput
- [ ] 5.6 手工验证：Orchestrator 消息头像不响应交互
