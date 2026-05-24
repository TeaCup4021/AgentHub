# AgentHub 功能核验清单

> 基于各 Phase Plan 对比实际代码，核对每项功能的实现状态。
> 状态: ✅ 已完成 | ⚠️ 部分完成 | ❌ 未实现

---

## Phase 1: 类型定义 + 基础设施 ✅ 100%

### Task 1.1 — SSE 类型定义
- [x] `MessageContent` 联合类型 (text/code/diff/preview/file/deploy_status)
- [x] `Message` / `Conversation` / `CreateConversationParams` 类型
- [x] `Artifact` 及 5 种子类型 (Code/Diff/Preview/File/DeployStatus)
- [x] 6 种 SSE 事件类型 (message_start/token/artifact/agent_status/message_end/error)

### Task 1.2 — React Query hooks
- [x] `useConversations` — 列表查询
- [x] `useConversation(id)` — 详情查询 (enabled: !!id)
- [x] `useCreateConversation` — 创建 mutation + invalidate list
- [x] `useUpdateConversation(id)` — 更新 mutation + invalidate list/detail
- [x] `useUpdateAnyConversation` — 灵活版更新 (id 作为 mutation 变量)
- [x] `useDeleteConversation` — 删除 mutation + invalidate list
- [x] `useMessages(conversationId)` — 消息查询 (enabled: !!conversationId)
- [x] `useAgents` — Agent 列表查询
- [x] `useCreateAgent` — 创建 mutation + invalidate list
- [x] barrel 导出 `hooks/index.ts`

### Task 1.3 — SSE 客户端
- [x] `createSSEStream(conversationId, callbacks)` — GET + Authorization header
- [x] AbortController 返回 disconnect 函数
- [x] SSE 行协议解析 (event:/data: 行)
- [x] JSON 解析失败时跳过 (无崩溃)
- [x] `setMockSSE` 注入 mock 实现
- [x] `onConnectionError` 回调和 AbortError 过滤

### Task 1.4 — chatStore (纯 UI 状态)
- [x] `activeConversationId` / `searchQuery` / `isStreaming` / `streamingContent`
- [x] `initStreamingMessage` — 创建空 content 数组
- [x] `appendStreamToken` — delta 合并到末尾 text block / 创建新 block
- [x] `appendStreamArtifact` — 追加 artifact content block
- [x] `finalizeStreamingMessage` — 清除 streamingContent[messageId]，重置 isStreaming
- [x] `getStreamingContent` / `clearStreamingContent`

### Task 1.5 — agentStore (选择器状态)
- [x] `selectedAgentIds` / `toggleSelectedAgent` / `setSelectedAgents`

### Task 1.6 — API 客户端 (lib/api.ts)
- [x] conversationApi: CRUD + streamUrl
- [x] agentApi: list / detail / create
- [x] messageApi: send / list / regenerate / getArtifacts
- [x] 请求拦截器注入 Authorization header
- [x] 响应拦截器处理 401 / 500

---

## Phase 2: P0 单聊核心链路

### Task 2.1 — ChatArea 拆分为子组件 ✅

**ChatHeader** — 会话标题 + Agent 标签 + 群聊标识

**MessageList** — 完整消息渲染：
- [x] `MessageBubble` — 用户消息右对齐，Agent 消息左对齐
- [x] `StreamingMessageBubble` — 流式消息实时渲染（闪烁光标）
- [x] `PendingMessageBubble` — 等待 Agent 响应时的跳动点动画
- [x] 文本内容 → `TextBubble` / `StreamingTextBubble`
- [x] 富媒体内容 → `CardRenderer` 统一入口
- [x] Agent 名称显示和头像首字母

**ChatInput** — 消息输入：
- [x] Enter 发送，Shift+Enter 换行
- [x] 流式中 disabled + 灰色背景
- [x] 自适应高度 (max 200px)
- [x] 发送后清空并恢复高度
- [x] 空内容 / 流式中禁用发送按钮
- [x] 流式结束后自动聚焦
- [x] ~~placeholder 去掉未实现的 @提及 描述~~ (已修复)

**ChatArea** — 核心编排：
- [x] SSE 流接入：message_start → token → artifact → message_end
- [x] `onMessageEnd` 后 `invalidateQueries(["messages"])` 刷新消息列表
- [x] `onError` 捕获流错误并停止 streaming
- [x] 切换会话时 abort 旧 SSE 连接 (useEffect cleanup)
- [x] 发送消息前的 try/catch 错误处理
- [x] 无选中对话时的空状态占位
- [x] `mapArtifactToContent` 将 SSE Artifact 转为 MessageContent

### Task 2.2 — AppLayout + Sidebar ⚠️ 95%

**AppLayout:**
- [x] 数据获取层：useConversations + useCreateConversation
- [x] Props 向下传递给 Sidebar 和 ChatArea
- [x] 创建成功后自动选中新对话

**Sidebar — 列表功能:**
- [x] 对话列表渲染（props 接收）
- [x] 搜索过滤（活动 + 归档同时过滤）
- [x] 置顶排序
- [x] 新建对话弹窗 (Enter 提交 / Esc 关闭 / 空标题禁用)
- [x] 置顶/取消置顶 (… 菜单)
- [x] 重命名弹窗 (Enter 保存 / Esc 取消 / 遮罩关闭 / 空标题禁用)
- [x] 归档 → 移入"已归档"折叠区
- [x] 取消归档 → 回到活动列表
- [x] 删除确认弹窗 (遮罩关闭 / 确认删除)
- [x] … 菜单点击外部自动关闭
- [x] 已归档列表折叠/展开 (带数量标记)
- [x] 归档后清除 activeId（如果正在查看该对话）
- [x] 删除后清除 activeId
- [x] 已归档项不可点击选中 (半透明显示)

