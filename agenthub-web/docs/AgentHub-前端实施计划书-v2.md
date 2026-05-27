# AgentHub 前端实施计划书

版本：v2.0 | 日期：2026-05-26 | 基于 P0/P1/P2 头脑风暴重构

---

## 总览

本项目是 AgentHub 多 Agent 协作平台的前端应用。技术栈：React 19 + TypeScript + Vite + TailwindCSS + Zustand + TanStack React Query。

**当前状态：** Phase 1-9 骨架已完成（类型定义、单聊链路、卡片渲染、Agent 创建、群聊基础、@提及、ThinkingBlock、AgentDashboard、LLM配置/Token面板）。但核心体验链路未打通，视觉设计缺失，多项功能仅有壳。

**工作方式：** 严格按 Spec-Driven 流程。每个模块先读对应 spec → 拆 task → 实现 → `npx tsc -b --noEmit` 零错误 → 继续下一个。

---

## 实施优先级

| 等级 | 模块数 | 目标 | 预估工期 |
|------|--------|------|----------|
| P0 | 6 | 核心链路可演示 | 2-3 天 |
| P1 | 9 | 产品体验完整 | 3-4 天 |
| P2 | 8 | 差异化亮点 | 2-3 天 |
| **合计** | **23** | — | **7-10 天** |

---

# P0 — 核心体验链路（2-3 天）

## 模块 1：Markdown 渲染 + 代码高亮

**Spec：** `docs/specs/2026-05-26-p0-core-experience.md` 模块 1

**依赖安装：** `npm install react-markdown remark-gfm rehype-raw shiki @shikijs/transformers`

**Task 1.1：安装依赖并配置 shiki**

文件：`package.json`
- 新增 5 个依赖

**Task 1.2：重写 CodeCard — shiki 高亮**

文件：`src/components/cards/CodeCard.tsx`
- [ ] `useEffect` 异步 `codeToHtml(code, { lang, theme: 'dark-plus', transformers: [transformerLineNumbers()] })`
- [ ] `dangerouslySetInnerHTML` 挂载高亮 HTML
- [ ] 文件名 bar + 语言标签 + 复制按钮对接 sonner toast
- [ ] 超过 30 行自动折叠，底部渐变遮罩 + "展开"按钮
- [ ] 暗色背景 `bg-[#1e1e1e]`

**Task 1.3：重写 TextBubble → MarkdownBubble**

文件：`src/components/chat/MessageList.tsx`
- [ ] 替换 `TextBubble` 为 react-markdown + remark-gfm + rehype-raw
- [ ] 自定义 `components`：`code` 映射到 `CodeCard`，`hl` 映射到 `<mark>`（搜索高亮用）
- [ ] `StreamingTextBubble` 同样支持 markdown（流式场景容忍不完整 markdown）
- [ ] 消息气泡样式适配 markdown 排版（段落间距、列表缩进、表格边框）

**Task 1.4：类型检查**

```bash
npx tsc -b --noEmit
```

---

## 模块 2：消息列表自动滚底

**Spec：** `docs/specs/2026-05-26-p0-core-experience.md` 模块 2

**Task 2.1：自动滚底逻辑**

文件：`src/components/chat/MessageList.tsx`
- [ ] `useEffect` 监听 `messages` 长度变化 + `streamingContent` 变化
- [ ] 判断距底部 < 100px 时自动 `scrollIntoView({ behavior: 'smooth' })`
- [ ] 底部 sentinel 元素用作滚动锚点
- [ ] 用户上滚超过 100px 后暂停自动滚底

**Task 2.2：浮动"回到底部"按钮**

文件：`src/components/chat/MessageList.tsx`
- [ ] 右下角浮动按钮，`animate-slide-up` 出现
- [ ] 未读消息计数徽标（橙色小圆点 + 数字）
- [ ] IntersectionObserver 监听 sentinel，可见时隐藏按钮
- [ ] 点击按钮 `scrollIntoView` + 恢复自动滚底

---

## 模块 3：消息时间戳

**Spec：** `docs/specs/2026-05-26-p0-core-experience.md` 模块 3

**Task 3.1：时间格式化工具**

