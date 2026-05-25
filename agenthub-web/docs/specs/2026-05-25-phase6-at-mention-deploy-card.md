# Phase 6 — @提及 + 部署卡片

## 1. 需求范围

Phase 6 包含两个 P2 功能：

### 1.1 @提及自动补全 (ChatInput)
- 用户在 ChatInput 输入 `@` 时，弹出 Agent 选择列表
- 支持键盘 ↑↓ 导航 + Enter 选择 + Esc 关闭 + 鼠标点击选择
- 选中 Agent 后，在输入框中插入 `@AgentName `（文本形式，后跟空格）
- 继续输入可过滤匹配的 Agent（按名称模糊匹配）
- 发送消息时，从文本中解析 `@AgentName` 提及，映射为 `mentions` 数组传给 API
- 无匹配 Agent 时显示"无匹配的 Agent"

### 1.2 部署状态卡片 (DeployStatusCard)
- 渲染 `deploy_status` 类型的 artifact
- 三种状态各有不同 UI：
  - `building`: 旋转加载动画 + "构建中..." 文案
  - `deployed`: 绿色成功标记 + 可点击的 URL 链接
  - `failed`: 红色失败标记 + 错误提示
- 在 CardRenderer 注册表中注册

## 2. 用户流程

### @提及流程
```
用户输入 "@Cl" → 弹出下拉列表，过滤出匹配 Agent（如 "Claude Code"）
  → ↑↓ 键选择 → Enter 确认 → 输入框插入 "@Claude Code "
  → 继续输入消息内容 → 发送
  → ChatArea 解析 @mentions，调用 POST /messages 时传 mentions 数组
```

### 部署卡片流程
```
SSE 推送 artifact (type: deploy_status) → 插入 streamingContent
  → CardRenderer 路由到 DeployStatusCard → 渲染对应状态
  → building: 旋转动画 → deployed/failed: 最终状态
```

## 3. 组件设计

### 3.1 ChatInput 改动
- 新增 `agents` prop (Agent[])，用于 @提及候选列表
- 新增内部状态：`mentionQuery`、`mentionIndex`、`mentionListOpen`、`mentionPosition`
- 监听 `@` 输入：在 textarea 的 `onChange` / `onInput` 中检测最近一个 `@` 符号位置
- 下拉列表定位在 textarea 上方，绝对定位
- 键盘事件处理：↑↓ 移动高亮、Enter 选中、Esc 关闭

### 3.2 DeployStatusCard 组件
- 纯渲染组件，接收 `Artifact` prop
- 从 `artifact.content` 读取 `status` 和 `url`
- 三种状态对应三个子视图

## 4. 数据流

### @提及
```
ChatInput (mentions 文本) → onSend(content)
  → ChatArea.handleSend 解析 content 中的 @AgentName → 查 agents 列表 → 得到 agentIds
  → messageApi.send(activeId, { content, mentions: agentIds, mode })
```

### 部署卡片
```
SSE artifact 事件 → appendStreamArtifact → CardRenderer → DeployStatusCard
```

## 5. 边界情况
- @ 在文本中间/末尾输入，下拉列表应紧贴光标位置
- @ 后面紧跟空格 → 不触发补全（正常文本）
- 输入框为空时输入 @ → 显示全部 Agent
- 多个 @mention 在同一消息中 → 全部解析
- @mention 后删除 @ 符号 → 下拉列表消失
- SSE 可能推送多个 deploy_status（building → deployed），每次都追加新 artifact

## 6. 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `src/components/chat/ChatInput.tsx` | 添加 @mention 下拉 + 解析逻辑 |
| 新建 | `src/components/cards/DeployStatusCard.tsx` | 部署状态卡片组件 |
| 修改 | `src/components/cards/CardRenderer.tsx` | 注册 deploy_status → DeployStatusCard |
| 修改 | `src/components/cards/index.ts` | 重新导出 DeployStatusCard |
| 修改 | `src/components/layout/ChatArea.tsx` | 解析 @mentions + 传入 agents 给 ChatInput |
| 修改 | `src/mocks/sse.ts` | 添加 deploy_status artifact 示例事件 |

## 7. 不复用已有代码
- ChatInput 现有逻辑不变，@mention 是纯增量功能
- CardRenderer 注册表模式已就绪，只加一行映射
- DeployStatusContent / DeployStatusArtifactContent 类型已在 chat.ts 定义，直接使用
