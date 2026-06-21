# AgentHub

**多 Agent 协作平台** — 以 IM 聊天界面为载体，内置 Google ADK 2.0 智能编排引擎。既可以与单个 AI Agent 对话，也可以将多个 Agent 拉入群聊，由 Orchestrator 自动拆解任务、分配执行、汇总结果。

---

## 功能概览

### 对话与编排
- **单 Agent 对话** — 与任意 AI Agent（Claude、GPT、DeepSeek、Codex、本地 CLI Agent）实时 SSE 流式对话
- **群聊 + 编排器** — 一条消息发给多个 Agent，Orchestrator 自动制定执行计划、分发子任务、聚合结果
- **双模式执行** — 动态 Coordinator 模式（LLM 实时分派子任务）+ 静态 DAG Workflow 模式（预定义依赖图）
- **计划审查与调整** — 执行前可预览编排计划，调整任务分配，确认或修改后执行

### Agent 管理
- **完整 CRUD** — 创建、配置、管理 AI Agent，自定义系统提示词、能力标签、工具集、API Key
- **多厂商适配** — Anthropic（Claude）、OpenAI/LiteLLM（Codex / 100+ 模型）、Google ADK（Gemini）、本地 CLI Agent
- **能力标签** — 自由标签体系 + CapabilityRegistry，自动匹配最合适的 Agent
- **连通性验证** — 管理界面内一键测试 Agent 连通性

### 产物卡片
- **代码卡片** — Shiki 语法高亮 + Monaco Editor 在线编辑，行号显示，一键复制，版本链持久化
- **Diff 卡片** — 并排/统一差异视图 + 冲突解决器，一键"应用到源文件"写回源代码
- **预览卡片** — iframe 内嵌预览网页、Figma、YouTube、Google Docs、Office 文档
- **文件卡片** — Agent 生成文件的下载卡片（PDF、PPTX、图片等）
- **链接预览卡片** — 外部链接的 OpenGraph 元信息预览
- **文档卡片** — PDF（react-pdf）、Word（mammoth）、Excel（xlsx）内联预览，支持全屏 Modal
- **部署状态卡片** — CLI Agent 部署状态追踪

### 选区级代码编辑
- 在代码卡片中划选代码片段 → "引用此片段修改" → AI 返回精准 diff → 一键应用到源卡片，保留版本历史

### ReAct 推理可视化
- **内嵌思维链** — 消息气泡内展示 Thought/Action/Observation 推理步骤
- **ReAct 浮动面板** — 全局可拖拽推理面板，实时展示推理链，支持自动展开、图钉固定

### 产物工作台
- 每个会话独立的 Artifact 标签页，汇总所有 Agent 输出
- 按产物类型、Agent、关键词筛选，按时间线浏览

### 基础设施
- **认证系统** — JWT 登录 + Refresh Token 自动续期 + 密码管理
- **项目管理** — 按项目组织和管理会话
- **Token 用量面板** — 图表展示 Token 消耗，按 Agent 细分统计
- **暗色/亮色主题** — Semi Design Token 体系 + TailwindCSS，双主题支持，可自定义背景色
- **消息钉选** — Pin 关键消息，通过 ContextAssembler 注入后续对话上下文
- **Mock 模式** — 前端可脱离后端独立开发运行（MSW + Mock SSE）
- **微动效** — Framer Motion 驱动的消息滑入、光标闪烁、按钮缩放反馈，尊重 `prefers-reduced-motion`
- **会话导出** — 将对话导出为 Markdown 文件
- **消息引用/重生成** — 引用回复、重新生成 Agent 回答

---