文件：新增 `src/lib/formatTime.ts`
- [ ] `formatMessageTime(iso: string): string` — 按规则格式化
- [ ] `formatTooltipTime(iso: string): string` — 精确到秒
- [ ] 规则：当天 "HH:mm" / 昨天 "昨天 HH:mm" / 本周 "周X HH:mm" / 更早 "MM-DD HH:mm"

**Task 3.2：时间分隔条**

文件：`src/components/chat/MessageList.tsx`
- [ ] 消息列表遍历时计算相邻消息时间差
- [ ] > 5 分钟插入时间分隔条组件（居中灰色文本线）
- [ ] 每条消息 hover 时 tooltip 显示精确时间

---

## 模块 4：全局 Toast 通知

**Spec：** `docs/specs/2026-05-26-p0-core-experience.md` 模块 4

**依赖安装：** `npm install sonner`

**Task 4.1：集成 sonner**

文件：`src/App.tsx`
- [ ] 在 `<BrowserRouter>` 内添加 `<Toaster />`

**Task 4.2：ChatArea 集成 toast**

文件：`src/components/layout/ChatArea.tsx`
- [ ] `messageApi.send().catch()` → `toast.error("消息发送失败", { action: { label: "重试", onClick: redo } })`
- [ ] SSE `onConnectionError` → `toast.error("连接断开，正在重连...")`
- [ ] 重连成功 → `toast.success("已恢复连接")`
- [ ] 3 次重试耗尽 → `toast.error("连接失败", { action: { label: "手动重连", onClick: reconnect } })` persistent

**Task 4.3：CreateAgentModal 集成 toast**

文件：`src/components/agent/CreateAgentModal.tsx`
- [ ] `onSuccess` → `toast.success("Agent 创建成功")`
- [ ] `onError` → `toast.error("创建失败：" + message)`

**Task 4.4：Sidebar 会话删除 + 乐观撤销 toast**

文件：`src/components/layout/Sidebar.tsx`
- [ ] `deleteConversation.mutate` 的 `onMutate` 做乐观移除
- [ ] `toast.success("对话已删除", { action: { label: "撤销", onClick: undo } })`
- [ ] 撤销时调 `updateConversation({ isArchived: false })` 恢复

---

## 模块 5：Mock 新对话可用

**Spec：** `docs/specs/2026-05-26-p0-core-experience.md` 模块 5

**Task 5.1：Mock 消息缓存**

文件：`src/mocks/handlers.ts`
- [ ] 拦截 `POST /messages`，缓存 `{ convId → { content, mentions } }` 到内存 Map

**Task 5.2：Mock 模板生成 SSE**

文件：`src/mocks/sse.ts`
- [ ] newConversationSSE 函数：查缓存 → 未命中预设则走模板
- [ ] 模板：引用用户输入内容生成通用 Agent 回复
- [ ] markdown 格式回复，含代码块示例
- [ ] 完整 SSE 序列：`message_start → token × N → message_end`
- [ ] `message_end.usage` 携带模拟 token 数据

---

## 模块 6：SSE 断连 UI 反馈

**Spec：** `docs/specs/2026-05-26-p0-core-experience.md` 模块 6

**发现：** 重试逻辑从未实现，需从零构建。

**Task 6.1：chatStore 新增连接状态**

文件：`src/stores/chatStore.ts`
- [ ] 新增字段：`connectionStatus: 'connected' | 'reconnecting' | 'failed'`
- [ ] 新增字段：`retryCount: number`
- [ ] 新增 action：`setConnectionStatus`、`setRetryCount`、`resetConnection`

**Task 6.2：ChatArea 重试逻辑**

文件：`src/components/layout/ChatArea.tsx`
- [ ] `onConnectionError` → 指数退避重试 1s → 2s → 4s，最多 3 次
- [ ] 重试时重新调用 `createSSEStream`
- [ ] 3 次耗尽可能：停止重试，等待用户手动触发
- [ ] 重连成功 → 重置 retryCount

**Task 6.3：连接状态 Banner**

文件：`src/components/layout/ChatArea.tsx`
- [ ] 顶部渲染 `ConnectionBanner` 组件
- [ ] 断连中：黄色 `⚠ 连接已断开，正在重连... (retryCount/3)`
- [ ] 恢复：绿色 `✓ 已恢复连接`，1.5s 后自动消失
- [ ] 失败：红色 `✕ 连接失败` + [手动重连] 按钮

