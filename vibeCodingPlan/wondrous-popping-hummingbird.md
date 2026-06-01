# Agent 级 LLM 配置 + 用户隔离 设计方案

## 目标

在创建 Agent 时允许用户自定义**模型基址**（base_url）和 **API Key**，数据持久化到数据库并做到用户隔离——A 用户创建的 Agent 对 B 用户不可见。

---

## 一、数据库变更

### 1.1 `agents` 表新增列

```sql
ALTER TABLE agents ADD COLUMN api_key_encrypted VARCHAR(500);  -- AES-256-GCM 加密存储，可空
ALTER TABLE agents ADD COLUMN base_url          VARCHAR(500);  -- 明文存储，可空
```

- 两列均可空——空时走服务端 `.env` 全局兜底
- `api_key` **绝不存明文**，只存密文
- `base_url` 明文即可（URL 本身不敏感）

### 1.2 用户隔离

**现状问题**：`get_agents` 没有任何用户过滤，所有用户看到全部 Agent。

**改为**：

```sql
SELECT * FROM agents
WHERE created_by IS NULL          -- 内置/种子 Agent，全员可见
   OR created_by = <current_user> -- 当前用户创建的
ORDER BY created_at DESC
```

同时对 `update`、`delete` 操作增加归属权校验——非创建者返回 403。

> `created_by` 列已存在（UUID 外键 → `users.id`），无需 DDL。

---

## 二、安全层（新建）

### 2.1 `backend/app/core/crypto.py`

提供三个函数：

| 函数 | 签名 | 说明 |
|------|------|------|
| `encrypt` | `(plaintext: str) -> str` | AES-256-GCM 加密，返回 Base64 密文 |
| `decrypt` | `(ciphertext: str) -> str` | 解密，密钥不存在时抛错 |
| `mask` | `(key: str) -> str` | `sk-abc123xyz` → `sk-a***xyz` |

加密密钥来自环境变量 `AGENTHUB_ENCRYPTION_KEY`（32 字节）。启动时校验，缺失则报错。

---

## 三、API 层

### 3.1 Schema 变更（`schemas/agent.py`）

```
AgentCreate 新增:
  api_key: Optional[str]   ← 用户填的明文 Key（落库前 encrypt）
  base_url: Optional[str]  ← 模型基址

AgentUpdate 新增:
  api_key: Optional[str]
  base_url: Optional[str]

AgentResponse 新增:
  base_url: Optional[str]        ← 完整返回
  api_key_masked: Optional[str]  ← 脱敏返回 "sk-a***xyz"
  # 注意：AgentResponse 永远不返回 api_key 原文
```

### 3.2 Agent 列表接口（`api/v1/agents.py`）

```
GET /agents  →  按 created_by IS NULL OR created_by = current_user 过滤
GET /agents/{id}  →  校验归属权，非创建者 403
DELETE /agents/{id}  →  校验归属权，非创建者 403
```

内置 Agent（种子数据）的 `created_by = NULL`，全员可见且不可删除。

---

## 四、模型解析层

### 4.1 `adk/models.py` — `resolve_agent_model` 扩展

```python
def resolve_agent_model(
    provider: str,
    model: str,
    api_key: str | None = None,     # 新增
    base_url: str | None = None,    # 新增
) -> AnthropicLlm | LiteLlm:
```

内部逻辑：

```
Anthropic provider:
  → ConfigurableAnthropicLlm(model, api_key, base_url)   ← 新增子类
其他 provider:
  → LiteLlm(model, api_key=..., api_base=...)            ← kwargs 原生支持
```

### 4.2 新增 `ConfigurableAnthropicLlm`

`AnthropicLlm` 原生的 `_anthropic_client` 属性硬编码了 `AsyncAnthropic()`（只读环境变量），无法传入自定义密钥。写一个子类覆盖：

