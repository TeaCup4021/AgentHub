# 2026-05-27 前端 Semi Design 重构 + P0/P1 完整总结

## 1. 环境变更与基础设施

### 新增依赖（总计 11 个包）

| 阶段 | 新增包 | 用途 |
|------|--------|------|
| Semi Design | `@douyinfe/semi-ui`, `@douyinfe/semi-icons` | UI 组件库 |
| Semi Design | `framer-motion` | 消息动效 + 页面切换 |
| Semi Design | `reset-css`, `docx` | CSS 重置、文档导出 |
| P0 | `react-markdown`, `remark-gfm`, `rehype-raw`, `shiki`, `sonner` | 消息渲染 + Toast |
| P1 | `recharts`, `@shikijs/transformers` | Token 图表、代码行号 |

### 新增文件（17 个）

| 文件 | 类型 | 所属模块 |
|------|------|---------|
| `src/styles/tokens.css` | CSS 变量令牌 | UI Phase 1 |
| `src/components/layout/IconSidebar.tsx` | 导航组件 | UI Phase 2 |
| `src/components/layout/ConversationList.tsx` | 会话列表 | UI Phase 2 |
| `src/components/chat/MarkdownBubble.tsx` | 消息渲染 | P0 M1 |
| `src/components/chat/HighlightedCode.tsx` | 代码高亮 | P0 M1 |
| `src/components/chat/ToolCallCard.tsx` | 工具调用卡片 | UI Phase 3 |
| `src/components/settings/SettingsPage.tsx` | 设置页 | UI Phase 5 |
| `src/components/settings/TokenUsagePanel.tsx` | Token 用量面板 | UI Phase 5 |
| `src/components/settings/LLMConfigSection.tsx` | LLM 配置 | UI Phase 5 |
| `src/components/settings/TokenCharts.tsx` | Token 图表 | P1 M15 |
| `src/components/agent/AgentManageModal.tsx` | Agent 管理 | P1 M9 |
| `src/components/chat/MessageActions.tsx` | 消息操作栏 | P1 M10 |
| `src/components/chat/Skeleton.tsx` | 骨架屏 | P1 M12 |
| `src/hooks/useMediaQuery.ts` | 响应式 hook | P1 M13 |
| `src/lib/formatTime.ts` | 时间格式化 | P0 M3 |
| `src/lib/exportConversation.ts` | 会话导出 | P1 M11 |
| `src/stores/dashboardStore.ts` | 仪表盘状态 | UI Phase 5 |
| `src/stores/tokenUsageStore.ts` | Token 用量 | UI Phase 5 |
| `docs/README.md` | 文档索引 | 文档整理 |

### 删除文件

| 文件 | 原因 |
|------|------|
| `src/components/layout/Sidebar.tsx` | 拆分为 IconSidebar + ConversationList |

---

## 2. 完成的工作

### Semi Design UI 重构（6 Phase）

| Phase | 内容 | 涉及组件数 |
|-------|------|-----------|
| Phase 1 | 基础设施：tokens.css 95 行、ThemeProvider、ConfigProvider | 5 文件 |
| Phase 2 | 三栏布局：IconSidebar + ConversationList + AppLayout | 3 组件 |
| Phase 3 | 聊天区 Semi 化：ChatHeader/ChatInput/MessageList/ThinkingBlock/ToolCallCard | 5 组件 |
| Phase 4 | 产物卡片 Semi 化：Code/Diff/File/Deploy/Preview Card | 5 组件 |
| Phase 5 | Agent + 设置：CreateAgentModal/SettingsPage/TokenUsagePanel/LLMConfigSection | 4 组件 |
| Phase 6 | 动画集成：framer-motion 消息动效 + 页面切换 | 2 文件 |

### P0 核心体验链路（6 模块）

| 模块 | 内容 | 关键实现 |
|------|------|---------|
| M1 Markdown+shiki | react-markdown + shiki v4 语法高亮，13 种 Markdown 元素自定义样式 | MarkdownBubble + HighlightedCode 新组件 |
| M2 自动滚底 | 新消息自动平滑滚动，历史浏览不打扰，浮动"↓N"回底按钮 | MessageList scroll 逻辑 |
| M3 时间戳 | IM 标准 5 分钟分组 + hover 精确时间 Tooltip | formatTime 工具函数 |
| M4 Toast | sonner 全局通知：发送失败/删除/Agent 创建/复制 | App.tsx 挂载 Toaster |
| M5 Mock 模板 | 新 Agent 对话自动生成引用用户输入的 SSE 流回复 | mocks/sse.ts 动态模板 |
| M6 SSE 断连 | 指数退避重试 1s/2s/4s(3次) + 黄→红 Banner + 重连/关闭按钮 | ChatArea connectionBanner |

### P1 体验完整度（9 模块）

