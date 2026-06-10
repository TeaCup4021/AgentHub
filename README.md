# AgentHub

**多 Agent 协作平台** — 以 IM 聊天界面为载体，内置智能编排引擎。既可以与单个 AI Agent 对话，也可以将多个 Agent 拉入群聊，由编排器自动拆解任务、分配执行、汇总结果。

---

## 功能概览

### 对话与编排
- **单 Agent 对话** — 与任意 AI Agent（Claude、GPT、DeepSeek、本地 CLI Agent）实时流式对话
- **群聊 + 编排器** — 一条消息发给多个 Agent，Orchestrator 自动制定执行计划、分发子任务、聚合结果
- **双模式执行** — 动态 Coordinator 模式（LLM 实时分派子任务）+ 静态 DAG Workflow 模式（预定义依赖图）
- **计划审查与调整** — 执行前可预览编排计划，调整任务分配，确认或修改后执行

### Agent 管理
- **完整 CRUD** — 创建、配置、管理 AI Agent，自定义系统提示词、能力标签、工具集
- **多厂商支持** — Anthropic、OpenAI/LiteLLM、DeepSeek，以及本地 CLI Agent（Claude Code、Codex）
- **能力标签** — 自由标签体系，方便发现和匹配合适的 Agent（如"前端"、"测试"、"Python"）
- **连通性验证** — 管理界面内一键测试 Agent 连通性

### 产物卡片（7 种类型）
- **代码卡片** — Shiki 语法高亮，行号显示，一键复制，在线编辑并保存（版本链持久化）
- **Diff 卡片** — 并排/统一差异视图 + 语法高亮，一键"应用到源文件"写回源代码
- **预览卡片** — iframe 内嵌预览网页、Google Docs、Office 文档、Figma、YouTube
- **文件卡片** — Agent 生成文件的下载卡片（PDF、PPTX、图片等）
- **链接预览卡片** — 外部链接的 OpenGraph 元信息预览
- **文档卡片** — PDF、Word、Excel 内联预览，支持全屏 Modal
- **部署状态卡片** — CLI Agent 部署状态追踪

### 选区级代码编辑
- 在代码卡片中划选代码片段 → "引用此片段修改" → AI 返回精准 diff → 一键应用到源卡片，保留版本历史

### ReAct 推理可视化
- **内嵌思维链** — 消息气泡内展示 Thought/Action/Observation 推理步骤
- **ReAct 浮动面板** — 全局可拖拽推理面板，实时展示推理链，支持自动展开、图钉固定、位置记忆

### 产物工作台
- 每个会话独立的"产物"标签页，汇总所有 Agent 输出
- 按产物类型、Agent、关键词筛选
- 点击任意产物进入全屏查看器

### 更多特性
- **认证系统** — JWT 登录 + Refresh Token 自动续期 + 密码管理
- **项目管理** — 按项目组织和管理会话
- **Token 用量面板** — 图表展示 Token 消耗，按 Agent 细分统计
- **暗色/亮色主题** — Semi Design Token 体系，双主题支持，可自定义背景色
- **消息钉选** — 将重要消息固定为后续对话的上下文（通过 ContextAssembler 注入）
- **Mock 模式** — 前端可脱离后端独立开发运行（MSW + Mock SSE）
- **微动效** — 消息滑入、光标闪烁、按钮缩放反馈、骨架屏微光，尊重 `prefers-reduced-motion`

### 后续规划（P2 剩余）
- [ ] **会话分支** — 从任意消息处创建新会话分支，可选携带上下文
- [ ] **@提及 task_hints 增强** — 解析 `@Agent 具体指令`，为编排器提供预设子任务分配

---

## 架构总览

