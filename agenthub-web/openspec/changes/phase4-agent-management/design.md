## Context

当前 Sidebar 的新建对话弹窗固定传 `agentIds: []`，用户无法在新建时指定 Agent。MessageBubble 中的 Agent 头像不可交互，用户只能通过 ChatInput 手动打 `@` 来触发提及。

约束：仅前端改动，不修改后端 API。agents 数据由 AppLayout 通过 React Query 获取，需要沿组件树向下传递。

## Goals / Non-Goals

**Goals:**
- 新建对话弹窗中增加 Agent 选择器，支持 single 单选和 group 多选
- 点击 Agent 头像弹出 Popover 查看详情
- 右键 Agent 头像弹出菜单快捷 @提及

**Non-Goals:**
- 不修改后端 API
- 不修改 Agent 列表页（Phase 4 独立界面，未实现）
- 不在 Sidebar 对话列表中显示 Agent 头像

## Decisions

### 1. Agent 选择器放在 CreateConversationDialog 内部而非独立组件

创建 Agent 选择器作为弹窗的一个 section，而非独立组件。因为选择和对话创建强耦合（single/group 切换影响选择行为），拆出去反而增加 props 传递复杂度。

### 2. 类型切换时的选择保留策略

- single → group：保留当前选中的 agent（从单选变多选，预勾已有选项）
- group → single：只保留第一个已选 agent
- 默认 single 模式，默认选中第一个 agent

### 3. Agent 详情 Popover 使用绝对定位

AgentDetailPopover 使用 `position: absolute` 相对头像定位，Portal 到 body。避免被 MessageBubble 的 overflow hidden 裁剪。Popover 通过 props 接收 agent 数据，不直接访问 store。

### 4. 右键菜单 @提及通过 chatStore 中转

ChatInput 和头像菜单之间不直接通信。右键菜单点击后写 `chatStore.pendingMention`，ChatInput 用 `useEffect` 监听该值，非 null 时执行文本插入 + 光标定位 + 清空。解耦两个组件，避免 ref 传递。

### 5. agents prop 传递链路

```
AppLayout (useAgents) → ChatArea → MessageList → MessageBubble
                                 → Sidebar (已有)
```

不破坏现有数据流规则（AppLayout 是唯一数据获取入口）。

## Risks / Trade-offs

- **Popover 在虚拟列表中可能错位** → 使用 Portal 渲染到 body，计算相对视口的坐标而非相对父元素
- **pendingMention 在 ChatInput disabled 时预填** → 允许预填值到输入框（disabled 只阻止发送），等 streaming 结束后用户可直接发送
- **Agents 列表可能为空（Mock 模式加载中）** → Agent 选择器显示"加载中"占位，头像不显示交互光标
