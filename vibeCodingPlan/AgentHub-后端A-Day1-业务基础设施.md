# AgentHub 后端 A — Day 1 实施计划

> 对应 20 天计划 **第一阶段 Day 1**，目标：基础设施全跑通，API 骨架立好，10 张表就绪。

---

## 一、项目目录结构

```
D:\AgentHub\
├── backend/
│   ├── docker-compose.yml          # PostgreSQL + Redis + MinIO
│   ├── Dockerfile                  # FastAPI 应用容器（可选，开发期直接 uvicorn）
│   ├── requirements.txt            # Python 依赖
│   ├── .env.example               # 环境变量模板
│   ├── alembic.ini                # 数据库迁移配置
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   │       └── 001_create_tables.py
│   └── app/
│       ├── __init__.py
│       ├── main.py                 # FastAPI 入口，注册中间件、路由、生命周期
│       ├── core/
│       │   ├── __init__.py
│       │   ├── config.py           # Settings (pydantic-settings)，读 .env
│       │   ├── database.py         # SQLAlchemy async engine + session factory
│       │   ├── middleware.py       # 统一响应包装中间件
│       │   └── exceptions.py       # 自定义异常类 + 全局异常处理器
│       ├── models/
│       │   ├── __init__.py         # 导出所有 model，Alembic 自动发现
│       │   ├── base.py            # DeclarativeBase + 公共 mixin (UUID pk, timestamps)
│       │   ├── user.py
│       │   ├── agent.py
│       │   ├── conversation.py
│       │   ├── conversation_participant.py
│       │   ├── message.py
│       │   ├── message_mention.py
│       │   ├── message_pin.py
│       │   ├── artifact.py
│       │   ├── orchestrator_task.py
│       │   └── orchestrator_subtask.py
│       ├── schemas/
│       │   ├── __init__.py
│       │   └── base.py             # 统一 BaseSchema（camelCase alias + 公共配置）
│       ├── api/
│       │   ├── __init__.py
│       │   ├── router.py           # 聚合所有子路由
│       │   └── v1/
│       │       ├── __init__.py
│       │       ├── health.py       # GET /api/v1/health 健康检查
│       │       ├── conversations.py
│       │       └── messages.py
│       └── services/
│           ├── __init__.py
│           └── ...                 # Day 2+ 陆续添加
```

---

## 二、Docker Compose — 一键拉起基础设施

### 2.1 服务规划

| 服务 | 镜像 | 端口 | 用途 |
|------|------|------|------|
| PostgreSQL 16 | `postgres:16-alpine` | 5432 | 业务数据 |
| Redis 7 | `redis:7-alpine` | 6379 | 缓存 / Pub-Sub / Celery broker |
| MinIO | `minio/minio:latest` | 9000 (API), 9001 (Console) | 对象存储 |

### 2.2 docker-compose.yml 关键设计

- PostgreSQL：初始化脚本 `init.sql` 自动建库（可选，也可让 SQLAlchemy 建表）
- Redis：开启 AOF 持久化，避免重启丢数据
- MinIO：通过 `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` 设凭证；entrypoint 自动创建 bucket（`agenthub-artifacts`）
- 所有服务加入同一 network：`agenthub-net`
- 数据挂载到 named volumes，保证重启数据不丢

### 2.3 验证标准

```bash
docker compose up -d
docker compose ps          # 三个服务都是 Up / healthy
docker compose logs minio  # 无 ERROR
```

---

## 三、FastAPI 骨架

### 3.1 依赖清单（requirements.txt）

```
# Web framework
fastapi==0.115.*
uvicorn[standard]==0.34.*

# Database
sqlalchemy[asyncio]==2.0.*
asyncpg==0.30.*
alembic==1.14.*

# Redis
redis[hiredis]==5.2.*

# MinIO
minio==7.2.*

# Config & validation
pydantic==2.10.*
pydantic-settings==2.7.*
python-dotenv==1.0.*

# CORS
# (built into FastAPI/Starlette)

# Dev
pytest-asyncio
httpx
```

### 3.2 应用入口（main.py）

