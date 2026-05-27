# AgentHub-前端-Day02-Semi Design 重构 + P0/P1 体验升级

## 实施目标
基于 `origin/main`（Phase 7 ReAct 可视化）之上的代码基线，完成三件大事：Semi Design 全组件 UI 重构（脱离 Tailwind CSS）、P0 核心体验链路打通、P1 体验完整度 9 大模块。

## 计划实现功能

| 层级 | 模块 | 说明 |
|------|------|------|
| UI 重构 Phase 1-6 | Semi Design 全站替换 | 29 个组件摆脱 Tailwind，CSS 变量设计令牌系统 |
| P0 M1-M6 | 核心体验链路 | Markdown+shiki、自动滚底、时间戳、Toast、Mock 模板、SSE 断连 |
| P1 M7-M15 | 体验完整度 | 暗色模式、代码行号、Agent 管理、消息操作、会话增强、骨架屏、响应式、输入增强、Token 图表 |
| 文档 | 文档索引 | 30+ 份 Spec/Plan 文档九阶段索引导航 |

---

## 1. Semi Design UI 重构（Phase 1-6）

### 技术选型

| 项目 | 原方案 | 新方案 |
|------|--------|--------|
| UI 框架 | Tailwind CSS 原子类 | `@douyinfe/semi-ui` + `@douyinfe/semi-icons` |
| 设计令牌 | Tailwind config theme | `tokens.css` CSS 变量（color/radius/shadow/spacing/duration） |
| 暗色模式 | Tailwind `dark:` class | `[theme-mode="dark"]` 属性选择器 |
| 动画 | CSS transition/animation | `framer-motion` AnimatePresence |
| CSS 重置 | Tailwind preflight | `reset-css` |

### 新增依赖

```bash
npm install @douyinfe/semi-ui @douyinfe/semi-icons @douyinfe/semi-illustrations
npm install framer-motion reset-css react-router-dom docx
npm install react-markdown remark-gfm rehype-raw shiki sonner
```

### Phase 1: 基础设施

| 文件 | 用途 |
|------|------|
| `src/styles/tokens.css` | 95 行 CSS 变量令牌（亮/暗两套） |
| `src/App.tsx` | ThemeProvider 封装 (Semi ConfigProvider + theme-mode) |
| `src/stores/uiStore.ts` | `theme: "light" \| "dark"` 双态（本次 P1 扩为三态） |
| `src/main.tsx` | 入口引入 reset-css + tokens.css |
| `tailwind.config.js` | `darkMode: 'class'` 保留基础工具类 |
| `vite.config.ts` | 路径别名确认 |

### Phase 2: 三栏布局

| 文件 | 改动 |
|------|------|
| `IconSidebar.tsx` | **新增** — 最左侧图标导航栏（Semi Button + Tooltip） |
| `ConversationList.tsx` | **新增** — 中间会话列表面板（Semi List + Search + Dropdown） |
| `AppLayout.tsx` | 三栏 Layout 容器 + Sidebar 240-500px |

### Phase 3: 聊天区

| 文件 | 改动 |
|------|------|
| `ChatHeader.tsx` | Semi Typography + Button + Tag |
| `MessageList.tsx` | Semi Card/Avatar 聊天气泡 |
| `ChatInput.tsx` | Semi Button + contentEditable |
| `ThinkingBlock.tsx` | Semi Collapse 推理面板 |
| `ToolCallCard.tsx` | **新增** — 工具调用卡片 |

### Phase 4: 产物卡片

| 文件 | 改动 |
|------|------|
| `CodeCard.tsx` | Semi Card + shiki 渲染 |
| `DiffCard.tsx` | Semi Card + diff 展示 |
| `FileCard.tsx` | Semi Card + Download 按钮 |
| `DeployStatusCard.tsx` | Semi Card + Tag 状态 |
| `PreviewCard.tsx` | Semi Card + iframe |

### Phase 5: Agent 与设置

| 文件 | 改动 |
|------|------|
| `CreateAgentModal.tsx` | Semi Modal + Form + Toast |
| `SettingsPage.tsx` | **新增** — /settings 路由页 |
| `TokenUsagePanel.tsx` | **新增** — Token 用量统计面板 |
| `LLMConfigSection.tsx` | **新增** — LLM 配置表单 |

### Phase 6: 动画

| 文件 | 改动 |
|------|------|
| `MessageList.tsx` | framer-motion AnimatePresence 消息出现动画 |
| `AppLayout.tsx` | 页面切换动效 |

---

## 2. P0 核心体验（M1-M6）

### 新增组件

| 组件 | 路径 | 用途 |
|------|------|------|
| MarkdownBubble | `src/components/chat/MarkdownBubble.tsx` | react-markdown 封装，13 种元素自定义样式 |
| HighlightedCode | `src/components/chat/HighlightedCode.tsx` | shiki v4 代码高亮，17 种语言，折叠+复制 |

### 改造清单

| 文件 | 改动 |
|------|------|
| `MessageList.tsx` | 替换 TextBubble → MarkdownBubble，自动滚底/时间戳/失败气泡 |
| `ChatArea.tsx` | Sonner Toast 通知，SSE 断连重试 + Banner UI |
| `App.tsx` | 挂载 sonner Toaster + 亮/暗色值注入 |
| `mocks/sse.ts` | 动态模板生成 SSE 回复；localStorage 模拟断连 |
| `mocks/handlers.ts` | 导出辅助函数；localStorage 模拟 API 失败模式 |

