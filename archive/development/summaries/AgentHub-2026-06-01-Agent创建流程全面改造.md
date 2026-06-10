# Agent 创建流程全面改造 — 对话总结

## 时间
2026-06-01

## 改动范围
后端 10 文件 | 前端 5 文件 | 数据库 1 migration

---

## 一、Agent 创建表单全面重构

### 1.1 模型字段：下拉框 → 自由输入
- 删除 `MODELS_BY_PROVIDER` 硬编码常量
- `Select` 组件替换为 `Input`，用户可以输入任意模型名
- 切换供应商不再自动覆盖模型值

### 1.2 能力标签：固定选项 → 自定义输入
- 删除 `CAPABILITY_OPTIONS` 硬编码常量
- 新增 Input + 添加按钮组合，支持回车快捷添加
- Tag 可点击 X 删除，重复标签自动去重

### 1.3 工具集：对齐后端 5 个 builtin 工具
前端显示的工具从 4 个改为 5 个，与 `cli_tools.py` 注册的工具一一对应：
| 工具 key | 中文名 | 功能 |
|----------|--------|------|
| `read_file` | 读取文件 | 读取本地文件内容 |
| `create_file` | 新增文件 | 创建新文件 |
| `edit_file` | 修改文件 | 替换文件中的内容 |
| `execute_command` | 执行命令 | 执行 Shell 命令 |
| `web_search` | 网络搜索 | 通过 DuckDuckGo 搜索 |

旧工具 `write_file`（写入文件）已移除——它后端的注册中不存在。

### 1.4 tool_config 格式修正
- **提交时**：`{ tools: [{type: "builtin", name: "read_file"}, ...] }` — 对象数组格式
- **回填时**：`extractToolNames()` 兼容旧格式（字符串数组）和新格式（对象数组）
- 无工具时传 `undefined`，不传空数组

### 1.5 后端 ToolLoader 向后兼容
`tool_loader.py` `_load_one` 方法增加字符串类型判断：
- 旧格式 `"read_file"`（字符串）→ 自动转为 `{type: "builtin", name: "read_file"}`
- 新格式 `{type: "builtin", name: "read_file"}` → 正常解析

---

## 二、Agent 级 LLM 配置 + 用户隔离

### 2.1 数据库
`agents` 表新增两列：
```sql
api_key  VARCHAR(500)  -- 明文存储，创建时必填
base_url VARCHAR(500)  -- 明文存储，创建时必填
```

### 2.2 用户隔离
所有 Agent 接口增加用户过滤：
```sql
WHERE created_by IS NULL          -- 内置 Agent，全员可见
   OR created_by = <current_user> -- 自己创建的
```
- 内置 Agent（`created_by IS NULL`）：全员可读，不可删改
- 用户 Agent（`created_by = user_id`）：仅创建者可读/改/删
- 他人 Agent：403

### 2.3 API Schema
- `AgentCreate`：`base_url` 和 `api_key` 均为必填
- `AgentUpdate`：两者均可选
- `AgentResponse`：两者均完整返回（无脱敏）

### 2.4 ConfigurableAnthropicLlm
新建 `AnthropicLlm` 子类：
- 接受 `api_key` 和 `base_url` 参数
- 覆盖 `_anthropic_client` 属性，将自定义凭证传入 `AsyncAnthropic`
- LiteLlm 原生支持 `api_key` / `api_base` kwargs，无需子类化

### 2.5 兜底优先级
```
Agent 自定义 api_key/base_url（数据库） → 最高
服务端 .env 环境变量                       → 不再需要
```

### 2.6 移除 Settings 页的 LLM 配置
- 删除 `LLMConfigSection.tsx` 组件（170 行）
- 从设置页导航和渲染中移除
- 该组件的 localStorage 数据从未被后端消费——是死 UI

---

## 三、前后端字段名对齐

后端 `BaseSchema` 使用 `alias_generator=to_camel`，序列化时字段名为 camelCase（`baseUrl`, `apiKey`）。前端统一改为 camelCase：

| 文件 | 改前 | 改后 |
|------|------|------|
| `types/agent.ts` | `base_url`, `api_key` | `baseUrl`, `apiKey` |
| `CreateAgentModal.tsx` | `base_url`, `api_key` | `baseUrl`, `apiKey` |
| `AgentManageModal.tsx` | `agent.base_url` | `agent.baseUrl` |
| `mocks/data.ts` | `base_url`, `api_key` | `baseUrl`, `apiKey` |

---

## 四、Claude 模型名校验移除

`base_url` 改为必填后，每个 Agent 都有自定义端点。强制要求 `anthropic` provider 的模型名以 `claude-` 开头没有意义——用户知道自己的端点支持什么模型。

删除内容：
- `agent.py`：`_validate_provider_model` 中的 Claude 前缀校验、`CLAUDE_MODEL_PREFIX` / `ANTHROPIC_PROVIDERS` 常量
- `models.py`：`resolve_agent_model` 中的 `ValueError`、`_CLAUDE_MODEL_PREFIX` 常量

---

## 五、Thinking Block 过滤

DeepSeek 通过 Anthropic 兼容端点返回的响应中包含思考过程（`part.thought=True`）。`adk_to_sse.py` 的 `_to_token` 方法原本不过滤这部分，导致模型推理过程泄露到用户回复中。

修复：两个文本输出循环各加 `getattr(part, "thought", False)` 判断，思考内容直接跳过。

---

## 六、所有改动文件

### 后端
| 文件 | 操作 |
|------|------|
| `backend/app/models/agent.py` | +api_key, +base_url |
| `backend/alembic/versions/7e319cd8e98b_*.py` | migration |
| `backend/app/schemas/agent.py` | +字段，移除脱敏逻辑 |
| `backend/app/services/agent.py` | 必填校验 + 用户隔离 + 权限校验 |
| `backend/app/api/v1/agents.py` | 用户隔离 + 响应映射 |
| `backend/app/services/adk/models.py` | +ConfigurableAnthropicLlm，resolve 扩展 |
| `backend/app/services/adk/runner.py` | 透传 api_key/base_url |
| `backend/app/services/adk/coordinator_builder.py` | 透传 api_key/base_url |
| `backend/app/services/adk/tool_loader.py` | _load_one 字符串兼容 + 透传 |
| `backend/app/services/adapters/adk_to_sse.py` | 过滤 thought=True |
| `backend/app/core/exceptions.py` | +请求体日志 |
| `backend/seed_agents.py` | +api_key/base_url |

### 前端
| 文件 | 操作 |
|------|------|
| `agenthub-web/src/types/agent.ts` | 类型字段更新 |
| `agenthub-web/src/components/agent/CreateAgentModal.tsx` | 全面重构 |
| `agenthub-web/src/components/agent/AgentManageModal.tsx` | +展示 |
| `agenthub-web/src/components/settings/SettingsPage.tsx` | 移除 LLM 配置 |
| `agenthub-web/src/components/settings/LLMConfigSection.tsx` | 删除 |
| `agenthub-web/src/components/settings/index.ts` | 移除导出 |
| `agenthub-web/src/mocks/data.ts` | mock 数据更新 |