**Sidebar — ⚠️ 边界情况问题:**
- [x] 搜索无结果 → "没有找到匹配的对话"
- [x] 无对话 → "暂无对话，点击 + 创建"
- [x] 长标题截断 (20 字)
- [x] 长最后消息截断 (30 字)
- [x] 同一时间只有一个菜单打开 (menuOpenId 唯一)
- [x] 归档项菜单也能点击外部关闭 (已修复 menuRef=null 问题)

**Sidebar — ❌ 未实现:**
- [ ] 拖拽排序对话
- [ ] 批量操作（多选删除/归档）
- [ ] 对话分组/标签

### Task 2.3 — Mock 数据系统 ✅
- [x] Mock API: CRUD conversations / list agents / send messages / list messages
- [x] Mock SSE: 完整事件序列 (message_start → token → artifact → message_end)
- [x] `parseBody` 兼容 axios v1.x 的 string/object config.data
- [x] SSE 结束后 `addMockMessage` 持久化 agent 消息
- [x] `enableMockMode()` / `disableMockMode()` 一键开关

---

## Phase 3: P1 富媒体卡片 ✅ 100%

### Task 3.1 — 卡片组件

**CodeCard** — 代码块展示：
- [x] 顶部栏：文件名/语言 + 复制按钮
- [x] "已复制" 2 秒反馈
- [x] 横向滚动 (overflow-x-auto)
- [x] 暗色背景 (#1e1e1e 风格)

**DiffCard** — 代码对比：
- [x] 左右分栏 (old/new)
- [x] 红/绿背景区分
- [x] 文件名和语言标签

**PreviewCard** — 网页预览：
- [x] 内联 iframe 预览 (48px 高度)
- [x] 全屏展开 + 遮罩关闭
- [x] sandbox 安全限制

**FileCard** — 文件下载：
- [x] 文件图标 + 文件名 + 大小 + 类型
- [x] download 属性触发下载

**CardRenderer** — 注册表：
- [x] 可插拔模式：type → Component 映射
- [x] text 类型返回 null
- [x] 未注册类型返回 null（无崩溃）
- [x] `deploy_status` 留待 P6 实现

### Task 3.2 — MessageList 集成卡片 ✅
- [x] MessageBubble 和 StreamingMessageBubble 都使用 CardRenderer
- [x] 代码块、diff、预览、文件均能正常渲染

---

## 边界情况 Review 结果

### ✅ 已覆盖的边界情况

| 场景 | 处理方式 |
|------|----------|
| 空对话列表 | "暂无对话，点击 + 创建" |
| 搜索无结果 | "没有找到匹配的对话" |
| 无选中对话 | ChatArea 空状态占位图 |
| 流式中发送消息 | ChatInput disabled + 灰色背景 |
| 流式消息实时渲染 | StreamingMessageBubble + 闪烁光标 |
| 等待 Agent 响应 | PendingMessageBubble 跳动点 |
| SSE 连接错误 | onError → console.error + setIsStreaming(false) |
| 发送消息失败 | try/catch → console.error |
| 切换会话 | useEffect cleanup → abort 旧 SSE |
| 空消息发送 | 按钮 disabled + trim 检查 |
| 长标题/长消息 | truncate 截断 (20/30 字) |
| 新建对话空标题 | 创建按钮 disabled |
| 重命名空标题 | 保存按钮 disabled |
| 归档后查看该对话 | 自动清除 activeId |
| 删除当前查看的对话 | 自动清除 activeId |
| JSON 解析失败 (SSE) | 静默跳过 |
| AbortError (SSE) | 过滤，不触发 onConnectionError |
| 未注册的卡片类型 | CardRenderer 返回 null (不崩溃) |
| 只有归档无活动对话 | 显示归档折叠区，无活动列表 |
| 同时只有一个菜单 | menuOpenId 单一状态 |
| 菜单点击外部 | mousedown 监听自动关闭 |
| Agent 不在列表 | ChatHeader 不渲染该 tag |
| 代码复制后反馈 | "已复制" 2 秒 |

### ⚠️ 已知限制 (不影响使用)

| 问题 | 说明 | 计划 |
|------|------|------|
| deploy_status 卡片无声失败 | CardRenderer 未注册，收到后不渲染 | P6 实现 |
| 不校验重复标题 | 可创建多个同名对话 | 暂不处理 |
| 无拖拽排序 | 对话顺序固定（时间+置顶） | 未规划 |
| 无批量操作 | 不能多选删除/归档 | 未规划 |
| navigator.clipboard HTTP 限制 | 非 HTTPS 下复制可能失败 | 部署时关注 |
| 无撤销归档/删除 | 操作不可逆（删除有确认弹窗） | 后续考虑 Toast 提示 |

---

## 汇总

| Phase | 名称 | 完成度 | 待修复 |
|-------|------|--------|--------|
| 1 | 类型定义 + 基础设施 | ✅ 100% | — |
| 2 | P0 单聊核心链路 | ✅ 95% | 拖拽/批量 未规划 |
| 3 | P1 富媒体卡片 | ✅ 100% | deploy_status (P6) |
| 4 | Agent 管理 | ❌ 0% | 全部待实现 |
| 5 | 群聊 + Orchestrator | ❌ 0% | 全部待实现 |
| 6 | @提及 + 部署卡片 | ❌ 0% | 全部待实现 |
| 7 | ReAct 推理可视化 | ❌ 0% | 全部待实现 |
| 8 | Agent 仪表盘 | ❌ 0% | 全部待实现 |
| 9 | 设置页 | ❌ 0% | 全部待实现 |