### Store 变更

| Store | 新增字段 |
|------|---------|
| `chatStore.ts` | `connectionStatus`, `retryCount`, `interruptedMessageId` + 3 个 action |

---

## 3. P1 体验完整度（M7-M15）

### M7 暗色模式三态

| 文件 | 改动 |
|------|------|
| `uiStore.ts` | `theme: "light" \| "dark" \| "system"` + localStorage 持久化 |
| `App.tsx` | matchMedia system 模式监听 + Semi 色值动态注入 |
| `SettingsPage.tsx` | SegmentedControl 三选一主题切换 |
| `tokens.css` | 暗色变量微调 |

### M8 代码行号

| 文件 | 改动 |
|------|------|
| `HighlightedCode.tsx` | `@shikijs/transformers` 的 `transformerLineNumbers()` |

### M9 Agent 管理完整化

| 文件 | 改动 |
|------|------|
| `AgentManageModal.tsx` | **新增** — 卡片网格 + 搜索过滤 + 编辑/删除 |
| `CreateAgentModal.tsx` | 支持 `initialData` prop → 编辑模式 |
| `useAgents.ts` | 新增 `useDeleteAgent` mutation |
| `lib/api.ts` | 新增 `agentApi.delete(id)` |

### M10 消息操作栏

| 文件 | 改动 |
|------|------|
| `MessageActions.tsx` | **新增** — hover 复制/引用/重新生成 |
| `MessageList.tsx` | MessageBubble 集成操作栏 |
| `chatStore.ts` | 新增 `pendingQuote` 状态 |

### M11 会话功能补全

| 文件 | 改动 |
|------|------|
| `ConversationList.tsx` | 批量选择模式（Checkbox + 浮动操作栏）+ 右键导出 |
| `exportConversation.ts` | **新增** — Markdown 生成 + Blob 下载 |
| `ChatArea.tsx` / `ChatHeader.tsx` | 消息搜索栏 + 关键词高亮跳转 |

### M12 骨架屏 + 空状态

| 文件 | 改动 |
|------|------|
| `Skeleton.tsx` | **新增** — 通用骨架屏组件 |
| `ConversationList.tsx` | 加载态 5 条骨架占位 |
| `ChatArea.tsx` | 空消息时显示 conversation starters 快捷提示 |

### M13 响应式基础

| 文件 | 改动 |
|------|------|
| `useMediaQuery.ts` | **新增** — 响应式断点 hook |
| `AppLayout.tsx` | 拖拽分隔线（200-500px）+ 断点适配 |
| `ConversationList.tsx` | <768px 移动端抽屉覆盖 |
| `uiStore.ts` | `sidebarWidth` + `setSidebarWidth` 持久化 |

### M14 聊天输入增强

| 文件 | 改动 |
|------|------|
| `ChatInput.tsx` | 粘贴图片（FileReader → contentEditable `<img>`） |
| `ChatInput.tsx` | 拖拽文件（DragOver/Drop 事件处理） |
| `ChatInput.tsx` | 字数统计（`{length}/8000`，超 80% 黄/超限红） |

### M15 Token 用量图表

| 文件 | 改动 |
|------|------|
| `tokenUsageStore.ts` | 新增 `events: TokenEvent[]` + `agentName` 字段 |
| `TokenCharts.tsx` | **新增** — recharts 三图表（AreaChart/PieChart/BarChart） |
| `TokenUsagePanel.tsx` | 嵌入 TokenCharts |
| `ChatArea.tsx` | addUsage 传入 agentName |

### 新增依赖

```bash
npm install recharts @shikijs/transformers
```

---

## 4. 文档整理

| 文件 | 说明 |
|------|------|
| `docs/README.md` | **新增** — 30+ 份文档九阶段索引，含按角色/按阶段双路径导航 |

---

## 5. 验证检查点

- [x] `npx tsc -b --noEmit` 零错误
- [x] Semi Design 全组件渲染正确（29 个组件文件）
- [x] 暗色模式三态切换 + localStorage 持久化 + system 跟随
- [x] P0 核心链路：Markdown 渲染 / 滚底 / 时间戳 / Toast / Mock / SSE 断连
- [x] P1 9 个模块：暗色/行号/Agent管理/消息操作/会话增强/骨架屏/响应式/输入增强/Token图表
- [x] Vite 构建成功 (`npx vite build`)

---

## 6. 依赖与风险

### 依赖
- Semi Design `@douyinfe/semi-ui` v2.99+ — CSS 变量体系，需确保 tokens.css 与 semi 内置变量不冲突
- `recharts` v3.8+ — 动态加载（CJS pre-bundling 兼容）
- `@shikijs/transformers` v4.1+ — 行号通过 CSS counter 实现，非 JS 遍历

### 后端协作
- `DELETE /agents/{id}` — 前端已接入，后端需确认端点存在（标准 REST，应已支持）
- `tokenUsageStore` 的 `agentName` 字段由前端本地传入，后端无需改动
- SSE `finish_reason: "interrupted"` 建议后端支持（当前仅前端模拟）