**Task 6.4：流式消息中断标记**

文件：`src/components/layout/ChatArea.tsx` + `src/components/chat/MessageList.tsx`
- [ ] 断连时当前流式消息的 `status` 标记为 `failed`
- [ ] 消息末尾追加"（响应中断）"提示
- [ ] 恢复后不清除已接收的内容

---

# P1 — 体验完整度（3-4 天）

## 模块 7：暗色模式

**Spec：** `docs/specs/2026-05-26-p1-experience-completeness.md` 模块 7

**Task 7.1：Tailwind 配置**

文件：`tailwind.config.js`
- [ ] 设 `darkMode: 'class'`

**Task 7.2：uiStore 改为三态**

文件：`src/stores/uiStore.ts`
- [ ] `theme: 'light' | 'dark' | 'system'`
- [ ] 初始化读 localStorage + `matchMedia('prefers-color-scheme: dark')`
- [ ] 写 localStorage 持久化
- [ ] 监听 `prefers-color-scheme` change 事件

**Task 7.3：全局 dark class 切换**

文件：`src/components/layout/AppLayout.tsx`
- [ ] `useEffect` 根据 theme 值在 `<html>` 上 toggle `class="dark"`
- [ ] system 模式跟随系统

**Task 7.4：组件适配（11 个文件，约 150+ 处 dark: 样式）**
- [ ] `Sidebar.tsx` — sidebar-bg/hover/active 的 dark 色值
- [ ] `MessageList.tsx` — chat-bubble-user/agent 的 dark 色值
- [ ] `ChatInput.tsx` — 输入框 dark 色值
- [ ] `ChatHeader.tsx` — 标题栏 dark
- [ ] `CodeCard.tsx` — 暗色背景保持不变（已是 dark 风格）
- [ ] `DiffCard.tsx` — dark 适配
- [ ] `PreviewCard.tsx` — dark 适配
- [ ] `FileCard.tsx` — dark 适配
- [ ] `DeployStatusCard.tsx` — dark 适配
- [ ] `CreateAgentModal.tsx` — dark 适配
- [ ] `SettingsPage.tsx` + `LLMConfigSection.tsx` + `TokenUsagePanel.tsx` — dark 适配

---

## 模块 8：代码块增强

**Spec：** `docs/specs/2026-05-26-p1-experience-completeness.md` 模块 8

> 已在 P0 模块 1 的 CodeCard 重写中一并完成。此模块作为独立验证项确认全部增强已实现。

---

## 模块 9：Agent 管理完整化

**Spec：** `docs/specs/2026-05-26-p1-experience-completeness.md` 模块 9

**Task 9.1：新增 AgentManageModal**

文件：新增 `src/components/agent/AgentManageModal.tsx`
- [ ] 模态框壳 + 卡片网格（`grid grid-cols-3 gap-3`）
- [ ] 顶部搜索框实时过滤
- [ ] 每个 Agent 卡片：头像首字母 + 名称 + provider + 能力标签 + [编辑] [删除]
- [ ] 空状态："暂无 Agent，点击创建"

**Task 9.2：新增 AgentDetailPanel**

文件：新增 `src/components/agent/AgentDetailPanel.tsx`
- [ ] 右侧滑出面板（`fixed right-0 top-0 h-full w-80 shadow-xl transition-transform`）
- [ ] 展示：名称、模型、provider、能力、工具、System Prompt
- [ ] [编辑] 按钮 → 打开 CreateAgentModal 编辑模式
- [ ] [删除] 按钮 → 确认对话框

**Task 9.3：CreateAgentModal 编辑模式**

文件：`src/components/agent/CreateAgentModal.tsx`
- [ ] 新增 `initialData?: Agent` prop
- [ ] 编辑模式：预填所有字段，标题改为"编辑 Agent"
- [ ] 调用 `useUpdateAgent` 而非 `useCreateAgent`

**Task 9.4：useDeleteAgent hook**

文件：`src/hooks/useAgents.ts`
- [ ] 新增 `useDeleteAgent`：`useMutation` + `onMutate` 乐观移除 + `onError` 回滚

**Task 9.5：Sidebar 入口**