生命周期：
1. **startup**：初始化 DB 连接池、Redis 连接、MinIO client
2. **shutdown**：关闭连接池、释放资源

注册顺序：
1. CORS 中间件（允许前端 `localhost:5173`）
2. 统一响应包装中间件（见第四节）
3. 全局异常处理器
4. 路由注册（`/api/v1/*`）

### 3.3 CORS 配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `allow_origins` | `["http://localhost:5173"]` | Vite 默认端口 |
| `allow_credentials` | `True` | 允许 cookie / Authorization header |
| `allow_methods` | `["*"]` | 开发期放宽 |
| `allow_headers` | `["*"]` | 含 SSE 的 `Accept: text/event-stream` |

### 3.4 全局异常处理

定义异常层次：
```
AppException (Base)
├── NotFoundException      → 404
├── ValidationException    → 422
├── UnauthorizedException  → 401
└── InternalException      → 500
```

异常处理器统一返回：
```json
{ "code": 404, "data": null, "message": "会话不存在" }
```

### 3.5 数据库连接池（core/database.py）

- 引擎：`create_async_engine` + `asyncpg`
- 连接池大小：默认 20（开发期），生产按需调
- Session：`async_sessionmaker`，通过 `async with get_db()` 依赖注入
- 健康检查：`SELECT 1` 在 startup 时验证连通

---

## 四、【关键】响应格式中间件

### 4.1 目标

所有 API 响应自动包装为：

```json
{
  "code": 200,
  "data": { ... },
  "message": "success"
}
```

### 4.2 实现策略

**方案：`@app.middleware("http")` 纯 ASGI 中间件**（不用 `@app.exception_handler`，因为后者无法拦截正常响应）。

```python
# 伪代码
async def response_wrapper(request, call_next):
    response = await call_next(request)
    # 只包装 JSON 响应，跳过 SSE (text/event-stream)
    if response.headers.get("content-type") == "application/json":
        body = await read_body(response)
        wrapped = {"code": response.status_code, "data": body, "message": "success"}
        return JSONResponse(wrapped, status_code=response.status_code)
    return response
```

### 4.3 边界处理

| 场景 | 处理方式 |
|------|---------|
| 已经是 `{code, data, message}` 格式 | 检测后不再二次包装（幂等） |
| SSE 流式响应 | 跳过（`content-type: text/event-stream`） |
| 文件下载 / 二进制 | 跳过（非 JSON） |
| HTTP 异常（404, 422 等） | 异常处理器单独包装，中间件不重复处理 |
| 重定向（301/302） | 跳过 |

### 4.4 幂等检测逻辑

中间件读取响应 body 后，尝试 `json.loads`，若已含 `code` + `data` + `message` 三个字段则直接返回原响应，不二次包装。这样异常处理器返回的 `{code: 500, ...}` 不会被包成 `{code: 200, data: {code: 500, ...}}`。

---

## 五、【关键】Pydantic camelCase 配置

### 5.1 目标

Python 代码写 `snake_case`（`user_name`, `created_at`），序列化时自动输出 `camelCase`（`userName`, `createdAt`）。

### 5.2 实现

```python
# app/schemas/base.py
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class BaseSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,      # 自动生成 camelCase 别名
        populate_by_name=True,          # 允许用 snake_case 或 camelCase 输入
        from_attributes=True,           # 支持从 ORM model 直接构建
    )
```

所有业务 Schema 继承 `BaseSchema` 即可。

### 5.3 验证要点

```python
class UserOut(BaseSchema):
    user_id: str
    user_name: str
    created_at: datetime

# 序列化 → {"userId": "...", "userName": "...", "createdAt": "..."}
# 反序列化 → 同时接受 snake_case 和 camelCase（populate_by_name=True）
```

### 5.4 注意事项

- **数据库字段名**依然用 `snake_case`（SQL 惯例）
- **Pydantic 字段名**写 `snake_case`（Python 惯例）
- **JSON 输出**自动转 `camelCase`（前端惯例）
- `populate_by_name=True` 保证前端传 camelCase 也能正确解析
- 特殊情况（如 `SSE`、`API` 等全大写缩写）可手动指定 alias

