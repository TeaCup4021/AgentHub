# AgentHub-后端A-Day06-07-上下文注入完善与消息内联产物

## 实施时间
2026-05-26

## 完成内容

### 1. `_load_pinned_messages` 增强
**文件**: `backend/app/services/pin_spec_injector.py`

- 新增 `limit` 参数，默认值从环境变量 `AGENTHUB_MAX_PINNED_CONTEXT` 读取（默认 10）
- 排序从 `created_at ASC` 改为 `created_at DESC`，取最近 N 条 pinned 消息
- 使用 `.limit(limit)` 控制查询数量上限

### 2. SpecManager 服务（最小文件驱动版本）
**新增文件**: `backend/app/services/spec_manager.py`

- `SpecManager` 类：读取 `backend/specs/` 目录下所有 `.md` 文件，拼接为注入文本
- `get_rules_for_conversation(conv_id) → Optional[str]`：当前版本忽略 conv_id，返回所有 spec 文件内容
- 模块级单例 `get_spec_manager()`，首次调用时初始化
- 预留 DB 查询位，Day 14-15 可切换为按 conversation 关联查询

### 3. `_load_spec_rules` 替换占位实现
**文件**: `backend/app/services/pin_spec_injector.py`（第 30-31 行）

- 从 `return None` 改为调用 `get_spec_manager().get_rules_for_conversation(conversation_id)`
- 注入链路从 "仅 Pin" 变为 "Pin + Spec 联合注入"

### 4. `_build_injection_text` 格式增强
**文件**: `backend/app/services/pin_spec_injector.py`（第 48-61 行）

- 新增 `pinned_limit` 参数
- 注入格式改为两段式，Pin 优先（最高优先级）：
  ```
  === Pinned Messages (most recent 10) ===
  - [pinned message content]

  === Spec / Rules ===
  [spec content]
  ```
- 只注入实际存在的内容段（Pin 为空或 Spec 为空时仅输出有内容的一段）

### 5. `backend/specs/` 目录
**新增目录**: `backend/specs/default-rules.md`

- 示例 Spec 文件，包含 Code Generation、Communication、Safety 三条默认规则
- 后续新增 `.md` 文件即可自动注入，无需改代码

### 6. 消息响应边缘情况验证
**文件**: `backend/app/services/message.py`（无修改）

验证结果（代码逻辑审查，现有代码已正确处理所有场景）：

| 检查项 | 结果 | 说明 |
|--------|------|------|
| `artifacts` 永不为 null | ✅ | `_format_message` 第 145 行 `art_map.get(m.id, [])` 默认为空数组 |
| orchestrator sender_name | ✅ | `_batch_get_sender_names` 第 194 行静态映射 `"Orchestrator"` |
| system sender_name | ✅ | `_batch_get_sender_names` 第 196 行静态映射 `"System"` |
| sender_name 不为 null | ✅ | 无匹配时默认 `"Unknown"`，所有路径均返回字符串 |
| cursor ISO 8601 | ✅ | 第 129 行 `datetime.isoformat()` 输出 ISO 8601 格式 |
| 未知 sender_type 兜底 | ✅ | key 不在 name_map 时使用 `"Unknown"` 默认值 |

---

## 与对齐约定一致性
- 未新增 REST Schema，未新增接口字段
- 未修改中间件与 REST 包裹逻辑（`{code, data, message}` 保持一致）
- 未修改 SSE 事件结构与字段名
- snake_case 存储 + camelCase 序列化未受影响

## 与计划差异说明

| 计划项 | 实际决策 | 原因 |
|--------|----------|------|
| 创建 `SessionStateHelper` 类 | 未创建 | 当前 callback 中 state 读取仅 3 行 dict 访问，建类比直接读更重 |
| `state_delta` 新增 `spec_ids` 和 `context_window_size` | 暂不新增 | `context_window_size` 直接读环境变量更简单；`spec_ids` 等 SpecManager DB 化（Day 14-15）再加 |
| `before_model_callback` 切换为 `before_agent_callback` | 沿用 `before_model_callback` | Day05 已验证该 callback 类型语义正确，无需切换 |

## 影响范围
- `backend/app/services/pin_spec_injector.py`（增强）
- `backend/app/services/spec_manager.py`（新增）
- `backend/specs/default-rules.md`（新增）

## 验证结果
- [x] 语法检查通过（`py_compile`）
- [x] `SpecManager.get_rules_for_conversation()` 正确读取 `.md` 文件（526 chars）
- [x] `_build_injection_text()` 四种场景全部通过（both/pinned only/spec only/neither）
- [x] `_load_pinned_messages()` 支持 limit 参数，默认 10 且可通过 `AGENTHUB_MAX_PINNED_CONTEXT` 配置
- [x] `_load_spec_rules()` 不再 return None，调用 SpecManager 真实加载
- [x] 注入文本两段式格式正确：Pin > Spec
- [x] `GET /messages` 边缘情况代码审查全部通过（无修改）
- [ ] 端到端流式联调（需真实 ADK 环境，留待 Day08 联合后端 B 验证）