文件：`src/components/layout/Sidebar.tsx`
- [ ] 设置按钮上方加"管理 Agent"按钮
- [ ] 点击打开 `AgentManageModal`

---

## 模块 10：消息操作

**Spec：** `docs/specs/2026-05-26-p1-experience-completeness.md` 模块 10

**Task 10.1：新增 MessageActions 组件**

文件：新增 `src/components/chat/MessageActions.tsx`
- [ ] 三个按钮：复制文本 / 引用回复 / 重新生成
- [ ] 复制：`navigator.clipboard.writeText` + `toast.success("已复制")`
- [ ] 引用：`chatStore` 存引用文本，ChatInput 读取后插入 `> 原文\n`
- [ ] 重新生成：调用 `messageApi.regenerate(messageId)`（API 已有）

**Task 10.2：MessageBubble 集成**

文件：`src/components/chat/MessageList.tsx`
- [ ] 消息气泡外层加 `group` class
- [ ] 操作栏 `opacity-0 group-hover:opacity-100`
- [ ] 流式消息不显示操作栏
- [ ] 失败消息只显示"重新生成"

---

## 模块 11：会话功能补全

**Spec：** `docs/specs/2026-05-26-p1-experience-completeness.md` 模块 11

**Task 11.1：会话内搜索**

文件：新增 `src/components/chat/ConversationSearch.tsx`
- [ ] ChatHeader 右侧搜索按钮 → 展开搜索栏
- [ ] 输入关键词 → 纯前端在已加载 `messages` 中过滤
- [ ] markdown 源码中替换关键词为 `<hl>关键词</hl>`
- [ ] ↑↓ 在匹配项间跳转，`scrollIntoView` + 黄色脉冲
- [ ] react-markdown `components.hl` → `<mark>` 渲染

**Task 11.2：批量操作模式**

文件：`src/components/layout/Sidebar.tsx`
- [ ] 本地 `batchMode` 状态，长按或点"选择"进入
- [ ] 每项前置 checkbox，底部浮现批量操作栏
- [ ] 支持批量归档/删除，操作后 toast 带撤销
- [ ] Esc 退出批量模式

**Task 11.3：会话导出**

文件：新增 `src/lib/exportConversation.ts`
- [ ] 从 React Query 缓存读消息 → 转 Markdown 纯文本
- [ ] `Blob` + `URL.createObjectURL` + `<a download>` 触发下载
- [ ] 右键菜单加"导出"按钮

---

## 模块 12：空状态 & 加载态

**Spec：** `docs/specs/2026-05-26-p1-experience-completeness.md` 模块 12

**Task 12.1：骨架屏组件**

文件：新增 `src/components/ui/Skeleton.tsx`
- [ ] 泛用骨架屏组件（`<div className="animate-pulse bg-gray-200 rounded">`）
- [ ] 变体：文本行、头像圆、卡片方块

**Task 12.2：会话列表加载/空状态**

文件：`src/components/layout/Sidebar.tsx`
- [ ] 加载中：3 条骨架屏
- [ ] 空：插画 + "暂无对话" + "点击 + 创建"

**Task 12.3：消息列表空状态**

文件：`src/components/chat/MessageList.tsx`
- [ ] 新对话空状态：插画 + 3 条"快捷提示"点击填入输入框
- [ ] 加载更多历史：骨架气泡替代纯文字

**Task 12.4：错误状态**

文件：`src/components/layout/AppLayout.tsx` + `MessageList.tsx`
- [ ] React Query `isError` → 重试按钮 + 错误信息

---

## 模块 13：响应式基础

**Spec：** `docs/specs/2026-05-26-p1-experience-completeness.md` 模块 13

**Task 13.1：拖拽分隔线**

文件：`src/components/layout/AppLayout.tsx`
- [ ] 侧边栏和聊天区之间加分隔线元素（`w-1 cursor-col-resize hover:bg-blue-400`）
- [ ] `mousedown → mousemove → mouseup` 调整 `uiStore.sidebarWidth`
- [ ] 宽度限定 200px-500px
- [ ] `mouseup` 时持久化到 localStorage

**Task 13.2：响应式媒体查询 Hook**

文件：新增 `src/hooks/useMediaQuery.ts`
- [ ] `useMediaQuery(query: string): boolean`