```python
class ConfigurableAnthropicLlm(AnthropicLlm):
    def __init__(self, model, api_key=None, base_url=None):
        super().__init__(model=model)
        self._custom_api_key = api_key
        self._custom_base_url = base_url

    @property
    def _anthropic_client(self):
        kwargs = {}
        if self._custom_api_key:
            kwargs["api_key"] = self._custom_api_key
        if self._custom_base_url:
            kwargs["base_url"] = self._custom_base_url
        return AsyncAnthropic(**kwargs) if kwargs else AsyncAnthropic()
```

### 4.3 调用链透传

三个调用点都需要将 Agent 的 `api_key`（解密后）和 `base_url` 传入 `resolve_agent_model`：

| 文件 | 调用点 |
|------|--------|
| `adk/runner.py` | `build_agent_from_model` → 单聊 |
| `adk/coordinator_builder.py` | `_resolve_model` → 群聊子 Agent |
| `adk/tool_loader.py` | `_resolve_model` → AgentTool 包装 |

---

## 五、兜底优先级

```
Agent 自定义 api_key / base_url     ← 数据库（最高优先级）
        ↓ 为空时
服务端 .env 环境变量                  ← 全局兜底
        ↓ 为空时
SDK 默认值                          ← 最低优先级
```

---

## 六、前端层

### 6.1 `CreateAgentModal.tsx`

在「模型」输入框下方新增两个**可选**字段：

```
供应商       [下拉]
模型         [文本输入]
模型基址     [文本输入，placeholder: https://api.openai.com/v1]    ← 新增，可空
API Key      [密码输入，placeholder: sk-...]                      ← 新增，可空
System Prompt
能力标签
工具集
```

- 不填则空字符串传给后端，后端走 `.env` 兜底
- 编辑时：`base_url` 回填原值；`api_key` 显示脱敏占位符 `••••••••`，用户输入内容则覆盖

### 6.2 `AgentManageModal.tsx`

Agent 卡片新增一行展示：

```
provider / model
base_url: https://xxx.com | Key: 已配置  ← 新增
```

### 6.3 类型定义（`types/agent.ts`）

```typescript
// Agent interface 新增
base_url?: string;
api_key_masked?: string;

// CreateAgentParams / UpdateAgentParams 新增
base_url?: string;
api_key?: string;
```

---

## 七、涉及文件总览

| # | 文件 | 操作 |
|---|------|------|
| 1 | `backend/app/core/crypto.py` | **新建** — 加密/解密/脱敏 |
| 2 | `backend/app/models/agent.py` | +api_key_encrypted, +base_url 列 |
| 3 | `backend/alembic/` | 自动生成 migration |
| 4 | `backend/app/schemas/agent.py` | +api_key, +base_url, +api_key_masked |
| 5 | `backend/app/services/agent.py` | 加密/解密 + 用户隔离 + 权限校验 |
| 6 | `backend/app/api/v1/agents.py` | list/get/delete 传入 user 做隔离 |
| 7 | `backend/app/services/adk/models.py` | +ConfigurableAnthropicLlm, resolve 签名扩展 |
| 8 | `backend/app/services/adk/runner.py` | 透传 api_key/base_url |
| 9 | `backend/app/services/adk/coordinator_builder.py` | 透传 api_key/base_url |
| 10 | `backend/app/services/adk/tool_loader.py` | 透传 api_key/base_url |
| 11 | `agenthub-web/src/types/agent.ts` | +字段类型 |
| 12 | `agenthub-web/src/components/agent/CreateAgentModal.tsx` | +输入框 |
| 13 | `agenthub-web/src/components/agent/AgentManageModal.tsx` | +展示 |

---

## 八、实现顺序（依赖关系）

```
Step 1: crypto.py（加密工具）          ← 无依赖
Step 2: models/agent.py（DB 列）        ← 无依赖
Step 3: schemas/agent.py（API Schema）  ← 依赖 Step 1 概念
Step 4: models.py（ConfigurableAnthropicLlm + resolve 扩展）← 无依赖
Step 5: services/agent.py（加密+隔离+校验）← 依赖 1,3
Step 6: api/v1/agents.py（API 隔离）    ← 依赖 5
Step 7: runner/coordinator/tool_loader（透传）← 依赖 4
Step 8: 前端类型 + 组件                   ← 依赖 3
```