---

## 六、建表（10 张核心表）

### 6.1 技术选型

- ORM：SQLAlchemy 2.0 async
- 迁移：Alembic（自动从 SQLAlchemy models 生成）
- 主键：统一使用 `UUID`（`uuid.uuid4`），避免自增 ID 在分布式场景冲突
- Base：所有模型继承统一的 `Base`（DeclarativeBase）+ 公共 Mixin

### 6.2 公共 Mixin（models/base.py）

```python
class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

class UUIDMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
```

### 6.3 十张表详细信息

#### 表 1：users

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | |
| `name` | VARCHAR(100) | NOT NULL | 显示名 |
| `avatar_url` | VARCHAR(500) | NULLABLE | MinIO 存储路径 |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

索引：`users_email_idx` UNIQUE on `email`

#### 表 2：agents

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | |
| `name` | VARCHAR(100) | NOT NULL | Agent 显示名 |
| `avatar_url` | VARCHAR(500) | NULLABLE | |
| `provider` | VARCHAR(50) | NOT NULL | claude / codex / opencode / custom |
| `model` | VARCHAR(100) | NOT NULL | 模型标识 |
| `system_prompt` | TEXT | NULLABLE | |
| `capabilities` | JSONB | NOT NULL, DEFAULT '[]' | `["coding", "docs", "ui"]` |
| `tool_config` | JSONB | NULLABLE | `{"web_search": true}` |
| `is_builtin` | BOOLEAN | NOT NULL, DEFAULT false | 内置 Agent 不可删除 |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT true | 软开关 |
| `created_by` | UUID | FK → users.id, NULLABLE | 创建者 |
| `created_at` | TIMESTAMPTZ | NOT NULL | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | |

索引：`agents_provider_idx` on `provider`；`agents_capabilities_idx` GIN on `capabilities`

#### 表 3：conversations

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | |
| `title` | VARCHAR(200) | NOT NULL | |
| `type` | VARCHAR(20) | NOT NULL | single / group |
| `owner_id` | UUID | FK → users.id, NOT NULL | |
| `is_archived` | BOOLEAN | NOT NULL, DEFAULT false | |
| `is_pinned` | BOOLEAN | NOT NULL, DEFAULT false | 会话置顶 |
| `last_active_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `created_at` | TIMESTAMPTZ | NOT NULL | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | |

索引：`idx_conversations_owner` on `owner_id`；`idx_conversations_active` on `last_active_at DESC`

#### 表 4：conversation_participants

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | |
| `conversation_id` | UUID | FK → conversations.id, NOT NULL | |
| `participant_type` | VARCHAR(20) | NOT NULL | user / agent / orchestrator |
| `participant_id` | UUID | NOT NULL | 对应 users.id 或 agents.id |
| `role` | VARCHAR(20) | NULLABLE | owner / member |
| `joined_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

索引：UNIQUE(`conversation_id`, `participant_type`, `participant_id`)
索引：`idx_cp_participant` on `participant_type, participant_id`

#### 表 5：messages

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | |
| `conversation_id` | UUID | FK → conversations.id, NOT NULL | |
| `sender_type` | VARCHAR(20) | NOT NULL | user / agent / orchestrator / system |
| `sender_id` | UUID | NULLABLE | |
| `parent_message_id` | UUID | FK → messages.id, NULLABLE | 回复/引用 |
| `content_type` | VARCHAR(20) | NOT NULL, DEFAULT 'text' | text / markdown |
| `content` | TEXT | NOT NULL | |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | pending / streaming / done / failed |
| `meta` | JSONB | NULLABLE | 扩展元数据 |
| `created_at` | TIMESTAMPTZ | NOT NULL | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | |

索引：`idx_messages_conv_time` on `(conversation_id, created_at)` — 消息历史查询核心索引

#### 表 6：message_mentions

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | |
| `message_id` | UUID | FK → messages.id, NOT NULL | |
| `agent_id` | UUID | FK → agents.id, NOT NULL | 被 @ 的 Agent |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