**Task 13.3：移动端抽屉模式**

文件：`src/components/layout/AppLayout.tsx` + `Sidebar.tsx`
- [ ] `<768px`：Sidebar 变 `fixed inset-y-0 left-0 z-50 shadow-xl` + `translate` 过渡
- [ ] 聊天区全屏 `flex-1`
- [ ] 遮罩层点击关闭侧边栏
- [ ] `768-1024px`：侧边栏 240px 固定
- [ ] `>1024px`：侧边栏可拖拽

---

## 模块 14：聊天输入增强

**Spec：** `docs/specs/2026-05-26-p1-experience-completeness.md` 模块 14

**Task 14.1：粘贴图片**

文件：`src/components/chat/ChatInput.tsx`
- [ ] `onPaste` 拦截 `clipboardData.items`，过滤 `image/*`
- [ ] `FileReader.readAsDataURL` → `<img src={base64}>` 插入光标位置
- [ ] 图片标签设定样式 `max-h-48 rounded-md`

**Task 14.2：拖拽文件**

文件：`src/components/chat/ChatInput.tsx`
- [ ] `onDragOver` 阻止默认 + 蓝色虚线边框反馈
- [ ] `onDrop` 读取 `dataTransfer.files`，处理同粘贴

**Task 14.3：高度自适应**

文件：`src/components/chat/ChatInput.tsx`
- [ ] MutationObserver 中 `scrollHeight` 动态赋值 `style.height`
- [ ] 上限 200px，超出滚

**Task 14.4：字数统计**

文件：`src/components/chat/ChatInput.tsx`
- [ ] 右下角 `"1,234 / 8,000"` 灰色小字
- [ ] 超 80% 黄色，超限红色 + 禁用发送

---

## 模块 15：Token 用量图表

**Spec：** `docs/specs/2026-05-26-p1-experience-completeness.md` 模块 15

**依赖安装：** `npm install recharts`

**Task 15.1：tokenUsageStore 改造**

文件：`src/stores/tokenUsageStore.ts`
- [ ] 新增 `events: TokenEvent[]` 数组
- [ ] `addUsage` 同时写入 `usageMap`（累计）和 `events`（追加）
- [ ] `TokenEvent` 含 `agentName` 字段

**Task 15.2：ChatArea 传入 agentName**

文件：`src/components/layout/ChatArea.tsx`
- [ ] `addUsage` 调用时传入 `streamAgentRef.current`

**Task 15.3：TokenCharts 组件**

文件：新增 `src/components/settings/TokenCharts.tsx`
- [ ] 面积图：按天聚合 events → `<AreaChart>`（蓝色输入 + 绿色输出堆叠）
- [ ] 饼图：按 agentName 分组 → `<PieChart>`
- [ ] 柱状图：从 usageMap 取 top 10 → `<BarChart>`
- [ ] 所有图表用 `<ResponsiveContainer>` 自适应宽度

**Task 15.4：TokenUsagePanel 嵌入图表**

文件：`src/components/settings/TokenUsagePanel.tsx`
- [ ] 在现有统计卡片和表格上方嵌入 `<TokenCharts />`

---

# P2 — 差异化亮点（2-3 天）

## 模块 16：群聊 Orchestrator 全链路

**Spec：** `docs/specs/2026-05-26-p2-highlights.md` 模块 16
**接口契约：** `docs/specs/2026-05-26-orchestrator-api-contract.md`

**Task 16.1：OrchestratorPlan 重写**

文件：`src/components/chat/OrchestratorPlan.tsx`
- [ ] 渲染子任务列表（序号 + Agent 名 + 指令描述）
- [ ] "调整分派"→ 每项变为可编辑（改 Agent/改指令）
- [ ] "确认执行"→ 调 `POST /messages` mode: `confirm_plan`
- [ ] 支持 `subtask.type === "create_agent"` 渲染 AgentConfigPreviewCard

**Task 16.2：ChatArea orchestrator 消息处理**

文件：`src/components/layout/ChatArea.tsx`
- [ ] SSE `message_start.sender.type === "orchestrator"` 识别
- [ ] `meta.plan` → 渲染 OrchestratorPlan
- [ ] `meta.summary` → 渲染 OrchestratorSummary
- [ ] `agent_status` 的 `subtask_id` 关联追踪