| 模块 | 内容 | 关键实现 |
|------|------|---------|
| M7 暗色模式 | 三态 (light/dark/system) + localStorage + Semi 色值动态注入 | uiStore 三态 + App.tsx resolveTheme |
| M8 代码行号 | shiki transformerLineNumbers + CSS counter 行号样式 | HighlightedCode |
| M9 Agent 管理 | 管理面板 (Grid+搜索) + 编辑复用 + useDeleteAgent 乐观删除 | AgentManageModal 新组件 |
| M10 消息操作 | hover 底部操作栏：复制/引用回复/重新生成 | MessageActions + pendingQuote |
| M11 会话增强 | 批量选择模式 + Markdown 导出 + 消息内搜索高亮 | ConversationList + exportConversation |
| M12 骨架屏 | 列表加载骨架占位 + 消息空状态快捷提示 | Skeleton 新组件 |
| M13 响应式 | useMediaQuery + 拖拽分隔线 200-500px + 移动端抽屉 | AppLayout 拖拽逻辑 |
| M14 输入增强 | 粘贴/拖拽图片插入 contentEditable + 字数统计 0/8000 | ChatInput paste/drop 事件 |
| M15 Token 图表 | recharts 三图表 (面积/饼/柱状) + TokenEvent 时间序列 | TokenCharts + tokenUsageStore.events |

### 文档整理（1 项）

| 任务 | 说明 |
|------|------|
| docs/README.md | 30+ 份 Spec/Plan 文档九阶段索引导航，含按角色/按阶段双路径入口 |

---

## 3. 统计

| 维度 | 数据 |
|------|------|
| 涉及文件 (vs origin/main) | 58 files |
| 代码增量 | +11,158 / -2,632 lines |
| 新增组件 | 17 个 |
| 删除组件 | 1 个 (Sidebar → 拆分为 2 个) |
| 新增 Store | 2 个 (dashboardStore, tokenUsageStore) |
| 改造 Store | 3 个 (chatStore, uiStore, agentStore) |
| 新增依赖 | 11 个 npm 包 |
| 新增路由 | 1 个 (/settings) |

---

## 4. 测试结果

- **类型检查**：`npx tsc -b --noEmit` 零错误
- **构建**：`npx vite build` 成功
- **Markdown 渲染**：表格/列表/引用/代码块正确渲染
- **shiki 高亮**：17 种语言 dark-plus 主题 + 行号 + 折叠 + 一键复制
- **暗色模式**：三态切换 → localStorage 持久化 → 刷新保持 → system 自动跟随
- **自动滚底**：新消息 smooth 滚动，向上浏览时浮动按钮出现
- **时间戳**：5 分钟间隔分组，"今天/昨天/周X/MM-DD HH:mm" 格式
- **Toast**：sonner 覆盖发送失败/删除/Agent 创建/复制
- **Mock 模板**：新 Agent 发消息自动生成引用用户输入的 SSE 回复
- **SSE 断连**：`mock_fail_mode=sse_disconnect` 触发黄色重连 → 红色失败 → 指数退避重试
- **Agent 管理**：卡片网格 + 搜索过滤 + 编辑预填 + 乐观删除
- **消息操作**：hover 出现操作栏 → 复制 toast → 引用插入输入框
- **会话功能**：批量选择 → 批量归档 → 导出 .md → 消息搜索高亮跳转
- **响应式**：缩小窗口 → 侧边栏抽屉 → 拖拽分隔线 200-500px → 刷新保持宽度
- **输入增强**：粘贴截图 → 拖拽文件 → 超字数红色禁用
- **Token 图表**：完成对话后设置页面积图/饼图/柱状图有数据

---

## 5. 前后端对齐事项

### 需要后端关注

1. **`DELETE /agents/{id}`** — 前端 `agentApi.delete(id)` 已接入，确认后端端点存在并返回标准 `ApiResponse<void>`
2. **`finish_reason: "interrupted"`** (建议) — 前端 SSE 断连后 `finalizeStreaming`，期望后端持久化中断消息并返回此 finish_reason

### 无需后端改动

- `tokenUsageStore` 的 `agentName` + `events[]` 由前端本地跟踪，不从后端获取
- `pendingQuote` 引用回复为前端 UI 状态，不涉及 API
- `theme` 三态为纯前端 localStorage + matchMedia
- 图片粘贴/拖拽当前以 base64 内联，后端就绪后再切换为上传 URL

### 补充到对齐约定文档的内容

详见下文「前后端对齐补充」。

---

## 6. 下一步

- **后端同步**：确认 `DELETE /agents/{id}` 端点就绪
- **P2 差异化亮点（M16-M23）**：群聊全链路、ReAct 推理面板、产物工作台、Agent 对话式创建、会话分支、@提及增强(task_hints)、首页落地页、微动效
- **真实后端对接**：Mock → 真实 API 切换，SSE 真实联调