索引：`idx_mentions_msg` on `message_id`

#### 表 7：message_pins

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | |
| `conversation_id` | UUID | FK → conversations.id, NOT NULL | |
| `message_id` | UUID | FK → messages.id, NOT NULL | |
| `created_by` | UUID | FK → users.id, NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

索引：UNIQUE(`conversation_id`, `message_id`) — 同一消息不可重复 pin
索引：`idx_pins_conv` on `conversation_id`

#### 表 8：artifacts

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | |
| `conversation_id` | UUID | FK → conversations.id, NOT NULL | |
| `message_id` | UUID | FK → messages.id, NOT NULL | 关联消息（内联产出物） |
| `artifact_type` | VARCHAR(30) | NOT NULL | code / diff / file / preview / plan |
| `title` | VARCHAR(200) | NULLABLE | |
| `content` | JSONB | NOT NULL | 结构化内容（代码、diff、文件元信息等） |
| `storage_key` | VARCHAR(500) | NULLABLE | MinIO 对象存储路径 |
| `mime_type` | VARCHAR(100) | NULLABLE | |
| `version` | INTEGER | NOT NULL, DEFAULT 1 | 产物版本号 |
| `created_at` | TIMESTAMPTZ | NOT NULL | |

索引：`idx_artifacts_msg` on `message_id`；`idx_artifacts_conv` on `conversation_id`

#### 表 9：orchestrator_tasks

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | |
| `conversation_id` | UUID | FK → conversations.id, NOT NULL | |
| `trigger_message_id` | UUID | FK → messages.id, NOT NULL | 触发编排的用户消息 |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'queued' | queued / running / partial_success / success / failed |
| `plan` | JSONB | NOT NULL | 拆解任务计划（子任务列表） |
| `result_summary` | JSONB | NULLABLE | 聚合结果摘要 |
| `created_at` | TIMESTAMPTZ | NOT NULL | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | |

索引：`idx_ot_conv` on `conversation_id`；`idx_ot_status` on `status`

#### 表 10：orchestrator_subtasks

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK | |
| `task_id` | UUID | FK → orchestrator_tasks.id, NOT NULL | |
| `agent_id` | UUID | FK → agents.id, NOT NULL | 指派给哪个 Agent |
| `instruction` | TEXT | NOT NULL | 子任务指令 |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'queued' | queued / running / success / failed / timeout |
| `retry_count` | INTEGER | NOT NULL, DEFAULT 0 | |
| `latency_ms` | INTEGER | NULLABLE | 执行耗时 |
| `output_message_id` | UUID | FK → messages.id, NULLABLE | 子 Agent 产出的消息 |
| `error_detail` | TEXT | NULLABLE | 失败原因 |
| `created_at` | TIMESTAMPTZ | NOT NULL | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | |

索引：`idx_ost_task` on `task_id`；`idx_ost_status` on `status`

### 6.4 外键关系图

```
users ──────────────────────────────────────────────────────┐
  │                                                         │
  ├── agents.created_by ────────────────────────────────────┤
  ├── conversations.owner_id ───────────────────────────────┤
  ├── message_pins.created_by ──────────────────────────────┤
  │                                                         │
agents ─────────────────────────────────────────────────────┤
  │                                                         │
  ├── conversation_participants.participant_id (type=agent) │
  ├── message_mentions.agent_id                             │
  ├── orchestrator_subtasks.agent_id                        │
  │                                                         │
conversations ──────────────────────────────────────────────┤
  │                                                         │
  ├── conversation_participants.conversation_id             │
  ├── messages.conversation_id                              │
  ├── message_pins.conversation_id                          │
  ├── artifacts.conversation_id                             │
  ├── orchestrator_tasks.conversation_id                    │
  │                                                         │
messages ───────────────────────────────────────────────────┤
  │                                                         │
  ├── messages.parent_message_id (自引用)                    │
  ├── message_mentions.message_id                           │
  ├── message_pins.message_id                               │
  ├── artifacts.message_id                                  │
  ├── orchestrator_tasks.trigger_message_id                 │
  ├── orchestrator_subtasks.output_message_id               │
  │                                                         │
orchestrator_tasks ─────────────────────────────────────────┤
  └── orchestrator_subtasks.task_id
```

