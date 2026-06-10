# Spec: 交互体验升级 — 三层递进 + 补充点

**日期**: 2026-05-27 | **状态**: 已规划，待实现

---

## Layer 1 — 即时感知

### 1.1 对话列表 hover 展开操作
每个对话项右侧 hover 浮现操作图标（置顶/归档/删除），不再仅依赖右键菜单。

### 1.2 消息发送状态可视化
用户消息旁加状态图标：发送中(时钟) → 已发送(对勾) → Agent 回复中(脉冲点)。

### 1.3 按钮点击微反馈
全局 `:active { transform: scale(0.97) }` 按压感。

### 1.4 Toast 风格统一
统一时长 2s，统一 richColors。

---

## Layer 2 — 效率操作

### 2.1 Ctrl+K 命令面板
新增 `CommandPalette.tsx`，搜索对话/Agent/命令，uiStore 控制开关。

### 2.2 Ctrl+Tab 切换最近对话
维护最近 5 个对话栈，Ctrl+Tab / Ctrl+Shift+Tab 切换。

### 2.3 对话列表拖拽排序
HTML5 Drag API，乐观更新。

### 2.4 输入框斜杠命令
`/code` `/review` `/explain` `/fix` `/refactor`，选中填入模板。

### 2.5 输入框自动增高 + 草稿保存
chatStore 新增 `drafts`，切换对话时保存/恢复。

### 2.6 消息多选
勾选框 + 底部操作栏"引用选中"/"导出选中"。

---

## Layer 3 — 智能辅助

### 3.1 对话红点 + 未读机制
新增 `notificationStore`（Zustand），ConversationList 红点徽章，后台完成绿色圆点。

### 3.2 @Agent 名可点击 → 弹出 AgentDetailPopover

### 3.3 粘贴代码自动检测 → 提示包裹为代码块

### 3.4 粘贴文件路径 → 自动转为上下文引用

---

## 补充点

### 4.1 LLM 配置拖拽排序
替换上下按钮为 Drag API，保留按钮作为键盘替代。

### 4.2 提及弹窗 ArrowUp/Down 边界停止
从循环包装改为停在顶部/底部。

### 4.3 后台对话完成红点
同 3.1，notificationStore.markCompleted() + 绿色圆点。

---

## 涉及文件

| 文件 | 改动类型 |
|------|----------|
| `src/stores/notificationStore.ts` | 新增 |
| `src/components/CommandPalette.tsx` | 新增 |
| `src/stores/uiStore.ts` | 扩展 commandPaletteOpen / recentConversations |
| `src/stores/chatStore.ts` | 扩展 drafts |
| `src/types/chat.ts` | 扩展 hasUnread |
| `src/components/layout/ConversationList.tsx` | hover操作/拖拽排序/红点 |
| `src/components/layout/AppLayout.tsx` | Ctrl+K / Ctrl+Tab |
| `src/components/layout/ChatArea.tsx` | 未读增量/完成标记 |
| `src/components/chat/MessageList.tsx` | 发送状态/多选/@可点击 |
| `src/components/chat/ChatInput.tsx` | 斜杠命令/自动增高/草稿/粘贴检测/ArrowUp/Down |
| `src/components/settings/LLMConfigSection.tsx` | 拖拽排序 |
| `src/index.css` | 按钮微反馈 |
| `src/App.tsx` | Toast 统一 |