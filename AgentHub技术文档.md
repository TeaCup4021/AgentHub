# AgentHub 技术文档

> **版本**: v1.0  
> **日期**: 2026-06-10  
> **面向读者**: 后端开发者、前端开发者、DevOps  

---

## 目录

1. [开发环境搭建](#1-开发环境搭建)
2. [项目结构](#2-项目结构)
3. [后端架构](#3-后端架构)
4. [前端架构](#4-前端架构)
5. [数据库设计](#5-数据库设计)
6. [API 参考](#6-api-参考)
7. [SSE 流式协议](#7-sse-流式协议)
8. [Agent 适配器模式](#8-agent-适配器模式)
9. [ADK 引擎集成](#9-adk-引擎集成)
10. [上下文组装与 Token 预算](#10-上下文组装与-token-预算)
11. [产物检测管道](#11-产物检测管道)
12. [部署管道](#12-部署管道)
13. [测试指南](#13-测试指南)
14. [编码规范](#14-编码规范)
15. [环境变量参考](#15-环境变量参考)
16. [故障诊断](#16-故障诊断)

---

## 1. 开发环境搭建

### 1.1 前置依赖

| 依赖 | 版本要求 | 用途 |
|------|----------|------|
| Python | ≥ 3.11 | 后端运行时 |
| Node.js | ≥ 20 | 前端运行时 |
| PostgreSQL | ≥ 15 | 主数据库 |
| Redis | ≥ 7 | 缓存（可选，开发可跳过） |
| MinIO | 最新 | 对象存储（可选，开发可跳过） |
| Gotenberg | ≥ 8 | 文档转换（可选，影响 PPTX 预览） |
| Claude Code CLI | 最新 | CLI Agent 本地执行（可选） |
| Codex CLI | 最新 | CLI Agent 本地执行（可选） |

### 1.2 快速启动

```bash
# 1. 克隆仓库
git clone <repo-url> && cd AgentHub

# 2. 一键启动前后端（使用 Mock 模式）
npm run dev

# 3. 仅后端
npm run dev:backend
# 等效于: cd backend && source .venv/Scripts/activate && uvicorn app.main:app --reload

# 4. 仅前端
cd agenthub-web && npm run dev
# 启动于 http://localhost:5173

# 5. 使用真实 API（禁用 Mock）
cd agenthub-web
VITE_USE_MOCK=false npm run dev
```

### 1.3 后端环境配置

```bash
# 创建虚拟环境
cd backend
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入实际的 API Key / 数据库连接等

# 数据库迁移
alembic upgrade head

# 启动开发服务器
uvicorn app.main:app --reload --port 8080

# API 文档
# Swagger UI: http://localhost:8080/docs
# ReDoc:      http://localhost:8080/redoc
```

### 1.4 前端环境配置

```bash
cd agenthub-web
npm install

# 环境变量（可选）
cp .env.local.example .env.local
# 编辑 VITE_USE_MOCK=false 切换真实 API

npm run dev  # http://localhost:5173
```

### 1.5 Docker 快速部署基础设施

```bash
# PostgreSQL
docker run -d --name agenthub-pg \
  -e POSTGRES_USER=agenthub -e POSTGRES_PASSWORD=agenthub \
  -p 5433:5432 postgres:16

# Redis
docker run -d --name agenthub-redis -p 6379:6379 redis:7

# MinIO
docker run -d --name agenthub-minio \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"

# Gotenberg (文档转换)
docker run -d --name agenthub-gotenberg -p 3001:3000 gotenberg/gotenberg:8
```

---

## 2. 项目结构

### 2.1 顶层目录

```
AgentHub/
├── backend/                    # FastAPI 后端（Python）
│   ├── app/
│   │   ├── api/                # API 路由层
│   │   │   ├── router.py       # 路由注册中心
│   │   │   └── v1/             # v1 端点
│   │   ├── core/               # 基础设施
│   │   ├── models/             # SQLAlchemy ORM（15 表）
│   │   ├── schemas/            # Pydantic Schema
│   │   └── services/           # 业务逻辑
│   │       ├── adapters/       # Agent 适配器
│   │       └── adk/            # ADK 引擎集成
│   ├── alembic/                # 数据库迁移
│   ├── tests/                  # pytest 测试（20 文件, ~95 测试）
│   ├── requirements.txt
│   └── .env.example
│
├── agenthub-web/               # React 19 前端（TypeScript）
│   ├── src/
│   │   ├── components/         # UI 组件
│   │   │   ├── layout/         # 布局组件
│   │   │   ├── chat/           # 聊天核心
│   │   │   ├── cards/          # 产物卡片（8 种）
│   │   │   ├── orchestrator/   # 群聊编排
│   │   │   ├── agent/          # Agent 管理
│   │   │   ├── settings/       # 设置页
│   │   │   ├── auth/           # 认证
│   │   │   ├── project/        # 项目管理
│   │   │   ├── editor/         # Monaco Editor
│   │   │   └── ui/             # 通用 UI
│   │   ├── stores/             # Zustand（6 stores）
│   │   ├── lib/                # 工具模块
│   │   ├── types/              # TypeScript 类型
│   │   ├── mocks/              # MSW Mock
│   │   └── e2e/                # Playwright E2E
│   ├── package.json
│   └── vite.config.ts
│
├── docs/                       # 架构设计、集成记录
│   ├── ai-collab/              # AI 协作约定（API 契约/决策/调试）
│   └── vibe-graph/             # Vibe Graph 工作流追踪
│
├── vibeCodingPlan/             # 每日开发计划
├── vibeCodingSummary/          # 每日完成总结
├── Agenthub/                   # 产品 & 技术文档
├── CLAUDE.md                   # 项目上下文（AI 助手指令）
├── README.md
└── package.json                # 根目录便捷脚本
```

### 2.2 前后端文件统计

| 类别 | 数量 | 说明 |
|------|------|------|
| 后端模型 | 15 表 | user, agent, conversation, message, artifact, deployment, project, orchestrator_task, orchestrator_subtask, conversation_participant, message_mention, message_pin, verification_code + 2 base |
| 后端 API 端点 | ~40+ | 覆盖 CRUD + SSE 流式 + 编排 + 部署 |
| 后端服务模块 | 25+ | 领域服务 + ADK 集成 + Adapter |
| 后端测试 | 20 文件 / ~95 函数 | pytest 异步测试 |
| 前端页面 | 10+ | 聊天、Agent 管理、设置、认证 等 |
| 前端组件 | 50+ | 含 8 种产物卡片 + 子组件 |
| 前端 Stores | 6 | chat, ui, auth, agent, dashboard, tokenUsage |
| 前端单元测试 | 19 文件 | vitest |
| E2E 测试 | 6 spec | Playwright |
| Alembic 迁移 | 14 文件 | 含 deployments, runtime_meta, conversation_purpose |

---

## 3. 后端架构

### 3.1 分层架构

```
┌─────────────────────────────────────────────┐
│                  API Layer                   │
│  (api/v1/*.py) — 薄层，参数提取 + 分发       │
│  输入: Request → Pydantic Schema             │
│  输出: JSON { code, data, message }          │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────┴──────────────────────────┐
│               Service Layer                  │
│  ┌─────────────────┐  ┌──────────────────┐  │
│  │ Domain Services  │  │  ADK Integration │  │
│  │ • agent.py       │  │  • runner.py     │  │
│  │ • conversation.py│  │  • planner.py    │  │
│  │ • message.py     │  │  • coordinator   │  │
│  │ • artifact.py    │  │  • workflow      │  │
│  │ • deployment.py  │  │  • tracer        │  │
│  │ • context_       │  │  • merge_        │  │
│  │   assembler.py   │  │    aggregator.py │  │
│  │ • artifact_      │  │  • stream_       │  │
│  │   detector.py    │  │    sequentializer│  │
│  └─────────────────┘  └──────────────────┘  │
│  ┌──────────────────────────────────────┐    │
│  │         Adapter Layer                │    │
│  │  base.py → Anthropic/LiteLLM/CLI     │    │
│  │  adk_to_sse.py → 7 事件翻译器        │    │
│  └──────────────────────────────────────┘    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────┴──────────────────────────┐
│               Core Layer                     │
│  config.py | database.py | exceptions.py     │
│  middleware.py | seed.py | schema_compat.py  │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────┴──────────────────────────┐
│            Data Layer                        │
│  models/ (15 ORM) + alembic/ (14 migrations) │
└─────────────────────────────────────────────┘
```

### 3.2 请求生命周期

```
HTTP Request
    │
    ▼
ResponseWrapperMiddleware  # 自动包装非 SSE 响应为 {code, data, message}
    │
    ▼
API Router (api/v1/*.py)  # 参数校验 → Pydantic Schema
    │
    ▼
Service Layer             # 业务逻辑
    │
    ├─→ AsyncSession (get_db)  # 数据库操作
    ├─→ AdapterRegistry.get()  # Agent 调用
    └─→ MinIO / Gotenberg      # 外部服务
    │
    ▼
JSON Response / SSE Stream
```

### 3.3 异常处理体系

```python
# 异常层次
AppException(code, message)           # 基类
├── NotFoundException(404)            # 资源不存在
├── ValidationException(422)          # 参数校验失败
├── UnauthorizedException(401)        # 未认证
└── InternalException(500)            # 内部错误

# 4 个全局 handler（在 core/exceptions.py 注册）
app_exception_handler      # AppException → { code, data: null, message }
http_exception_handler     # StarletteHTTPException → 同上 + 日志
validation_exception_handler  # RequestValidationError → 422 + 详细字段错误
global_exception_handler   # 兜底 Exception → 500
```

### 3.4 中间件

**ResponseWrapperMiddleware** (`core/middleware.py`)：
- 拦截所有 `application/json` 响应
- 自动包装为 `{ code, data, message }` 格式
- 跳过 SSE（`text/event-stream`）、OpenAPI 文档端点
- 已包装过的响应不重复包装

### 3.5 关键设计决策

| 决策 | 原因 |
|------|------|
| `sa_delete().where()` 替代 `db.delete()` | SQLAlchemy UOW flush 顺序不可控，复杂 FK 链下可能导致 IntegrityError |
| 应用层 UUID 替代 ADK invocation_id | ADK ID 格式非标准 UUID（如 `e-xxxx`），直接入库抛 ValueError |
| SSE `message_end` 在持久化后发送 | 防止前端收到事件后立即刷新查询但消息尚未写入 DB |
| `before_model_callback` 顶部清理空 Part | 代理 API 可能返回空 text block，重新序列化时 ADK 抛 NotImplementedError |
| base_url 自动剥离标准后缀 | Anthropic SDK / LiteLLM 自动追加 `/v1/messages`，保留会导致双倍 URL |
| 产物检测双通道（文本 + 工具响应） | CLI Agent 通过 function_response 输出文件，仅看文本会漏掉 |

---

## 4. 前端架构

### 4.1 组件树

```
<App>
  <QueryClientProvider>
    <ConfigProvider>             # Semi Design 配置
      <ThemeSync />              # 主题 CSS 变量注入
      <BrowserRouter>
        <AuthInit>               # 启动时 fetchMe()
          <AnimatedRoutes>
            <Route /login → LoginPage />
            <Route /* → ProtectedRoute → AppLayout />
          </AnimatedRoutes>
        </AuthInit>
      </BrowserRouter>
      <Toaster />                # Sonner 通知
    </ConfigProvider>
  </QueryClientProvider>

<AppLayout>
  <IconSidebar />               # 64px 固定侧栏
  <ConversationList />          # 280px 可拖拽调整
  <ChatArea>                    # flex: 1
    <MessageList>
      <MessageBubble>
        <MarkdownBubble />      # 文本渲染
        <ThinkingBlock />       # 思维链
        <CardRenderer>          # 产物卡片分发器
          <CodeCard />
          <DiffCard />
          <FileCard />
          <PreviewCard />
          <LinkPreviewCard />
          <DocumentCard />
          <DeployStatusCard />
          <ConflictResolver />
        </CardRenderer>
        <MessageActions />      # 悬浮操作菜单
      </MessageBubble>
    </MessageList>
    <OrchestratorPlan />        # 计划审批卡片
    <DagGraph />                # DAG 可视化
    <AgentProgressBar />        # 执行进度
    <ReActPanel />              # 推理追踪
    <ChatInput>                 # 输入框 + @提及 + 文件上传
  </ChatArea>
</AppLayout>
```

### 4.2 状态管理三层架构

```
┌─────────────────────────────────────────────────────┐
│                   Zustand Stores (6)                 │
│  客户端状态，同步即时，支持 React 外调用             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ chatStore │ │ uiStore  │ │authStore │            │
│  │ • 流式    │ │ • 主题   │ │ • 登录态 │            │
│  │ • 引用    │ │ • 背景色 │ │ • token  │            │
│  │ • Pin     │ │ • 侧栏宽 │ │ • fetchMe│            │
│  │ • Plan    │ │          │ │          │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │agentStore│ │dashboard │ │tokenUsage│            │
│  │ • 列表   │ │Store     │ │Store     │            │
│  │ • 选择   │ │ • 数据   │ │ • 统计   │            │
│  └──────────┘ └──────────┘ └──────────┘            │
├─────────────────────────────────────────────────────┤
│              TanStack React Query (5)                │
│  服务端状态，自动缓存/失效/重取                      │
│  • ["messages", convId]   — 消息列表                │
│  • ["conversations"]      — 对话列表                │
│  • ["agents"]             — Agent 列表              │
│  • ["pins", convId]       — 钉选消息                │
│  • ["deployments", id]    — 部署状态                │
├─────────────────────────────────────────────────────┤
│              SSE Manager (lib/sse.ts)                │
│  实时流式数据，AbortController 中断                 │
│  • message_start / token / artifact / agent_status  │
│  • thinking / message_end / error                   │
│  • 按 event: 行解析 → 回调分发                      │
└─────────────────────────────────────────────────────┘
```

### 4.3 SSE 客户端实现

```typescript
// lib/sse.ts — 核心流程
function createSSEStream(conversationId, callbacks, prompt?, orchestrateMode?, plannerAgentId?) {
  // 1. 构建 URL（含 prompt / orchestrateMode / plannerAgentId 查询参数）
  const streamUrl = new URL(`/api/v1/conversations/${conversationId}/stream`, origin);
  
  // 2. fetch GET + AbortController
  const controller = new AbortController();
  fetch(streamUrl, { signal: controller.signal, headers: { Accept: "text/event-stream" } })
    .then(async (response) => {
      // 3. ReadableStream 逐行解析
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        // 4. 解析 SSE 格式: event: xxx\ndata: {...}\n\n
        // 5. 事件名 → handler 映射 → 回调分发
        eventHandlers[currentEvent]?.(JSON.parse(currentData));
      }
    });

  // 6. 返回 abort 函数
  return () => controller.abort();
}
```

### 4.4 关键前端模式

| 模式 | 实现 | 示例 |
|------|------|------|
| **queryClient 单例** | `lib/queryClient.ts` 导出模块级实例 | 深埋组件（卡片）直接 import 调 `invalidateQueries`，免 hook 依赖 |
| **流式 buffer 隔离** | chatStore 按 `messageId` 独立管理 `streamingContent` | 多 Agent 并行输出各自维护各自 buffer |
| **乐观更新** | 发送消息时先追加本地 pending 消息 | 消息即时显示，SSE 返回后替换 |
| **自动滚动** | 新 token 到达 → `scrollIntoView`；用户手动上滚 → 停止自动滚动 | |
| **@提及解析** | ChatInput 监听 `@` 字符 → 搜索 Agent → 插入标签 | 群聊触发入口 |

---

## 5. 数据库设计

### 5.1 技术栈

- **数据库**: PostgreSQL 15+
- **ORM**: SQLAlchemy 2.0 async
- **迁移**: Alembic
- **连接池**: pool_size=20, max_overflow=10 (asyncpg)

### 5.2 核心表 DDL

#### agents

```sql
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    provider VARCHAR(50) NOT NULL,          -- anthropic/openai/deepseek/claude-code-cli/codex-cli
    model VARCHAR(100) NOT NULL,
    system_prompt TEXT,
    capabilities JSONB NOT NULL DEFAULT '[]',  -- ["coding", "writing", "frontend"]
    api_key VARCHAR(500),                      -- API 密钥
    base_url VARCHAR(500),
    tool_config JSONB,                         -- { tools: [{type, name}] }
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 能力标签查询索引
CREATE INDEX idx_agents_capabilities ON agents USING gin(capabilities);
```

#### conversations

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    type VARCHAR(20) NOT NULL,               -- 'direct' | 'group'
    purpose VARCHAR(30) NOT NULL DEFAULT 'normal',  -- 'normal' | 'orchestrator'
    owner_id UUID NOT NULL REFERENCES users(id),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### messages

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    sender_type VARCHAR(20) NOT NULL,        -- 'user' | 'agent' | 'system'
    sender_id UUID,
    parent_message_id UUID REFERENCES messages(id),  -- 重新生成时指向原消息
    content_type VARCHAR(20) NOT NULL DEFAULT 'text',
    content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending/streaming/done/error
    meta JSONB,                              -- { usage, plan, ... }
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
```

#### artifacts

```sql
CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    message_id UUID NOT NULL REFERENCES messages(id),
    artifact_type VARCHAR(30) NOT NULL,      -- code/diff/file/webpage/link/document/deploy_status/conflict
    title VARCHAR(200),
    content JSONB NOT NULL,                  -- 卡片内容（结构依类型而定）
    storage_key VARCHAR(500),                -- MinIO key（大文件存储）
    mime_type VARCHAR(100),
    version INTEGER NOT NULL DEFAULT 1,      -- 版本链
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 版本去重查询用
CREATE INDEX idx_artifacts_message_merge 
    ON artifacts(message_id, artifact_type, created_at DESC);
```

#### deployments

```sql
CREATE TABLE deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    user_id UUID NOT NULL,
    trigger_message_id UUID,
    name VARCHAR(255) NOT NULL,
    target VARCHAR(30) NOT NULL DEFAULT 'preview',
    port INTEGER UNIQUE,
    directory VARCHAR(512),
    url VARCHAR(1000),
    download_url VARCHAR(1000),
    source_files JSONB NOT NULL DEFAULT '{}',
    source_summary JSONB NOT NULL DEFAULT '{}',
    runtime_meta JSONB NOT NULL DEFAULT '{}',
    logs JSONB NOT NULL DEFAULT '[]',
    error TEXT,
    process_pid INTEGER,
    status VARCHAR(30) NOT NULL DEFAULT 'ready',  -- ready/building/running/packaged/stopped/failed
    is_active BOOLEAN NOT NULL DEFAULT true,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    stopped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.3 模型关系图

```
users 1──N conversations
users 1──N agents (created_by)
projects 1──N conversations (nullable)
conversations 1──N messages
conversations 1──N conversation_participants
conversations N──M agents (via conversation_participants)
messages 1──N artifacts
messages 1──N message_mentions
messages 1──N message_pins
conversations 1──N message_pins
conversations 1──N orchestrator_tasks
orchestrator_tasks 1──N orchestrator_subtasks
agents 1──N orchestrator_subtasks
conversations 1──N deployments
messages 1──N deployments (trigger_message_id)
```

### 5.4 迁移管理

```bash
# 创建新迁移
cd backend
alembic revision --autogenerate -m "description"

# 执行迁移
alembic upgrade head

# 回滚
alembic downgrade -1

# 查看当前版本
alembic current

# 迁移历史
alembic history
```

---

## 6. API 参考

### 6.1 路由总览

| 方法 | 端点 | 说明 |
|------|------|------|
| **Auth** | | |
| POST | `/api/v1/auth/register` | 用户注册 |
| POST | `/api/v1/auth/login` | 登录（返回 access + refresh token） |
| POST | `/api/v1/auth/refresh` | 刷新 access token |
| GET | `/api/v1/auth/me` | 获取当前用户信息 |
| PUT | `/api/v1/auth/password` | 修改密码 |
| **Agents** | | |
| GET | `/api/v1/agents` | Agent 列表（分页） |
| POST | `/api/v1/agents` | 创建 Agent |
| GET | `/api/v1/agents/{id}` | Agent 详情 |
| PUT | `/api/v1/agents/{id}` | 更新 Agent |
| DELETE | `/api/v1/agents/{id}` | 删除 Agent（级联清理 FK） |
| POST | `/api/v1/agents/{id}/verify` | 验证 Agent 连通性 |
| **Conversations** | | |
| GET | `/api/v1/conversations` | 对话列表（分页，含 pin/archive 过滤） |
| POST | `/api/v1/conversations` | 创建对话 |
| GET | `/api/v1/conversations/{id}` | 对话详情 |
| PATCH | `/api/v1/conversations/{id}` | 更新对话（标题/归档/pin） |
| DELETE | `/api/v1/conversations/{id}` | 软删除对话 |
| GET | `/api/v1/conversations/{id}/stream` | **SSE 流式对话** |
| POST | `/api/v1/conversations/{id}/pin` | 钉选对话 |
| DELETE | `/api/v1/conversations/{id}/pin` | 取消钉选对话 |
| **Messages** | | |
| GET | `/api/v1/conversations/{cid}/messages` | 消息列表（游标分页） |
| POST | `/api/v1/conversations/{cid}/messages` | 发送消息（触发 Agent 响应） |
| POST | `/api/v1/conversations/{cid}/messages/{mid}/regenerate` | 重新生成消息 |
| PATCH | `/api/v1/messages/artifacts/{aid}` | 编辑 artifact 内容（追加版本） |
| **Orchestrator** | | |
| POST | `/api/v1/orchestrator/plan` | 生成执行计划 |
| POST | `/api/v1/orchestrator/refine` | 修改计划 |
| POST | `/api/v1/orchestrator/confirm` | 确认并执行计划 |
| **Projects** | | |
| GET | `/api/v1/projects` | 项目列表 |
| POST | `/api/v1/projects` | 创建项目 |
| GET | `/api/v1/projects/{id}` | 项目详情 |
| PUT | `/api/v1/projects/{id}` | 更新项目 |
| DELETE | `/api/v1/projects/{id}` | 删除项目 |
| **Files** | | |
| POST | `/api/v1/files/upload` | 上传文件（MinIO） |
| GET | `/api/v1/files/download/{key}` | 下载文件 |
| **Deployments** | | |
| GET | `/api/v1/deployments` | 部署列表 |
| POST | `/api/v1/deployments` | 创建部署 |
| GET | `/api/v1/deployments/{id}` | 部署详情 |
| GET | `/api/v1/deployments/{id}/status` | 部署状态轮询 |
| POST | `/api/v1/deployments/{id}/start` | 启动部署 |
| POST | `/api/v1/deployments/{id}/stop` | 停止部署 |
| DELETE | `/api/v1/deployments/{id}` | 删除部署 |
| **Health** | | |
| GET | `/api/v1/health` | 健康检查 |

### 6.2 统一响应格式

```json
// 成功
{
  "code": 200,
  "data": { ... },
  "message": "success"
}

// 客户端错误
{
  "code": 404,
  "data": null,
  "message": "Agent not found"
}

// 参数校验失败
{
  "code": 422,
  "data": null,
  "message": "body -> name: field required; body -> provider: field required"
}
```

### 6.3 认证

```http
# 登录获取 token
POST /api/v1/auth/login
Content-Type: application/json
{
  "username": "demo",
  "password": "demo123"
}
→ { "code": 200, "data": { "accessToken": "...", "refreshToken": "..." } }

# 后续请求携带 token
Authorization: Bearer <access_token>

# Token 过期时刷新
POST /api/v1/auth/refresh
{ "refreshToken": "..." }
→ { "code": 200, "data": { "accessToken": "...", "refreshToken": "..." } }
```

### 6.4 分页格式

```json
// 请求
GET /api/v1/agents?page=1&pageSize=20

// 响应
{
  "code": 200,
  "data": {
    "list": [ ... ],
    "total": 45,
    "page": 1,
    "pageSize": 20
  }
}
```

---

## 7. SSE 流式协议

### 7.1 7 种事件规范

#### `message_start` — Agent 开始响应

```
event: message_start
data: {
  "version": "v1",
  "event_id": "evt-uuid",
  "conversation_id": "conv-uuid",
  "message_id": "msg-uuid",       // 确定性 ID: uuid5(invocation_id|author)
  "sender": {
    "type": "agent",
    "id": "agent-uuid",
    "name": "Claude Opus"
  },
  "timestamp": "2026-06-10T10:30:00.000Z"
}
```

#### `token` — 逐 token 文本增量

```
event: token
data: {
  "version": "v1",
  "event_id": "evt-uuid",
  "conversation_id": "conv-uuid",
  "message_id": "msg-uuid",
  "delta": "Hello",              // 增量文本（非完整消息）
  "index": 42,                   // token 序号
  "timestamp": "..."
}
```

#### `artifact` — 产物卡片

```
event: artifact
data: {
  "version": "v1",
  "event_id": "evt-uuid",
  "conversation_id": "conv-uuid",
  "message_id": "msg-uuid",
  "artifact": {
    "id": "artifact-uuid",
    "artifactType": "code",
    "title": "app.py",
    "language": "python",
    "code": "print('hello')",
    ...
  },
  "timestamp": "..."
}
```

#### `agent_status` — Agent 状态变更

```
event: agent_status
data: {
  "version": "v1",
  "event_id": "evt-uuid",
  "conversation_id": "conv-uuid",
  "message_id": "msg-uuid",
  "subtask_id": "subtask-1",
  "agent": { "id": "agent-uuid", "name": "Claude" },
  "status": "queued",            // queued | running | success | failed
  "progress": 0,                 // 0-100
  "timestamp": "..."
}
```

#### `thinking` — 思维链步骤

```
event: thinking
data: {
  "version": "v1",
  "event_id": "evt-uuid",
  "conversation_id": "conv-uuid",
  "message_id": "msg-uuid",
  "phase": "thought",            // thought | action | observation
  "text": "我需要先读取文件内容...",
  "timestamp": "..."
}
```

#### `message_end` — 消息完成

```
event: message_end
data: {
  "version": "v1",
  "event_id": "evt-uuid",
  "conversation_id": "conv-uuid",
  "message_id": "msg-uuid",
  "finish_reason": "completed",  // completed | stopped | error
  "usage": {
    "input_tokens": 1500,
    "output_tokens": 800
  },
  "timestamp": "..."
}
```

#### `error` — 出错

```
event: error
data: {
  "version": "v1",
  "event_id": "evt-uuid",
  "conversation_id": "conv-uuid",
  "message_id": "msg-uuid",
  "code": "MODEL_NOT_FOUND",
  "message": "Model claude-xxx not available",
  "retryable": false,
  "timestamp": "..."
}
```

### 7.2 事件翻译器实现要点

| 要点 | 实现 |
|------|------|
| **确定性消息 ID** | `uuid5(namespace, f"{invocation_id}|{author}")` — 同一 Agent 的多次输出稳定路由 |
| **partial 过滤** | `partial=False` 的完整文本事件跳过（若已有增量 token） |
| **thought 过滤** | `part.thought=True` 的内容不进入 token delta（防止泄露推理到对话） |
| **DAG 节点过滤** | `agent_name_map` 只包含 Agent 节点，非 Agent 节点（Planner/JoinNode）被跳过 |
| **fallback message_end** | 循环结束后为所有 `seen_invocations - ended_invocations` 补发 `message_end` |
| **工具产物检测** | `_extract_tool_download_artifact` 从 function_response 提取文件产物 |

### 7.3 前端事件处理映射

```typescript
// sse.ts 事件 → Store 操作
const eventHandlers = {
  message_start: (d) => {
    chatStore.initStreamingMessage(d.message_id);
    // 追加 pending 消息到 MessageList
  },
  token: (d) => {
    chatStore.appendStreamToken(d.message_id, d.delta);
    // 打字机效果追加文本
  },
  artifact: (d) => {
    chatStore.appendStreamArtifact(d.message_id, d.artifact);
    // 内联渲染卡片
  },
  agent_status: (d) => {
    // 更新 AgentProgressBar
  },
  thinking: (d) => {
    chatStore.appendThinkingStep(d.message_id, { phase: d.phase, text: d.text });
  },
  message_end: (d) => {
    chatStore.finalizeStreamingMessage(d.message_id);
    queryClient.invalidateQueries(["messages", convId]);
    // 流式结束，刷新消息列表
  },
  error: (d) => {
    toast.error(d.message);
    chatStore.finalizeStreamingMessage(d.message_id);
  },
};
```

---

## 8. Agent 适配器模式

### 8.1 抽象基类

```python
class AgentAdapter(ABC):
    @abstractmethod
    def resolve_model(self, agent: Agent) -> Any:
        """将 DB Agent 的 provider+model 解析为 ADK 模型对象"""
        ...

    @abstractmethod
    def is_cli(self) -> bool:
        """是否为 CLI Agent（本地进程，非远程 API）"""
        ...

    def build_agent(self, agent, tool_loader=None) -> LlmAgent:
        """构建完整的 ADK LlmAgent（含 instruction + tools + callback）"""

    async def verify(self, agent) -> bool:
        """连通性验证：单轮对话测试"""

    async def stream(self, agent, conv_id, user_id, prompt) -> AsyncGenerator:
        """SSE 流式执行"""
```

### 8.2 已注册适配器

| Provider 标识 | 适配器类 | LLM 解析 | 特点 |
|---------------|----------|----------|------|
| `anthropic` | `AnthropicAdapter` | AnthropicLlm | Anthropic 官方 API / 兼容代理 |
| `openai` | `LiteLlmAdapter` | LiteLlm | OpenAI 兼容端点 |
| `deepseek` | `LiteLlmAdapter` | LiteLlm | DeepSeek API |
| `litellm` | `LiteLlmAdapter` | LiteLlm | 通用 LiteLLM 端点 |
| `claude-code-cli` | `CliAdapter` | None | 本地 `claude` 子进程 |
| `codex-cli` | `CliAdapter` | None | 本地 `codex` 子进程 |

### 8.3 注册机制

```python
# 各 adapter 模块 import 时自动注册
# anthropic_adapter.py 底部:
AdapterRegistry.register("anthropic", AnthropicAdapter())
AdapterRegistry.register("claude", AnthropicAdapter())

# litellm_adapter.py 底部:
AdapterRegistry.register("openai", LiteLlmAdapter())
AdapterRegistry.register("deepseek", LiteLlmAdapter())
AdapterRegistry.register("litellm", LiteLlmAdapter())

# cli_adapter.py 底部:
AdapterRegistry.register("claude-code-cli", CliAdapter())
AdapterRegistry.register("codex-cli", CliAdapter())
```

### 8.4 CLI Adapter 特殊处理

```python
class CliAdapter(AgentAdapter):
    def is_cli(self) -> bool:
        return True

    def resolve_model(self, agent) -> None:
        return None  # CLI 不调用远程 LLM

    def build_agent(self, agent, tool_loader=None) -> LlmAgent:
        """构建特殊 LlmAgent:
        - model 设为占位符
        - before_model_callback 注入 CLI interception 逻辑
        - tool_config 转换为 CLI 子进程工具调用
        """

    async def stream(self, agent, conv_id, user_id, prompt):
        """不经过 ADK Runner:
        1. 启动 claude/codex 子进程（--include-partial-messages）
        2. 逐行读取 stdout → JSON 解析
        3. stream_event → SSE token
        4. assistant → SSE thinking + tool_use
        5. 持久化消息前调用 detect_artifacts()
        6. 持久化前 strip_artifact_tags()
        """
```

### 8.5 CLI Runner 解析逻辑

```python
# cli_runner.py:_parse_line
def _parse_line(self, line: str):
    event = json.loads(line)
    event_type = event.get("type")

    if event_type == "stream_event":
        # 增量 delta → SSE token
        delta = event.get("delta", {}).get("text", "")
        self._buffer += delta

    elif event_type == "assistant":
        # 完整消息 — 跳过 text（已通过 stream_event 到达）
        # 保留 thinking 和 tool_use（仅 assistant 事件包含）
        thinking = event.get("thinking", "")
        tool_use = event.get("tool_use", [])
```

---

## 9. ADK 引擎集成

### 9.1 Runner 封装

```python
class AgentHubRunner:
    def __init__(self, agent, app_name="agenthub", session_service=None):
        self.session_service = session_service or InMemorySessionService()
        self.runner = Runner(
            agent=agent,
            app_name=app_name,
            session_service=self.session_service,
        )

    async def stream_single_chat(self, user_id, session_id, message):
        """单聊流式执行"""
        await self._ensure_session(user_id, session_id)
        async for event in self.runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=types.Content(
                role="user",
                parts=[types.Part.from_text(text=message)],
            ),
            run_config=RunConfig(streaming_mode=StreamingMode.SSE),
        ):
            yield event
```

### 9.2 Agent 构建统一入口

```python
# agent_builder.py
def build_agent_for_conversation(agent_model, conversation, db):
    """Agent 构建统一入口，编排各服务的协作:
    1. ContextAssembler.assemble() → 系统指令 + 上下文
    2. AdapterRegistry.get_for_agent() → build_agent()
    3. before_model_callback 链注册:
       - PinSpecInjector: 注入钉选消息 + Spec 规则
       - ArtifactFormat: 注入产物格式指令
       - _sanitize_request_contents: 清理空 Part
    """
```

### 9.3 群聊编排管线

```
POST /orchestrator/plan
    │
    ▼
Planner (LLM)
  - 输入: 用户消息 + @提及的 Agent 列表
  - 输出: PlanSubtask[] (含 agent_id, dependencies, description)
    │
    ▼
plan_draft SSE → 前端 OrchestratorPlan 组件
    │
    ├─→ 用户 approve → POST /orchestrator/confirm
    │       │
    │       ├─→ Coordinator 模式: coordinator_builder.py
    │       │   └─→ Collaborative Workflow: 协调者动态分派
    │       │
    │       └─→ DAG 模式: workflow_builder.py
    │           └─→ Workflow Graph + edges + JoinNode
    │
    └─→ 用户 refine → POST /orchestrator/refine
            └─→ Planner 根据反馈修改计划 → 回到 plan_draft
```

### 9.4 多 Agent 并行输出

```
Coordinator / DAG Workflow
    │
    ├─→ Agent A (invocation_id="e-abc", author="agent_A")
    │   └─→ message_id = uuid5("e-abc|agent_A") → msg-aaa
    │       └─→ SSE events: {message_id: "msg-aaa", ...}
    │
    ├─→ Agent B (invocation_id="e-abc", author="agent_B")   # 同 invocation!
    │   └─→ message_id = uuid5("e-abc|agent_B") → msg-bbb   # 不同 message
    │       └─→ SSE events: {message_id: "msg-bbb", ...}
    │
    └─→ 前端: streamingContent = {
            "msg-aaa": { content: "...", artifacts: [...] },  // Agent A buffer
            "msg-bbb": { content: "...", artifacts: [...] },  // Agent B buffer
        }
```

### 9.5 StreamSequentializer

当 `sequential=True` 时，即使 ADK 并行运行多个 Agent，输出也按 `agent_order` 顺序依次发送：

```python
class StreamSequentializer:
    def __init__(self, agent_order: list[str]):
        self.agent_order = agent_order  # Planner 确定的执行顺序

    async def sequentialize(self, event_stream):
        """缓冲并行事件，按 agent_order 依次 yield"""
```

---

## 10. 上下文组装与 Token 预算

### 10.1 预算分配策略

```
总预算: 128,000 tokens（可配置）
├── System (25%): 32,000 tokens
│   ├── Layer 1: Agent system_prompt
│   ├── Layer 2: Spec Rules
│   └── Layer 3: Pinned Messages
├── History (70%): 89,600 tokens
│   └── Layer 4: Recent Chat History
└── Reserve (5%): 6,400 tokens
    └── Current message + expected output
```

### 10.2 截断优先级

```
被逐出优先级（从高到低）:
1. 最旧的普通历史消息（非钉选）
2. 普通消息逐出完成后 → 最旧的钉选消息
```

### 10.3 Token 估算

```python
@staticmethod
def _count(text: str) -> int:
    """保守估计: ~3 字符/token（同时适用于 CJK + ASCII）"""
    return max(1, len(text) // 3)
```

### 10.4 ContextAssembler 使用示例

```python
assembler = ContextAssembler(token_budget=128000, history_limit=50, pinned_limit=10)

# 组装完整上下文
ctx = await assembler.assemble(db, conv_id, agent_system_prompt)

# ctx.system_instruction → 合并的 system prompt（L1+L2+L3）
# ctx.messages           → 截断后的历史消息（ContextMessage[]）
# ctx.meta               → 各层 token 统计 + 截断计数

# 仅获取 system injection（用于 pin_spec_injector 兼容）
injection = await assembler.build_injection_text(db, conv_id, agent_system_prompt)
```

---

## 11. 产物检测管道

### 11.1 双通道检测

```
Agent 输出
    │
    ├── 通道 1: 文本检测 (artifact_detector.py)
    │   ├── _detect_xml_artifacts()
    │   │   └── 正则: <artifact type="code" language="python" title="app.py">
    │   │       ...
    │   │       </artifact>
    │   ├── _detect_code_blocks()
    │   │   └── 正则: ```python\n...\n```
    │   └── _detect_urls()
    │       └── 正则: https?://...
    │
    └── 通道 2: 工具响应检测 (extract_download_artifacts_from_tool_response)
        └── function_response.inline_data    → FileCard/DocumentCard
        └── function_response.executable_code → CodeCard
                │
                ▼
        _to_artifact():
          1. 优先从工具产物提取（extract_download_artifacts_from_tool_response）
          2. 回退到 custom_metadata / artifact_delta
                │
                ▼
        去重: _mergeKey = md5(content)
        存储: ArtifactService.append_version() → DB + MinIO
        输出: strip_artifact_tags() 清理文本 → SSE artifact 事件
```

### 11.2 文档类型推断

```python
def _infer_document_type(extension: str, mime_type: str) -> str:
    """根据扩展名和 MIME 类型推断文档类型
    
    支持:
    - PDF:  .pdf  | application/pdf
    - DOC:  .doc  | application/msword
    - DOCX: .docx | application/vnd.openxmlformats-officedocument...
    - XLS:  .xls  | application/vnd.ms-excel
    - XLSX: .xlsx | application/vnd.openxmlformats-officedocument.spreadsheetml...
    - PPT:  .ppt  | application/vnd.ms-powerpoint
    - PPTX: .pptx | application/vnd.openxmlformats-officedocument.presentationml...
    - HTML: .html | text/html
    - MD:   .md   | text/markdown
    """
```

### 11.3 可嵌入域名白名单

```python
_EMBEDDABLE_DOMAINS = [
    "docs.google.com",
    "office.com", "office365.com",
    "notion.so",
    "figma.com",
    "youtube.com", "youtu.be",
    "vimeo.com",
]
# 文档文件 (pdf/doc/xls/ppt) 始终允许嵌入
# 其余链接降级为 LinkPreviewCard（OG 卡片 + 新标签页打开）
```

### 11.4 产物格式指令注入

```python
# artifact_format.py
def build_instruction(agent: Agent) -> str:
    """构建 Agent 系统指令，注入产物格式要求"""
    base = agent.system_prompt or ""
    artifact_instruction = """
    当生成以下类型的内容时，使用 <artifact> 标签包裹:
    
    代码:
    <artifact type="code" language="python" title="filename.py">
    ...
    </artifact>
    
    Diff:
    <artifact type="diff" file="filename.py">
    --- before
    ...
    --- after
    ...
    </artifact>
    
    文档:
    <artifact type="document" mimeType="application/pdf" title="report.pdf">
    ...
    </artifact>
    """
    return f"{base}\n\n{artifact_instruction}"


def inject_artifact_reminder(prompt: str) -> str:
    """检测 [选区修改] 哨兵 → 追加 diff 定向约束"""
    if _SELECTION_EDIT_MARKER in prompt:
        return prompt + _SELECTION_EDIT_DIRECTIVE
    return prompt
```

---

## 12. 部署管道

### 12.1 部署流程

```
Agent 输出文本
    │
    ▼
deployment_command.py: 解析部署指令
    ├── 识别框架: HTML/CSS/JS | React | Python | ...
    └── 提取命令: npm install && npm run build
    │
    ▼
deployment_source.py: 收集源码
    ├── 从 artifact content 提取文件列表
    └── 写入临时工作目录
    │
    ▼
deployment.py: 执行部署
    ├── 静态站点: 复制文件到 preview 目录
    └── 容器部署: docker build && docker run -p {port}:{port}
    │
    ▼
Deployment 记录更新
    status: ready → building → running
    port: 自动分配空闲端口
    url: http://localhost:{port}
    │
    ▼
前端 DeployStatusCard 轮询:
    GET /api/v1/deployments/{id}/status (每 3s)
    当 status=running → 显示预览链接
```

### 12.2 部署状态机

```
                    ┌─────────┐
                    │  ready  │ ← 初始状态
                    └────┬────┘
                         │ POST /start
                         ▼
                    ┌──────────┐
              ┌─────│ building │─────┐
              │     └──────────┘     │
              │           │          │
              │           ▼          │
              │     ┌─────────┐     │
              │     │ running │     │
              │     └────┬────┘     │
              │          │          │
              │     POST /stop      │
              │          │          │
              │          ▼          │
              │     ┌─────────┐     │
              │     │ stopped │     │
              │     └─────────┘     │
              │                    │
              │           ┌────────┴──┐
              └──────────▶│  failed   │
                          └──────────┘
```

---

## 13. 测试指南

### 13.1 后端测试 (pytest)

```bash
cd backend

# 运行全部测试
pytest

# 运行特定文件
pytest tests/test_artifact_service.py

# 带覆盖率
pytest --cov=app --cov-report=html

# 注意事项:
# - 本机需要安装 pytest-asyncio 才能运行 async def 测试
# - 测试文件: 20 个文件, ~95 个测试函数
```

**测试文件分布**:

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `tests/api/` | 5+ | API 端点测试 |
| `tests/services/` | 10+ | 服务层单元测试 |
| `tests/adapters/` | 3+ | 适配器测试 |

### 13.2 前端测试 (vitest)

```bash
# ⚠️ 必须在 agenthub-web/ 目录内执行
cd agenthub-web

# 运行全部测试
npx vitest run

# Watch 模式
npx vitest

# 带覆盖率
npx vitest run --coverage

# 类型检查
npx tsc --noEmit
```

**测试文件分布**:

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `stores/__tests__/` | 3+ | Zustand store 测试 |
| `lib/__tests__/` | 5+ | 工具函数测试 |
| `components/__tests__/` | 10+ | 组件渲染测试 |

### 13.3 E2E 测试 (Playwright)

```bash
cd agenthub-web

# 安装浏览器
npx playwright install

# 运行 E2E
npx playwright test

# 指定文件
npx playwright test e2e/auth.spec.ts

# 调试模式
npx playwright test --debug
```

**E2E Spec 覆盖**:
- `auth.spec.ts` — 登录/注册流程
- `conversation.spec.ts` — 对话创建/消息发送
- `artifacts.spec.ts` — 产物卡片渲染
- 其他 3 个 spec 文件

### 13.4 本地全量验证

```bash
# 前端验证（必须在 agenthub-web/ 目录）
cd agenthub-web && npx vitest run && npx tsc --noEmit

# 后端验证
cd backend && pytest

# 隔离验证（区分"我引入的失败"与"预存失败"）
git stash                    # 暂存当前改动
cd backend && pytest         # 跑基线 → 记录"预存失败"
git stash pop                # 恢复改动
pytest                       # 跑当前 → 对比差异
```

---

## 14. 编码规范

### 14.1 Python 规范

```python
# 命名
variable_name = "snake_case"
ClassName = "PascalCase"
CONSTANT = "UPPER_SNAKE"

# 文件组织
# api/v1/     — 路由层（薄，只做参数提取 + 分发）
# core/       — 基础设施
# models/     — ORM 模型
# schemas/    — Pydantic Schema
# services/   — 业务逻辑

# 类型注解（强制）
async def create_message(
    db: AsyncSession,
    conv_id: UUID,
    content: str,
) -> Message:
    ...

# Pydantic Schema
class AgentCreate(BaseModel):
    name: str
    provider: str
    model_config = ConfigDict(alias_generator=to_camel)  # snake_case → camelCase

# 异步数据库操作
async with async_session_maker() as db:
    result = await db.execute(select(Model).where(...))
    return result.scalars().all()

# 环境变量（必须通过 Settings 类声明）
from app.core.config import settings
api_key = settings.ANTHROPIC_API_KEY  # ✅
api_key = os.getenv("ANTHROPIC_API_KEY")  # ❌ 禁止

# 删除有 FK 引用的记录
await db.execute(sa_delete(ChildTable).where(ChildTable.parent_id == parent_id))  # ✅
db.delete(parent_record)  # ❌ UOW flush 顺序不可控
```

### 14.2 TypeScript 规范

```typescript
// 命名
const variableName = "camelCase";
interface PropsType = "PascalCase";
const COMPONENT_NAME = "PascalCase";

// 组件
export const MyComponent: React.FC<Props> = ({ prop1, prop2 }) => {
  // hooks 在顶部
  // 事件处理函数以 handle 前缀
  const handleClick = () => { ... };
  return <div>...</div>;
};

// Store (Zustand)
export const useMyStore = create<State>((set, get) => ({
  value: initialState,
  setValue: (v) => set({ value: v }),
}));

// 深埋组件中失效查询
import { queryClient } from "@/lib/queryClient";  // ✅ 模块级单例
queryClient.invalidateQueries(["messages", convId]);
// const queryClient = useQueryClient();  // ❌ 需要 Provider 上下文

// API 调用
import { api } from "@/lib/api";
const { data } = useQuery({ queryKey: ["agents"], queryFn: () => api.getAgents() });
```

### 14.3 API 设计规范

```python
# ✅ 路由: kebab-case
@router.get("/api/v1/conversations/{conv_id}/messages")

# ✅ 查询参数: camelCase
async def list_messages(pageSize: int = 20, cursorId: str | None = None)

# ✅ JSON 字段: camelCase（Pydantic alias_generator 自动转换）
class MessageResponse(BaseModel):
    sender_type: str   # → JSON: "senderType"
    agent_ids: list    # → JSON: "agentIds"

# ✅ 响应格式: { code, data, message }
# ✅ 分页格式: { list, total, page, pageSize }
```

### 14.4 前端组件规范

```typescript
// ✅ 组件文件: PascalCase
// components/chat/ChatArea.tsx

// ✅ 工具文件: camelCase
// lib/diffApply.ts

// ✅ Store 文件: camelCase
// stores/chatStore.ts

// ✅ 类型文件: camelCase
// types/chat.ts

// ✅ 测试文件: *.test.ts / *.spec.ts
// stores/__tests__/chatStore.test.ts
```

---

## 15. 环境变量参考

### 15.1 后端 (.env)

```bash
# 数据库
DATABASE_URL=postgresql+asyncpg://agenthub:agenthub@localhost:5433/agenthub
REDIS_URL=redis://localhost:6379/0

# 对象存储
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=agenthub-artifacts

# 预览服务
PREVIEW_SERVER_PORT=8080
PREVIEW_SERVER_URL=http://localhost:8080

# ADK Streaming
AGENTHUB_USE_ADK_STREAM=0                     # 1=强制 ADK, 0=自动
AGENTHUB_MODEL_PROVIDER=anthropic             # 默认 Provider
AGENTHUB_MODEL_NAME=                          # 默认模型（可选）
AGENTHUB_MAX_PINNED_CONTEXT=10                # 最大钉选消息数
AGENTHUB_PIN_INJECTOR_LOG=0                   # 1=启用 Pin 注入日志
AGENTHUB_TOKEN_BUDGET=128000                  # Token 预算
AGENTHUB_HISTORY_LIMIT=50                     # 历史消息限制

# LLM API Keys
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_BASE_URL=                           # 代理端点（可选）
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=

# 认证
AUTH_SECRET_KEY=change-me-in-production-use-openssl-rand-hex-32
AUTH_ACCESS_TOKEN_EXPIRE_MINUTES=30
AUTH_REFRESH_TOKEN_EXPIRE_DAYS=7
AUTH_ALGORITHM=HS256

# Gotenberg (文档转换)
GOTENBERG_URL=http://localhost:3001

# CLI 工具路径
CLAUDE_CODE_CLI_PATH=claude
CODEX_CLI_PATH=codex

# Claude Code CLI 配置
CLAUDE_CODE_TIMEOUT_SECONDS=600
CLAUDE_CODE_MAX_BUDGET_USD=5.0
CLAUDE_CODE_ALLOWED_TOOLS=Bash,Read,Edit,Write,Glob,Grep

# Codex CLI 配置
CODEX_CLI_TIMEOUT_SECONDS=600
CODEX_CLI_MODEL=deepseek-v4-pro

# CLI 默认工作区
CLI_DEFAULT_WORKSPACE=~/.agenthub/cli_workspace

# 邮箱验证
EMAIL_API_KEY=
EMAIL_FROM=AgentHub <noreply@agenthub.example.com>
VERIFY_CODE_EXPIRE_SECONDS=600
VERIFY_CODE_RATE_LIMIT_SECONDS=60

# CORS
CORS_ORIGINS=["http://localhost:5173"]
```

### 15.2 前端 (.env.local)

```bash
# Mock 模式
VITE_USE_MOCK=false           # true=使用 MSW Mock, false=连接真实后端

# API 地址（默认同源代理）
VITE_API_BASE_URL=

# 其他
VITE_APP_TITLE=AgentHub
```

---

## 16. 故障诊断

### 16.1 Agent 对话故障

| 症状 | 可能原因 | 排查步骤 |
|------|----------|----------|
| Agent 不响应 | base_url 双倍路径 | 检查 base_url 末尾是否含 `/v1/messages` 或 `/chat/completions` |
| 返回 503 | 代理不可用 | `curl -I <base_url>` 验证连通性 |
| 返回 404 | 模型名不存在 | 确认 provider 是否支持该模型名 |
| 内容重复 | CLI partial+full 双事件 | 检查 `_parse_line` 是否正确跳过 assistant text |
| 第二次调用崩溃 | 空 Part 序列化错误 | 检查 `before_model_callback` 是否在最顶部调用了 `_sanitize_request_contents` |

### 16.2 群聊编排故障

| 症状 | 可能原因 | 排查步骤 |
|------|----------|----------|
| 计划未生成 | Planner 未收到有效 Agent | 检查 @提及 的 Agent ID 是否在可用列表中 |
| Agent 未调用 | DAG 节点被过滤 | 检查 `agent_name_map` 是否包含目标 Agent |
| 输出混乱 | 多 Agent 消息分流错误 | 检查 `agent_message_id()` 的 `(invocation_id, author)` 组合 |
| 消息丢失 | buffer 共享覆盖 | 确认前端按 `messageId` 独立管理 `streamingContent` |

### 16.3 产物卡片故障

| 症状 | 可能原因 | 排查步骤 |
|------|----------|----------|
| 卡片不显示 | 产物检测未执行 | 检查是否同时检测了文本输出和工具响应 |
| 编辑后刷新丢失 | 读取端未去重 | 确认 `list_messages` 按 `_mergeKey` 折叠版本链 |
| 链接被拒绝 | iframe 嵌入限制 | 检查 `_EMBEDDABLE_DOMAINS` 白名单 |
| PPTX 不预览 | Gotenberg 不可用 | `curl http://localhost:3001/health` |
| 卡片不刷新 | query 缓存失效遗漏 | 确认所有入口都调用了 `invalidateQueries` |

### 16.4 流式输出故障

| 症状 | 可能原因 | 排查步骤 |
|------|----------|----------|
| 加载一直转 | 缺少 message_end | 检查 Translator fallback 是否补发 message_end |
| 消息"显示后消失" | yield 在持久化前 | 调整顺序：先 DB commit → 再 yield message_end |
| 推理泄露 | thought 未过滤 | 检查 `part.thought=True` 是否被跳过 |
| ADK ID 异常 | 非标准 UUID | 确认使用 `uuid5()` 而非直接使用 invocation_id |

### 16.5 本地验证清单

```bash
# 后端
cd backend
python -c "from app.main import app; print('✅ Import OK')"  # import 检查
curl http://localhost:8000/api/v1/health                       # 健康检查
curl http://localhost:8000/docs                                # OpenAPI 可访问
pytest                                                         # 测试通过

# 前端
cd agenthub-web
npx tsc --noEmit                                               # 类型检查
npx vitest run                                                 # 测试通过
npx vite build                                                 # 构建成功
```

---

## 附录

### A. 关键文件索引

| 文件 | 行数 | 用途 |
|------|------|------|
| `backend/app/main.py` | ~80 | 应用入口 + 中间件注册 |
| `backend/app/core/config.py` | ~68 | 所有配置项 |
| `backend/app/core/database.py` | ~13 | 异步引擎 + session |
| `backend/app/core/exceptions.py` | ~76 | 异常体系 + 4 handler |
| `backend/app/core/middleware.py` | ~35 | 响应包装中间件 |
| `backend/app/api/router.py` | ~23 | 路由注册中心 |
| `backend/app/api/v1/conversations.py` | ~1000+ | 对话 CRUD + SSE 流式 |
| `backend/app/services/adapters/adk_to_sse.py` | ~366 | ADK→SSE 翻译器 |
| `backend/app/services/adapters/base.py` | ~208 | AgentAdapter ABC + Registry |
| `backend/app/services/context_assembler.py` | ~308 | 4 层上下文组装 |
| `backend/app/services/artifact_detector.py` | ~500+ | 双通道产物检测 |
| `backend/app/services/adk/runner.py` | ~165 | ADK Runner 封装 |
| `agenthub-web/src/App.tsx` | ~223 | 前端入口 + 路由 + 主题 |
| `agenthub-web/src/lib/sse.ts` | ~117 | SSE 客户端 |
| `agenthub-web/src/stores/chatStore.ts` | ~213 | 聊天状态（流式 buffer） |

### B. 已知优化方向

以下为开发过程中已识别的可优化项，按优先级排列，将在后续迭代中持续改进。

| 方向 | 说明 | 计划 |
|------|------|------|
| **Agent 凭据安全** | API Key 存储加密 | 引入密钥管理服务，对敏感字段加密存储 |
| **CLI 编排性能** | 编排模式下 CLI Agent 独立子进程启动 | 实现 CLI 会话复用，多 subtask 共享进程上下文 |
| **配置管理统一** | 部分模块使用 `os.getenv()` 直接读取 | 统一迁移至 pydantic Settings 对象 |
| **状态机健壮性** | OrchestratorTask 长时间无响应 | 增加超时检测与自动恢复机制 |
| **错误感知增强** | 代理 API 异常在 Translator 层被静默处理 | 完善异常传播链，输出明确错误提示 |
| **外部服务容错** | Gotenberg 不可用时 PPTX 预览退化 | 优化回退提示，增加服务健康检测 |
| **认证完整性** | SSE 流 auth 使用固定用户 | 对接完整 JWT 认证链路 |
| **代码复用** | Mock/Real 流分支部分重复 | 抽取公共后处理逻辑 |
| **连接池调优** | pool_size 未针对负载测试 | 根据实际并发量调优 |

### C. 常用命令速查

```bash
# 开发
npm run dev                          # 一键启动前后端
cd backend && uvicorn app.main:app --reload  # 仅后端
cd agenthub-web && npm run dev       # 仅前端

# 数据库
cd backend && alembic upgrade head    # 执行迁移
cd backend && alembic revision --autogenerate -m "msg"  # 创建迁移

# 测试
cd backend && pytest                  # 后端测试
cd agenthub-web && npx vitest run     # 前端测试
cd agenthub-web && npx tsc --noEmit   # 类型检查

# Git
git status
git diff
git commit -m "feat(module): description" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

> 📝 **文档维护**: 本文档随代码演进持续更新。新增模块/修改架构/变更 API 后请同步更新对应章节。
>
> 🤖 **生成方式**: 基于 `CLAUDE.md`、源代码结构、核心服务实现、API 路由和数据库模型综合分析生成。
