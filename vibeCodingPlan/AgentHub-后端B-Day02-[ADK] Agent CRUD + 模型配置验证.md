# AgentHub-后端B-Agent-CRUD实施计划

## 实施目标
完成 Agent 管理 API（CRUD）+ ADK 模型连通性验证端点。用户可通过 API 管理 Agent 配置，并通过 `/verify` 端点测试指定 provider + model 能否正常调用。

## 已实现功能（含实际验证结果）

| 端点 | 方法 | 状态 | 验证结果 |
|---|---|---|---|
| `/api/v1/agents` | GET | ✅ | 返回 Agent 列表，camelCase 输出正确 |
| `/api/v1/agents/{id}` | GET | ✅ | 按 ID 查单个 Agent |
| `/api/v1/agents` | POST | ✅ | 201 Created，`is_builtin=False` |
| `/api/v1/agents/{id}` | PATCH | ✅ | 部分更新，支持单独改 name/isActive/capabilities 等 |
| `/api/v1/agents/verify` | POST | ✅ | AnthropicLlm + LiteLLM 均验证通过 |

---

## 1. Schema 定义 (`backend/app/schemas/agent.py`)

### 关键设计决策

**统一继承 `BaseSchema`**：所有 Schema 必须继承 `app.schemas.base.BaseSchema`，而不是 Pydantic 原生 `BaseModel`。`BaseSchema` 已配置 `alias_generator=to_camel`，确保 Python 侧写 `snake_case`，JSON 输出自动转 `camelCase`。

```python
# ✅ 正确
from app.schemas.base import BaseSchema
class AgentBase(BaseSchema): ...

# ❌ 错误 — 不会转 camelCase
from pydantic import BaseModel
class AgentBase(BaseModel): ...
```

### 类设计

| 类 | 用途 | 字段特点 |
|---|---|---|
| `AgentBase` | 共享字段定义 | name, avatarUrl, provider, model, systemPrompt, capabilities, toolConfig |
| `AgentCreate` | 创建请求体 | 继承 AgentBase，所有字段必填 |
| `AgentUpdate` | 更新请求体 | 所有字段 Optional，支持部分更新（PATCH 语义） |
| `AgentResponse` | 列表/详情响应 | 继承 AgentBase + id, isBuiltin, isActive, createdAt, updatedAt |
| `AgentVerifyRequest` | 模型验证请求 | provider + model + systemPrompt(可选) |

### 注意事项
- **不写 `class Config: from_attributes = True`**（Pydantic v1 写法）。`BaseSchema` 已在 `model_config` 中统一配置 `from_attributes=True`。
- `capabilities` 使用 `List[str]` + `Field(default_factory=list)` 确保默认为空列表而非 None。

---

## 2. Service 逻辑 (`backend/app/services/agent.py`)

### CRUD 方法

| 方法 | 说明 |
|---|---|
| `get_agents(db, skip, limit)` | 分页查询，按 `created_at DESC` 排序 |
| `get_agent(db, agent_id)` | 按 ID 查询，返回 None 时由 API 层抛 404 |
| `create_agent(db, agent_in, user_id)` | 创建 Agent，`is_builtin=False`, `is_active=True` |
| `update_agent(db, db_agent, agent_in)` | 用 `model_dump(exclude_unset=True)` 实现真正的 PATCH |

### ADK 模型验证 (`verify_model`)

**核心逻辑**：

```python
# 1. 根据 provider 选择模型后端
if provider.lower() in ("anthropicllm", "anthropic", "claude"):
    llm = AnthropicLlm(model=model)   # ADK 原生 Claude 适配器
else:
    llm = model                        # LiteLLM 字符串，ADK 自动路由

# 2. 创建 LlmAgent + Runner
agent = LlmAgent(name="adt_verify", model=llm, instruction="...")
runner = Runner(agent=agent, app_name="agenthub_verify",
                session_service=InMemorySessionService())

# 3. 必须先创建 Session（否则报 "Session not found"）
await session_service.create_session(app_name="agenthub_verify",
    user_id="verify_user", session_id="verify_session")

# 4. 发一条消息，收到任何 Agent 事件即视为通过
async for event in runner.run_async(...):
    if event.author != "user":
        return True
```

### 实现过程中踩过的坑

| 问题 | 原因 | 修复 |
|---|---|---|
| ADK 导入报错 | `from google.adk import types` 不存在 | 改为 `from google.genai import types` |
| Session not found | `create_session` 没加 `await` | 加上 `await` |
| app_name is required | Runner 缺少 `app_name` 参数 | 添加 `app_name="agenthub_verify"` |
| Schema 输出不是 camelCase | AgentBase 继承 `BaseModel` 而非 `BaseSchema` | 改为继承 `BaseSchema` |

---

## 3. API 路由 (`backend/app/api/v1/agents.py`)

### 端点清单

```
GET    /api/v1/agents              → list_agents(skip, limit)
GET    /api/v1/agents/{agent_id}   → get_agent(agent_id)
POST   /api/v1/agents              → create_agent(agent_in, user_id)
PATCH  /api/v1/agents/{agent_id}   → update_agent(agent_id, agent_in)
POST   /api/v1/agents/verify       → verify_agent_model(request)
```

### 注意事项
- `response_model=List[AgentResponse]` 直接返回列表（不经 `{code, data, message}` 包装），因为中间件 `ResponseWrapperMiddleware` 会自动包装。
- `get_current_user_id()` 目前是 Mock（返回固定 UUID `00000000-0000-0000-0000-000000000001`），后续需替换为真实 JWT 认证。

---

## 4. 路由注册 (`backend/app/api/router.py`)

```python
from app.api.v1.agents import router as agents_router
api_router.include_router(agents_router, prefix="/v1/agents", tags=["agents"])
```

---

## 5. 验证方法

```bash
# 1. 启动服务
cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. 测试 CRUD
curl http://127.0.0.1:8000/api/v1/agents                    # GET 列表
curl -X POST http://127.0.0.1:8000/api/v1/agents \          # POST 创建
  -H "Content-Type: application/json" \
  -d '{"name":"Test","provider":"AnthropicLlm","model":"claude-haiku-4-5","capabilities":["test"]}'
curl -X PATCH http://127.0.0.1:8000/api/v1/agents/{id} \    # PATCH 更新
  -H "Content-Type: application/json" \
  -d '{"name":"Renamed"}'

# 3. 验证模型连通性
curl -X POST http://127.0.0.1:8000/api/v1/agents/verify \
  -H "Content-Type: application/json" \
  -d '{"provider":"AnthropicLlm","model":"claude-haiku-4-5"}'
```

---

## 6. 当前进度

| 阶段 | 状态 |
|---|---|
| Day 1: 后端A (基础设施) + 后端B (ADK环境) | ✅ 完成 |
| Day 2: 后端A (会话CRUD) + 后端B (Agent CRUD + ADK验证) | ✅ 完成 |
| Day 3: Mock SSE + 消息API骨架 | 🔜 待开始 |