```
┌──────────────────────────────────────────────────────────┐
│                     AgentHub 平台                         │
├────────────────────┬─────────────────────────────────────┤
│   agenthub-web/    │            backend/                  │
│   React 19 + Semi  │       FastAPI + ADK 2.0             │
│   Design + Vite    │                                     │
├────────────────────┤─────────────────────────────────────┤
│  ┌──────────────┐  │  ┌───────────────────────────────┐  │
│  │  AppLayout   │  │  │  API Router (/api/v1/)        │  │
│  │  (数据获取层) │  │  │  ├─ agents/                   │  │
│  ├──────────────┤  │  │  ├─ conversations/            │  │
│  │  ChatArea    │  │  │  ├─ messages/                  │  │
│  │  ├─ Message  │  │  │  ├─ projects/                  │  │
│  │  │   List    │  │  │  ├─ auth/                      │  │
│  │  ├─ ChatInput│  │  │  └─ files/                     │  │
│  │  ├─ Cards    │◄─┼──┼── SSE（7 种事件）              │  │
│  │  ├─ ReAct    │  │  ├───────────────────────────────┤  │
│  │  │   Panel   │  │  │  ADK 引擎                      │  │
│  │  └─ Welcome  │  │  │  ├─ Planner（任务拆解）        │  │
│  ├──────────────┤  │  │  ├─ Coordinator（动态分派）    │  │
│  │  Sidebar     │  │  │  ├─ Workflow（DAG 静态图）     │  │
│  │  ├─ ConvList │  │  │  ├─ ExecutionTracer（执行追踪）│  │
│  │  ├─ Projects │  │  │  └─ MergeAggregator（结果汇总）│  │
│  │  └─ Settings │  │  ├───────────────────────────────┤  │
│  ├──────────────┤  │  │  核心服务                       │  │
│  │  Zustand (6) │  │  │  ├─ ContextAssembler（4层上下文）│  │
│  │  React Query │  │  │  ├─ ArtifactDetector（产物检测）│  │
│  │  SSE Client  │  │  │  ├─ PinSpecInjector（钉选注入） │  │
│  └──────────────┘  │  │  └─ CapabilityRegistry（能力注册）│  │
│                     │  ├───────────────────────────────┤  │
│                     │  │  Adapter 适配层                 │  │
│                     │  │  ├─ AnthropicAdapter           │  │
│                     │  │  ├─ LiteLlmAdapter (OpenAI)    │  │
│                     │  │  └─ CliAdapter (Claude Code)   │  │
│                     │  ├───────────────────────────────┤  │
│                     │  │  基础设施                       │  │
│                     │  │  PostgreSQL + Redis + MinIO     │  │
│                     │  └───────────────────────────────┘  │
└────────────────────┴─────────────────────────────────────┘
```

### 编排管线

```
用户消息 → Planner（LLM 任务拆解）
         → 计划草稿 → 用户审查（DAG 可视化）
         → 调整 / 确认
         → Coordinator（动态分派）/ DAG Workflow（静态执行）
         → StreamSequentializer（有序输出）
         → MergeAggregator（汇总摘要）
         → 前端展示
```

### SSE 流式协议（7 种事件）

| 事件 | 用途 |
|------|------|
| `message_start` | Agent 开始响应，携带计划元信息 |
| `token` | 增量文本输出，逐 token 流式推送 |
| `artifact` | 产物生成通知（代码/文件/预览等） |
| `agent_status` | Agent 执行状态和进度更新 |
| `thinking` | 思维链推理步骤 |
| `message_end` | 消息完成，携带用量统计 |
| `error` | 错误信息，含错误码、描述、是否可重试 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端框架** | React 19 + TypeScript |
| **UI 组件库** | Semi Design 2.x（抖音出品） |
| **状态管理** | Zustand 5（客户端）+ TanStack React Query 5（服务端） |
| **构建工具** | Vite 8 + Rolldown |
| **代码高亮** | Shiki |
| **图表** | Recharts |
| **后端框架** | FastAPI（Python） |
| **Agent 引擎** | Google ADK 2.0 |
| **数据库** | PostgreSQL + SQLAlchemy async |
| **缓存** | Redis |
| **对象存储** | MinIO |
| **认证** | JWT + bcrypt |
| **LLM SDK** | Anthropic SDK + OpenAI/LiteLLM |
| **测试** | Vitest（前端 86 个用例）+ Pytest（后端） |