## 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                        AgentHub 平台                              │
├──────────────────────────────────────────────────────────────────┤
│  前端 (agenthub-web/)                                            │
│  React 19 + TypeScript + Vite + Semi Design 2.x                  │
│  Zustand + TanStack React Query + Framer Motion + TailwindCSS    │
│  Shiki + Monaco Editor + react-markdown + Recharts              │
│                                                                   │
│  后端 (backend/)                                                  │
│  FastAPI + Uvicorn + SQLAlchemy async + PostgreSQL                │
│  Redis + Celery + MinIO + Gotenberg                               │
│  Google ADK 2.0: Runner / Planner / CoordinatorBuilder            │
│  适配层: Anthropic / LiteLLM / Google ADK / CLI Agent             │
│  SSE Translator + ContextAssembler + ArtifactService             │
│                                                                   │
│  基础设施                                                         │
│  Docker Compose: PostgreSQL 16 + Redis 7 + MinIO + Gotenberg      │
│  Alembic 数据迁移（13 个版本）                                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 技术栈详情

### 前端
`agenthub-web/`

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript 6 + Vite 8 |
| UI 组件库 | Semi Design 2.x (`@douyinfe/semi-ui` + `@douyinfe/semi-icons`) |
| 状态管理 | Zustand 5 + TanStack React Query 5 |
| 路由 | react-router-dom 7 |
| Markdown | react-markdown 10 + remark-gfm + rehype-raw |
| 代码高亮 | Shiki 4 + Monaco Editor |
| 动画 | Framer Motion 12 |
| 样式 | TailwindCSS 3 + Semi Design Token 体系 |
| 图表 | Recharts 3 |
| 文档预览 | react-pdf + mammoth + xlsx |
| 通知 | sonner |
| 测试 | Vitest 4 (86 用例) + Playwright (E2E) |
| Mock | MSW + Mock SSE |

### 后端
`backend/`

| 类别 | 技术 |
|------|------|
| 框架 | FastAPI + Uvicorn + Starlette |
| 数据库 | PostgreSQL + SQLAlchemy 2 async + Alembic |
| 缓存/队列 | Redis + Celery |
| 对象存储 | MinIO |
| 文档转换 | Gotenberg |
| Agent 引擎 | Google ADK 2.0 |
| LLM 适配 | Anthropic SDK + OpenAI/LiteLLM + CLI (Claude Code / Codex) |
| 认证 | JWT (python-jose) + bcrypt (passlib) |
| 文档生成 | python-pptx |
| 测试 | Pytest + pytest-asyncio (20 个测试文件) |
| 数据迁移 | Alembic（13 个迁移版本）|

---

## 快速开始
### 环境要求
- Node.js 20+
- Python 3.11+
- Docker（推荐，提供 PostgreSQL、Redis、MinIO、Gotenberg）

### 启动基础设施
```bash
docker compose -f backend/docker-compose.yml up -d
```

### 一键启动（前后端同时）
```bash
npm run dev
```

### 分别启动
```bash
# 仅后端（端口 8080）
npm run dev:backend

# 仅前端（端口 5173，默认使用 Mock 数据，无需后端）
cd agenthub-web && npm run dev
```

### Windows 分窗口启动
```powershell
./dev.ps1   # 打开两个独立 PowerShell 窗口分别运行前后端
```

### 前端 Mock 模式
设置 `VITE_USE_MOCK=true`（默认开启），前端可在无后端环境下独立开发运行。所有 API 调用由 MSW 拦截，模拟真实的 SSE 流式响应。

---

## 项目结构

