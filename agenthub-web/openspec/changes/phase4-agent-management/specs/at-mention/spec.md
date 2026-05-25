## ADDED Requirements

### Requirement: 右键头像快捷 @提及

系统 SHALL 支持右键 Agent 头像弹出上下文菜单，快捷插入 @提及。

#### Scenario: 右键头像弹出菜单

- **WHEN** 用户右键消息气泡中非 user 且非 orchestrator 角色的 Agent 头像
- **THEN** 系统调用 `preventDefault()` 阻止浏览器默认菜单
- AND 弹出小型上下文菜单，定位在鼠标位置
- AND 菜单包含「提及 @AgentName」选项

#### Scenario: 点击菜单项插入提及

- **WHEN** 用户点击「提及 @AgentName」
- **THEN** 系统将 `@AgentName ` 写入 chatStore.pendingMention
- AND ChatInput 监听该值并执行文本插入 + 光标定位 + 清空
- AND 如果 ChatInput 已有未写完的 `@`，替换 `@` 之后的文本

#### Scenario: 关闭菜单

- **WHEN** 用户点击菜单外部区域
- **THEN** 菜单关闭

#### Scenario: Streaming 期间允许预填

- **WHEN** 当前正在流式传输（ChatInput disabled）
- **THEN** 右键 @提及仍然将文本预填到输入框
- AND 等 streaming 结束后用户可直接发送