**Task 16.3：OrchestratorSummary 卡片**

文件：新增 `src/components/chat/OrchestratorSummary.tsx`
- [ ] 聚合卡片：成功数/失败数 + 各子任务结果列表
- [ ] 点击子任务跳转到对应 Agent 消息

**Task 16.4：Mock 群聊流程**

文件：`src/mocks/sse.ts`
- [ ] 模拟完整六步流程：plan → 等待确认 → agent 交织输出 → summary
- [ ] 多 Agent 交织消息 mock 数据

---

## 模块 17：ReAct 推理面板

**Spec：** `docs/specs/2026-05-26-p2-highlights.md` 模块 17

**Task 17.1：ReActPanel 组件**

文件：新增 `src/components/chat/ReActPanel.tsx`
- [ ] 从 `chatStore` 读当前流式消息的 `thinkingSteps`
- [ ] 三个阶段着色（紫色思考 / 蓝色行动 / 绿色观察）
- [ ] 新 Step 自动追加 + 闪烁高亮
- [ ] 可拖拽标题栏（mousedown + mousemove）
- [ ] 左右侧吸附 / 自由浮动
- [ ] 图钉按钮固定面板
- [ ] Agent 完成后 5s 自动关闭（除非已固定）

**Task 17.2：ChatArea 集成**

文件：`src/components/layout/ChatArea.tsx`
- [ ] 在 ChatArea 右侧渲染 `<ReActPanel />`
- [ ] 流式开始时自动展开

---

## 模块 18：产物工作台

**Spec：** `docs/specs/2026-05-26-p2-highlights.md` 模块 18

**Task 18.1：ArtifactWorkbench 组件**

文件：新增 `src/components/chat/ArtifactWorkbench.tsx`
- [ ] ChatArea 顶部 Tab 切换「聊天 / 产物(N)」
- [ ] 从 React Query 缓存聚合所有 messages.artifacts[] 去重
- [ ] 卡片网格：按类型显示不同卡片样式
- [ ] 筛选器：类型下拉 / Agent 下拉 / 关键词搜索
- [ ] 排序：最新 / 最旧 / 类型分组

**Task 18.2：ArtifactViewer 全屏查看器**

文件：新增 `src/components/cards/ArtifactViewer.tsx`
- [ ] Code：shiki 高亮 + 行号 + 复制 + 下载
- [ ] Preview：全屏 iframe
- [ ] Diff：左右对比视图
- [ ] File：文件信息 + 下载按钮

**Task 18.3：ChatArea 集成**

文件：`src/components/layout/ChatArea.tsx`
- [ ] 顶部 Tab 栏 + 切换逻辑

---

## 模块 19：Agent 对话式创建

**Spec：** `docs/specs/2026-05-26-p2-highlights.md` 模块 19

**Task 19.1：AgentConfigPreviewCard**

文件：新增 `src/components/agent/AgentConfigPreviewCard.tsx`
- [ ] 渲染 Agent 配置预览（名称、模型、能力、工具、System Prompt）
- [ ] [调整配置] → 弹出 CreateAgentModal 编辑态
- [ ] [确认创建] → 调 `POST /agents` + toast + 跳转新单聊
- [ ] [取消]

**Task 19.2：OrchestratorPlan 集成**

文件：`src/components/chat/OrchestratorPlan.tsx`
- [ ] 识别 `subtask.type === "create_agent"` → 渲染 AgentConfigPreviewCard

**Task 19.3：Mock 对话式创建**

文件：`src/mocks/sse.ts`
- [ ] 关键词识别 + 参数模拟提取

---

## 模块 20：会话分支

**Spec：** `docs/specs/2026-05-26-p2-highlights.md` 模块 20

**后端接口约定：** `POST /api/v1/conversations/{conversation_id}/branch`

**Task 20.1：BranchDialog 组件**

文件：新增 `src/components/chat/BranchDialog.tsx`
- [ ] 分支确认对话框：携带上下文选项 / 携带产物 / 自定义标题
- [ ] 确认 → 调用 conversationApi.branch() 或 Mock 模拟

**Task 20.2：MessageActions 集成**

文件：`src/components/chat/MessageActions.tsx`
- [ ] 加"分支"按钮 → 打开 BranchDialog