```
AgentHub/
├── agenthub-web/          # React 19 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/      # ChatHeader、MessageList、ChatInput、ReActPanel、ArtifactWorkbench
│   │   │   │              #   ThinkingBlock、ToolCallCard、OrchestratorPlan、DagGraph 等
│   │   │   ├── cards/     # CodeCard、DiffCard、PreviewCard、FileCard、DeployStatusCard
│   │   │   │              #   DocumentCard、LinkPreviewCard、ConflictResolver、SideBySideDiffViewer
│   │   │   ├── layout/    # AppLayout、ChatArea、ConversationList、IconSidebar
│   │   │   ├── editor/    # MonacoCodeEditor
│   │   │   ├── agent/     # Agent 管理弹窗
│   │   │   ├── settings/  # 设置面板、Token 图表
│   │   │   ├── project/   # 项目管理组件
│   │   │   └── auth/      # 登录与认证组件
│   │   ├── stores/        # Zustand 状态库（chat、ui、auth、agent、dashboard、tokenUsage）
│   │   ├── hooks/         # React Query hooks (useAgents, useMessages, useConversations 等)
│   │   ├── lib/           # API 客户端、SSE 客户端、diff 引擎、实用函数
│   │   ├── types/         # TypeScript 类型定义
│   │   └── mocks/         # MSW Mock handlers + Mock 数据 + Mock SSE
│   ├── e2e/               # Playwright E2E 测试
│   └── docs/              # 前端 Spec、Plan、开发日志、验证清单
├── backend/               # FastAPI 后端
│   ├── app/
│   │   ├── api/v1/        # REST API 端点（health、auth、agents、conversations、messages、orchestrator、projects、files、deployments）
│   │   ├── core/          # 配置、数据库、异常、中间件、种子数据
│   │   ├── models/        # SQLAlchemy ORM 模型（14 个）
│   │   ├── schemas/       # Pydantic Schema
│   │   └── services/
│   │       ├── adapters/  # Agent 适配器（Anthropic、LiteLLM、Google ADK、CLI、SSE Translator）
│   │       ├── adk/       # ADK 引擎（Runner、Planner、CoordinatorBuilder、WorkflowBuilder、ExecutionTracer 等）
│   │       └── *.py       # 业务服务（agent、artifact、auth、conversation、deployment、message 等 20+ 个）
│   ├── alembic/           # 数据库迁移脚本（13 个版本）
│   └── tests/             # Pytest 测试（20 个测试文件）
├── docs/                  # 架构设计文档
│   ├── ai-collab/         # AI 协作约定文档
│   ├── vibe-graph/        # 知识图谱与可追溯索引
│   └── reference/         # 参考文档
├── archive/               # 开发过程产物归档
│   └── development/       # 历史每日计划与总结
├── AgentHubSource/         # Obsidian 知识库
├── package.json            # 根目录 npm 脚本（concurrently）
├── dev.ps1                 # Windows 分窗口启动脚本
└── README.md
```

---

## API 端点

| 路由 | 说明 |
|------|------|
| `GET /api/v1/health` | 健康检查 |
| `POST /api/v1/auth/*` | 认证（登录、注册、刷新 Token）|
| `GET/POST /api/v1/agents` | Agent CRUD |
| `GET/POST /api/v1/conversations` | 会话管理 + SSE 流式消息 |
| `GET/POST /api/v1/messages` | 消息操作（发送、引用、重生成、钉选）|
| `POST /api/v1/orchestrator/*` | 编排器（计划预览、执行、DAG 构建）|
| `GET/POST /api/v1/projects` | 项目管理 |
| `POST /api/v1/files/*` | 文件上传 |
| `GET/POST /api/v1/deployments` | 部署管理 |

---

## 测试

```bash
# 前端
cd agenthub-web
npx tsc -b --noEmit          # TypeScript 类型检查
npx vitest run               # 86 个测试用例
npx playwright test          # E2E 测试

# 后端
cd backend
pytest                        # 20 个测试文件
```

---

## 文档索引

- [前端文档](agenthub-web/docs/README.md) — Spec、Plan、开发日志、验证清单
- [后端架构设计](docs/AgentHub-架构设计.md)
- [前端架构设计](docs/AgentHub-架构设计前端.md)
- [API 接口约定](docs/AgentHub%20响应格式与前后端对齐约定.md)
- [产品设计文档](AgentHub产品设计文档.md)
- [技术文档](AgentHub技术文档.md)
- [功能架构与技术选型](AgentHub-功能架构与技术选型.md)
- [AI 协作约定](docs/ai-collab/README.md)
- [Vibe Graph 可追溯索引](docs/vibe-graph/README.md)
- [后端实施计划](docs/AgentHub-后端开发20天实施计划.md)
- [面试沉淀 MOC](AgentHub%20面试沉淀%20MOC.md)