# AgentHub 前端实施计划

**目标：** 基于 [设计文档](../specs/2026-05-21-agenthub-frontend-design.md)，将 AgentHub 前端从 Mock 状态改造为对接真实后端 API 的多 Agent 协作平台。

**架构：** React Query（服务端状态）+ Zustand（UI 状态）+ SSE（流式）+ 可插拔卡片渲染器

**技术栈：** React 19 + TypeScript + Vite + TailwindCSS + React Query + react-router-dom v7 + Axios

---

## Phase 列表

| Phase | 文件 | 优先级 | 内容 |
|-------|------|--------|------|
| 1 | [phase-1-types-and-infra.md](phase-1-types-and-infra.md) | P0 | 类型对齐、React Query hooks、SSE 重构、Store 精简 |
| 2 | [phase-2-single-chat.md](phase-2-single-chat.md) | P0 | ChatArea 拆分、消息发送、SSE 流式渲染 |
| 3 | [phase-3-rich-cards.md](phase-3-rich-cards.md) | P1 | CodeCard/DiffCard/PreviewCard/FileCard + 可插拔渲染器 |
| 4 | [phase-4-agent-management.md](phase-4-agent-management.md) | P1 | CreateAgentModal 表单 + 接入 Sidebar |
| 5 | [phase-5-group-chat.md](phase-5-group-chat.md) | P0 | OrchestratorPlan、AgentProgressBar、群聊 SSE 集成 |
| 6 | [phase-6-p2-features.md](phase-6-p2-features.md) | P2 | DeployStatusCard、@mention 自动补全 |
| 7 🆕 | [phase-7-thinking-visualization.md](phase-7-thinking-visualization.md) | P1 | ThinkingBlock ReAct 推理可视化 + SSE `thinking` 事件 |
| 8 🆕 | [phase-8-agent-dashboard.md](phase-8-agent-dashboard.md) | P2 | AgentDashboard 可展开面板 + 委派层级 + dashboardStore |
| 9 🆕 | [phase-9-settings-panels.md](phase-9-settings-panels.md) | P2 | LLM 配置面板 + Token 用量统计 + /settings 路由 |

## 文件结构（实施后）

```
src/
├── components/
│   ├── layout/   (AppLayout, Sidebar, ChatArea)
│   ├── chat/     (ChatHeader, MessageList, ChatInput, ThinkingBlock 🆕, OrchestratorPlan, AgentProgressBar, AgentDashboard 🆕)
│   ├── cards/    (CardRenderer, CodeCard, DiffCard, PreviewCard, FileCard, DeployStatusCard)
│   ├── agent/    (CreateAgentModal)
│   └── settings/ 🆕 (SettingsPage, LLMConfigSection, TokenUsagePanel)
├── hooks/        (useConversations, useMessages, useAgents, useAgentStatuses 🆕, useTokenUsage 🆕)
├── stores/       (chatStore, agentStore, uiStore, thinkingStore 🆕, dashboardStore 🆕, tokenUsageStore 🆕)
├── types/        (chat, agent, api)
└── lib/          (api, sse, utils)
```

## 执行顺序

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
                ↘         ↘         ↘
                 Phase 7   Phase 8   Phase 9
```

- Phase 3 和 Phase 4 可以并行执行
- Phase 5 依赖 Phase 2 和 Phase 3
- Phase 7 (Thinking) 依赖 Phase 2，可与 Phase 3/4 并行
- Phase 8 (Dashboard) 依赖 Phase 5，对 agentStatuses 做了重构
- Phase 9 (Settings) 独立模块，不依赖其他 Phase，可随时执行
