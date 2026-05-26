## ADDED Requirements

### Requirement: 新建对话选择 Agent

系统 SHALL 在新建对话弹窗中提供 Agent 选择器，支持 single 单选和 group 多选，类型切换时保留已有选择。

#### Scenario: Single 模式单选 Agent

- **WHEN** 用户在 single 模式下新建对话
- **THEN** 系统显示 Agent 列表，每个 Agent 显示头像（首字母）、名称、模型标签
- AND 默认选中第一个 Agent
- AND 未选 Agent 时创建按钮禁用

#### Scenario: Group 模式多选 Agent

- **WHEN** 用户在 group 模式下新建对话
- **THEN** 系统显示 Agent 列表，支持多选
- AND 选中态有视觉反馈（蓝色边框 + 勾选图标）
- AND 选中少于 2 个时创建按钮禁用

#### Scenario: 类型切换保留选择

- **WHEN** 用户从 single 切换到 group
- **THEN** 当前选中的 Agent 保留（从单选变多选，预勾已有选项）
- AND 当用户从 group 切换到 single 时，只保留第一个已选 Agent

### Requirement: Agent 头像详情 Popover

系统 SHALL 在用户点击 Agent 头像时弹出详情 Popover，展示 Agent 信息。

#### Scenario: 点击头像显示详情

- **WHEN** 用户点击消息气泡中非 user 且非 orchestrator 角色的 Agent 头像
- **THEN** 弹出 AgentDetailPopover，绝对定位于头像旁边
- AND 显示：头像（大号首字母）、Agent 名称、提供商标识、模型名称、能力标签（capsules）、工具列表
- AND 包含「提及此 Agent」按钮

#### Scenario: 关闭 Popover

- **WHEN** 用户点击 Popover 外部区域或再次点击同一头像
- **THEN** Popover 关闭

#### Scenario: Orchestrator 消息不显示交互

- **WHEN** 消息 senderType 为 orchestrator
- **THEN** 头像 SHALL NOT 响应点击或右键交互