**Task 20.3：Mock 分支逻辑**

文件：新增 `src/lib/conversationBranch.ts`
- [ ] Mock 阶段：从 React Query 缓存复制消息到新会话
- [ ] 后端就绪后替换为 API 调用

---

## 模块 21：@提及增强

**Spec：** `docs/specs/2026-05-26-p2-highlights.md` 模块 21

**Task 21.1：@Agent + 指令解析**

文件：`src/lib/mentionParser.ts`
- [ ] 遍历 DOM 找 `[data-mention-id]` chip → 取 chip 后到下一个 chip 之间文本
- [ ] 返回 `[{ agentId, hint }]`

**Task 21.2：ChatInput 增强**

文件：`src/components/chat/ChatInput.tsx`
- [ ] 发送时构造 `task_hints` 字段
- [ ] @ 补全列表每项显示能力标签

**Task 21.3：后端消息类型更新**

文件：`src/types/chat.ts` + `src/lib/api.ts`
- [ ] `SendMessageRequest` 加 `task_hints?: { agent_id: string; hint: string }[]`

---

## 模块 22：首页/落地页

**Spec：** `docs/specs/2026-05-26-p2-highlights.md` 模块 22

**Task 22.1：WelcomePage 组件**

文件：新增 `src/components/layout/WelcomePage.tsx`
- [ ] 标题 + 平台简介
- [ ] 四个快捷操作卡片（新建单聊/群聊/浏览 Agent/查看产物）
- [ ] 最近对话列表（3 条）
- [ ] 可用 Agent 列表
- [ ] 所有交互复用已有弹窗和导航

**Task 22.2：ChatArea 切换**

文件：`src/components/layout/ChatArea.tsx`
- [ ] `conversation === undefined` 时渲染 `<WelcomePage />` 而非空状态

---

## 模块 23：微动效打磨

**Spec：** `docs/specs/2026-05-26-p2-highlights.md` 模块 23

**Task 23.1：CSS 动画定义**

文件：`src/index.css`
- [ ] 4 个 @keyframes：`slideUp` / `shimmer` / `scaleIn` / `fadeIn`
- [ ] `prefers-reduced-motion` 媒体查询禁用所有动画

**Task 23.2：组件加动画**

- [ ] `MessageList.tsx`：消息气泡 `animate-slide-up`
- [ ] `ChatInput.tsx`：发送按钮 `hover:scale-105 active:scale-95 transition-transform`
- [ ] `Skeleton.tsx`：脉冲替换为 shimmer
- [ ] 所有模态框：`animate-scale-in`
- [ ] `Sidebar.tsx`：移动端 slide 过渡 `transition-transform duration-250`
- [ ] 卡片展开/收起：`transition-all duration-200`

---

## 依赖安装汇总

```bash
# P0
npm install react-markdown remark-gfm rehype-raw shiki @shikijs/transformers sonner

# P1
npm install recharts

# P2 — 无新依赖
```

---

## 与后端协作备忘

| # | 事项 | 优先级 | 所属模块 | 接口文档章节 |
|---|------|--------|----------|-------------|
| 1 | SSE 6 种事件标准格式 | P0 | 全部 | 基础 SSE 协议 |
| 2 | 消息历史含 `artifacts[]` | P0 | 1, 18 | 消息 API |
| 3 | `message_end.usage` 字段 | P0 | 5, 15 | SSE message_end |
| 4 | `POST /messages` 新增 `mode: "confirm_plan"` | P2 | 16 | Orchestrator 契约 |
| 5 | SSE `message_start.meta.plan` / `meta.summary` | P2 | 16, 19 | Orchestrator 契约 |
| 6 | `POST /messages` 新增 `task_hints` | P2 | 21 | 消息 API |
| 7 | `POST /conversations/{id}/branch` | P2 | 20 | 新增接口 |
| 8 | `DELETE /agents/{id}` | P1 | 9 | Agent API |
| 9 | `PATCH /agents/{id}` 更新 Agent | P1 | 9 | Agent API |
| 10 | Pin/Unpin 消息 | P1 | 11 | 会话 API |
| 11 | `POST /messages/{id}/regenerate` | P1 | 10 | 消息 API |