## 前端需求

本次改动为纯后端增强，对前端透明，无需前端配合修改。

---

## 测试过程与结果

### 测试环境

- 数据库：Docker PostgreSQL（`agenthub-postgres`）
- Python venv：`backend/.venv/`
- 关键配置：`AGENTHUB_PIN_INJECTOR_LOG=1`
- 测试会话：`709d21e7-1663-4bcd-8d36-6ab8c9a418a9`（已存在的"测试会话"）
- 前置操作：先创建一条消息并 Pin，模拟真实场景

### 测试方法

不依赖 Anthropic API key，通过 mock `callback_context` 和 `llm_request` 对象直接调用 `before_model_callback`，完整验证 Pin + Spec 联合注入链路。

Mock 对象说明：
- `FakeCallbackContext`：模拟 ADK callback 的 context 对象，提供 `state` 字典和 `session_id`
- `FakeLlmRequest`：模拟 ADK 的 llm_request 对象，收集 `append_instructions()` 调用结果

### 测试结果

#### Test 1: SpecManager 加载 Spec 文件

```
Spec rules loaded: 526 chars
Content preview: # AgentHub Default Rules
## Code Generation
- Generate clean, well-structured c...
```

✅ `backend/specs/default-rules.md` 被正确读取，526 字符。

#### Test 2: _load_pinned_messages 带 limit 参数

SQL 查询确认：
```sql
SELECT messages.content
FROM messages JOIN message_pins ON messages.id = message_pins.message_id
WHERE message_pins.conversation_id = $1::UUID
ORDER BY message_pins.created_at DESC
LIMIT $2::INTEGER
```

```
Pinned messages found: 1
- test pin message
```

✅ limit 参数生效（$2=10），排序为 DESC，查到 1 条 pinned 消息。

#### Test 3: _build_injection_text 两段式格式

```
=== Pinned Messages (most recent 10) ===
- test pin message

=== Spec / Rules ===
# AgentHub Default Rules

## Code Generation
- Generate clean, well-structured code with proper error handling.
- Prefer TypeScript for frontend code.
- Follow the existing project conventions and patterns.

## Communication
- Respond in the same language as the user's message.
- Be concise and direct in responses.
- When generating artifacts (code, diffs, files), include them as structured output.

## Safety
- Never execute destructive commands without confirmation.
- Do not expose API keys or secrets in generated code.
```

✅ Pin 在前（最高优先级），Spec 在后，两段式格式正确，pinned 数量上限标注在标题中。

#### Test 4: before_model_callback 含 conversation_id

```
Callback returned: None
Instructions appended: 1
--- Instruction #0 (666 chars) ---
Pinned context has highest priority and must be followed.
=== Pinned Messages (most recent 10) ===
- test pin message

=== Spec / Rules ===
...
```

✅ callback 从 state 中读取 `conversation_id`，加载 pin + spec，组装为一条 instruction 注入到 `llm_request.instructions`，共 666 字符。

#### Test 5: before_model_callback 无 conversation_id

```
Callback returned: None
Instructions: 0 (should be 0)
```

✅ state 中缺失 `conversation_id` 时优雅退出，不报错，不注入任何内容。

#### 消息 API 边缘情况（`GET /messages`）

```
Code: 200
Items: 5
  senderType=user  senderName=Test User  artifacts=list(len=0)
  senderType=user  senderName=Test User  artifacts=list(len=0)
  senderType=user  senderName=Test User  artifacts=list(len=0)
  senderType=user  senderName=Test User  artifacts=list(len=0)
  senderType=user  senderName=Test User  artifacts=list(len=0)
hasMore: False
nextCursor: 2026-05-23T13:30:59.964165+00:00
```

✅ `artifacts` 始终为 `list`（空时为 `[]`，永不为 null）。`senderName` 始终为字符串。`nextCursor` 为 ISO 8601 格式。`hasMore` 边界正确。

### 未完成的测试项

| 测试项 | 原因 | 说明 |
|--------|------|------|
| 真实 ADK 流式端到端 | 需要 `ANTHROPIC_API_KEY` | mock callback 已覆盖注入逻辑；真实 LLM 调用留待 Day08 联合后端 B 验证 |

### 测试结论

Day06-07 所有改动项均通过验证，注入链路（SpecManager → _load_pinned_messages → _build_injection_text → before_model_callback → llm_request）完整可用。