---

## 七、执行步骤（按顺序）

### Step 1：创建项目目录结构

全部按照第一章目录结构创建，`__init__.py` 全部放空即可。

### Step 2：编写 docker-compose.yml 并启动

验证三个服务都 healthy。

### Step 3：编写 requirements.txt 并安装

```bash
pip install -r requirements.txt
```

### Step 4：编写 core/config.py

用 `pydantic-settings` 读取环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `postgresql+asyncpg://agenthub:agenthub@localhost:5432/agenthub` | |
| `REDIS_URL` | `redis://localhost:6379/0` | |
| `MINIO_ENDPOINT` | `localhost:9000` | |
| `MINIO_ACCESS_KEY` | `minioadmin` | |
| `MINIO_SECRET_KEY` | `minioadmin` | |
| `MINIO_BUCKET` | `agenthub-artifacts` | |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | |

### Step 5：编写 core/database.py

- `create_async_engine` + `async_sessionmaker`
- `get_db` 异步生成器（FastAPI 依赖注入用）

### Step 6：编写 models/

按 6.3 节定义写 10 个 model 文件 + base.py。每个 model 文件包含表定义 + 必要的 relationship（如 `messages.artifacts`）。

### Step 7：编写 schemas/base.py

按第五章配置 `BaseSchema`。

### Step 8：编写 core/middleware.py

按第四章实现响应包装中间件。

### Step 9：编写 core/exceptions.py + 注册到 main.py

按 3.4 节定义异常层次 + handler。

### Step 10：编写 main.py

组装：CORS → 中间件 → 异常处理器 → 路由 → startup/shutdown。

### Step 11：编写 Alembic 配置并生成首次迁移

```bash
alembic init alembic
# 修改 alembic/env.py 指向 models.Base.metadata
alembic revision --autogenerate -m "init: 10 core tables"
alembic upgrade head
```

### Step 12：编写健康检查端点 + 验证

`GET /api/v1/health` → 返回 DB、Redis、MinIO 连通状态。

```bash
curl http://localhost:8000/api/v1/health
# 预期：{"code":200,"data":{"db":"ok","redis":"ok","minio":"ok"},"message":"success"}
```

---

## 八、验证清单

| # | 检查项 | 验证方法 |
|---|--------|---------|
| 1 | `docker compose up -d` 三个服务 healthy | `docker compose ps` |
| 2 | FastAPI 启动无报错 | `uvicorn app.main:app --reload` |
| 3 | CORS 头正确 | 浏览器 `fetch("http://localhost:8000/api/v1/health")` 不跨域报错 |
| 4 | 响应统一包装 | `curl localhost:8000/api/v1/health` → 含 `code/data/message` |
| 5 | camelCase 输出 | 任意 Schema 返回的 JSON key 为 camelCase |
| 6 | 10 张表存在 | `psql` 连入 `\dt` 列出全部表 |
| 7 | 异常返回统一格式 | 访问不存在的端点 → `{"code":404,"data":null,"message":"Not Found"}` |
| 8 | 健康检查三服务连通 | `/api/v1/health` data 中 db/redis/minio 均为 ok |

---

## 九、与后端 B 的 Day 1 协作边界

| 事项 | 负责人 | 说明 |
|------|--------|------|
| Docker Compose | 后端 A | B 共用同一份 compose 文件 |
| DB 建表 + Alembic | 后端 A | B 的 Celery 任务也依赖这些表 |
| 响应中间件 | 后端 A | B 的 API 也自动包装 |
| BaseSchema | 后端 A | B 写 Schema 时继承同一个 BaseSchema |
| Celery + Redis Broker | 后端 B | 依赖 A 搭好的 Redis |
| Agent 种子数据 | 后端 B | 用 A 建好的 agents 表写入 |
| 初始测试用户 | 后端 B | 用 A 建好的 users 表写入 |
