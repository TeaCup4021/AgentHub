# 前端约定

## 技术栈

- React 19 + TypeScript 6 + Vite 8
- Semi Design 2.x（`@douyinfe/semi-ui`）
- Zustand 5（客户端状态）
- TanStack React Query 5（服务端状态）
- Axios（HTTP 客户端）
- React Router 7（前端路由）
- Framer Motion 12（动画）
- Monaco Editor、Shiki（代码编辑/高亮）
- Recharts（Token 用量图表）

## 目录结构

```
src/
├── components/
│   ├── auth/         # 登录页面
│   ├── layout/       # 布局（AppLayout, IconSidebar, ChatArea, ConversationList）
│   ├── chat/         # 聊天核心（MessageList, ChatInput, MarkdownBubble, ArtifactWorkbench 等）
│   ├── agent/        # Agent 管理（AgentManageModal, CreateAgentModal）
│   ├── cards/        # 产物卡片（CardRenderer, CodeCard, DiffCard, FileCard 等）
│   ├── editor/       # 代码编辑器
│   ├── project/      # 项目管理
│   ├── settings/     # 设置页面
│   └── ui/           # 通用 UI 组件
├── hooks/            # 自定义 hooks
├── lib/              # 工具函数（sse.ts, api.ts, utils.ts, mentionParser.ts 等）
├── stores/           # Zustand stores
├── types/            # TypeScript 类型定义
├── mocks/            # 模拟数据（MSW）
├── styles/           # 样式
└── __tests__/        # 测试
```

## 状态管理分层

| 类型 | 工具 | 用途 |
|------|------|------|
| 客户端状态 | Zustand | `chatStore`（流式内容、UI 状态）、`uiStore`（主题、背景色）、`authStore`（认证）、`agentStore`、`dashboardStore`、`tokenUsageStore` |
| 服务端状态 | TanStack Query | 对话列表、Agent 列表、消息历史等 API 数据 |
| 流式数据 | SSE（`lib/sse.ts`） | 实时 token、artifact、thinking 事件 |

## 命名风格

- 组件文件：PascalCase（`MessageList.tsx`, `CardRenderer.tsx`）
- Hook 文件：camelCase（`useConversations.ts`）
- Lib 文件：camelCase（`sse.ts`, `utils.ts`）
- Store 文件：camelCase（`chatStore.ts`）
- Store 变量：camelCase（`useChatStore`, `useAuthStore`）
- CSS：Kebab-case（`.message-bubble`, `.chat-input`）

## Mock 机制

- MSW（Mock Service Worker）模式，在 `main.tsx` 通过 `VITE_USE_MOCK` 切换
- 默认 Mock；`VITE_USE_MOCK=false` 切换真实 API
- SSE 也提供了 Mock 实现（`mocks/sse.ts`）
- Mock 数据在 `mocks/data.ts`，handlers 在 `mocks/handlers.ts`

## 主题系统

- 三层颜色体系：底层(页面 bg0) > 中层(卡片 bg1-bg4) > 上层(输入框 fill0)
- 支持 light / dark / system 三种模式
- 自定义背景色（在 `uiStore.bgColor` 配置）
- 主题值通过 CSS 变量在 `document.body` 上设置