---

## 快速开始

### 环境要求
- Node.js 20+
- Python 3.11+
- PostgreSQL、Redis、MinIO（或使用 Docker）

### 一键启动（前后端同时）
```bash
npm run dev
```

### 分别启动
```bash
# 仅后端
npm run dev:backend

# 仅前端（默认使用 Mock 数据，无需后端）
cd agenthub-web && npm run dev
```

### 前端 Mock 模式
设置 `VITE_USE_MOCK=true`（默认开启），前端可在无后端环境下独立开发运行。所有 API 调用由 MSW 拦截，模拟真实的 SSE 流式响应。

### 类型检查与测试
```bash
cd agenthub-web
npx tsc -b --noEmit     # TypeScript 类型检查（零错误才算通过）
npx vitest run           # 运行 86 个测试用例
```

---

## 项目结构

```
AgentHub-main/
├── agenthub-web/          # React 19 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/      # ChatArea、MessageList、ChatInput、ReActPanel、ArtifactWorkbench
│   │   │   ├── cards/     # 7 种产物卡片（Code、Diff、File、Preview 等）
│   │   │   ├── layout/    # AppLayout、Sidebar、ConversationList
│   │   │   ├── agent/     # Agent 管理弹窗
│   │   │   ├── settings/  # 设置面板、Token 图表
│   │   │   └── auth/      # 登录与认证组件
│   │   ├── stores/        # Zustand 状态库（chat、ui、auth、agent、dashboard、tokenUsage）
│   │   ├── hooks/         # React Query hooks
│   │   ├── lib/           # API 客户端、SSE 客户端、工具函数
│   │   ├── types/         # TypeScript 类型定义
│   │   └── mocks/         # MSW Mock handlers + Mock 数据
│   └── docs/              # 前端 Spec、Plan、开发日志、验证清单
├── backend/               # FastAPI 后端
│   ├── app/
│   │   ├── api/v1/        # REST API 端点
│   │   ├── core/          # 配置、数据库、异常、中间件、种子数据
│   │   ├── models/        # SQLAlchemy ORM 模型
│   │   ├── schemas/       # Pydantic Schema
│   │   └── services/
│   │       ├── adapters/  # Agent 适配器层（Anthropic、LiteLLM、CLI）
│   │       ├── adk/       # ADK 引擎集成
│   │       └── *.py       # 业务领域服务
│   └── alembic/           # 数据库迁移脚本（10 个）
├── docs/                  # 架构设计、联调记录
│   ├── ai-collab/         # AI 协作约定文档
│   ├── vibe-graph/        # 知识图谱与可追溯索引
│   └── reference/         # 参考文档
└── archive/               # 开发过程产物归档（日计划、日总结）
```

---

## 文档索引

- [前端文档](agenthub-web/docs/README.md) — Spec、Plan、开发日志、验证清单
- [架构设计](docs/AgentHub-架构设计.md) — 后端架构建模
- [前端架构](docs/AgentHub-架构设计前端.md) — 前端架构建模
- [API 约定](docs/AgentHub%20响应格式与前后端对齐约定.md) — 前后端接口契约
- [AI 协作约定](docs/ai-collab/README.md) — AI 辅助开发规范
- [Vibe Graph](docs/vibe-graph/README.md) — 知识可追溯索引

---

## 团队

| 成员 | 分工 |
|------|------|
| 陈晋泽 | 后端开发（FastAPI + ADK 引擎 + Agent 适配器 + SSE 协议） |
| 吕承烨 | 后端开发（业务 API + 数据库 + 认证系统 + 产物服务） |
| 郭锐淇 | 前端开发（React 19 + Semi Design + 状态管理 + 产物卡片） |

---

## 许可证

<!-- 在此填写许可证信息 -->
