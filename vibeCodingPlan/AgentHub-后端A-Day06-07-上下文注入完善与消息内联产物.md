# AgentHub-后端A-Day06-07-上下文注入完善与消息内联产物

## 实施目标
增强 Pin/Spec 注入 Callback：pinned 消息数量上限控制 + SpecManager 从占位改为真实读取。同时确保 `GET /messages` 内联 `artifacts[]` + `sender_name` 覆盖所有边缘情况。

> 注意：消息历史由 ADK `Session.events` 自动管理，callback **不需**自研加载最近 N 条消息。仅需额外处理 Pin（ADK 不感知）和 Spec（自研业务逻辑）。

## 计划实现功能

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/conversations/{id}/messages` | GET | 已有内联 artifacts + sender_name，Day06-07 覆盖边缘情况验证与修复 |
| `/api/v1/conversations/{id}/stream` | GET | 复用既有 SSE 链路，增强注入内容（pinned 上限 + Spec 真实读取） |

---

## 1. Schema 定义

### 关键设计决策
- 不新增 REST Schema，不新增接口字段。
- SpecManager 相关表（specs/spec_rules）暂不建表，本次以配置文件方式实现最小可用版本：读取 `backend/specs/` 目录下的 `.md` 文件。
- 注入层沿用已被 Day05 验证的 `before_model_callback`（`google.genai.types`），**不**切换到 ADK `before_agent_callback`。原因：当前回调的职责是修改 `llm_request` 追加 instructions，`before_model_callback` 是语义正确的拦截点。
- Session.state 写入走 `runner.run_async()` 的 `state_delta` 参数（已有），callback 内只做**读取**。

### 与 20 天计划中 `before_agent_callback` 的差异说明
20 天计划 Day 4-5 中写道"实现为一个 `before_agent_callback` 函数"，但 Day05 实际实现选型为 `before_model_callback`（`google.genai.types`）。两者都能拦截并修改 LLM 请求，但写入 state 的路径不同。本次 Day06-07 **沿用已有实现**，不改变 callback 类型。

### 类设计

| 类 | 用途 | 字段特点 |
|---|---|---|
| `SpecManager` | Spec/Rules 读取（最小骨架） | 配置文件驱动 + DB 预留查询位；`get_rules_for_conversation(conv_id) → Optional[str]` |
| `before_model_callback`（增强） | Pin + Spec 联合注入 | 在现有基础上增加 pinned 数量上限控制 + `_load_spec_rules()` 的真实实现 |
| `SessionStateHelper` | Session.state **只读**工具 | 从 callback context 读取 `conversation_id` / `spec_ids` 等已由 `state_delta` 写入的键值；**不提供 set 方法** |

---

## 2. Service 逻辑

### 2.1 Pin/Spec 注入增强

#### 方法列表

| 方法 | 说明 | 状态 |
|------|------|------|
| `_load_pinned_messages(conv_id, limit)` | 从 message_pins + messages 读取 pinned 内容，**新增 limit 参数控制数量上限** | 增强 |
| `_load_spec_rules()` | 从 SpecManager 读取适用 Spec/Rules（替换当前 `return None` 占位） | **本次实现真实逻辑** |
| `_build_injection_text()` | 组装注入文本（Pin > Spec 两段式） | 已有，本次增强：pinned 段标注数量上限 |
| `before_model_callback()` | ADK 模型调用前注入上下文 | 已有，本次接入 SpecManager |

#### 核心逻辑

```
注入顺序（优先级从高到低）：
1. Pinned 消息（最高优先级）— 最多注入最近 N 条（默认 10）
2. Spec/Rules（中等优先级）— 从 SpecManager 读取
```

**注入文本格式**：
```
Pinned context has highest priority and must be followed.

=== Pinned Messages (most recent 10) ===
- [pinned message 1 content]
- [pinned message 2 content]

=== Spec / Rules ===
[spec content from SpecManager]
```

**Pinned 消息数量上限**：
- 默认最多注入 10 条（`AGENTHUB_MAX_PINNED_CONTEXT` 环境变量可配置）
- 按 `message_pins.created_at` 降序取最近 N 条
- 不再注入完整的对话窗口消息（ADK Session 已自动管理）

### 2.2 SpecManager 骨架

| 方法 | 说明 |
|------|------|
| `get_rules_for_conversation(conv_id) → Optional[str]` | 返回适用于该会话的 Spec/Rules 文本 |

**实现方式**：
- 优先从 `backend/specs/` 目录下的 `.md` 文件加载全局 Spec
- 预留 DB 查询位：若 specs 表存在，按 conversation_id 关联查询
- 当前最小可用版本：读取目录下所有 `.md` 文件，拼接为注入文本

**文件位置**：`backend/app/services/spec_manager.py`

### 2.3 Session.state 元数据管理

**写入端**（已有，`runner.py` 的 `stream_single_chat`）：
```python
state_delta={"conversation_id": session_id}
```

**读取端**（`pin_spec_injector.py` 的 `before_model_callback`）：
- 从 `callback_context.state` 读取 `conversation_id`（已有实现）
- 后续可按需读取 `spec_ids` 等扩展键

**本次新增**：在 `runner.py` 的 `state_delta` 中增加 `spec_ids` 和 `context_window_size` 两个键，供 callback 读取。

| 键 | 写入位置 | 读取位置 | 用途 |
|---|---|---|---|
| `conversation_id` | runner.py `state_delta` | callback → state dict | 已有，定位会话 |
| `spec_ids` | runner.py `state_delta` | callback → state dict | **新增**，记录已注入的 spec 版本 |
| `context_window_size` | runner.py `state_delta` | callback → state dict | **新增**，透传当前窗口配置 |

**实施注意事项 —— `spec_ids` 和 `context_window_size` 的时机判断**：
- **`context_window_size`**：本身是可配置的环境变量常量（`AGENTHUB_MAX_PINNED_CONTEXT`），callback 内直接 `os.getenv()` 读取即可，无需通过 `state_delta` 绕一圈。通过 state 传递反而引入"值可能不同步"的问题（state_delta 写入后 runner 不会自动更新）。
- **`spec_ids`**：SpecManager 当前是文件驱动的最小版本，不与 DB 交互，没有"spec 版本"的概念。写死的 spec_ids 值没有实际意义。
- **建议**：本次实施**先不往 `state_delta` 新增这两个键**。`context_window_size` 在 callback 内直接读环境变量；`spec_ids` 等 Day 14-15 SpecManager DB 化、真正有了版本管理之后再加。state_delta 只保留已有的 `conversation_id` 一个键。

**SessionStateHelper 设计原则**：
- 仅提供 `get_*()` 读取方法
- **不提供 set 方法**——`before_model_callback` 不能写入 state，state 写入统一在 `runner.run_async()` 的 `state_delta` 参数完成
- 封装 `callback_context.state` 的 dict/object 兼容读取逻辑

**实施注意事项 —— SessionStateHelper 过度抽象风险**：
- 当前 callback 中读取 state 仅需 3 行 dict 访问代码（`state.get("conversation_id")`），新增 `spec_ids` 和 `context_window_size` 后也只有 3~5 个键。
- 如果单独建一个类仅封装 2-3 个 `get_*()` 方法，代码量可能超过直接读取 state 的代码量，反而不利于维护。
- **建议**：实施时先直接在 `pin_spec_injector.py` 中内联读取 state 键值，如果后续 state 键值超过 5 个再抽类。当前版本不强制建 `SessionStateHelper` 类。

### 2.4 消息响应边缘情况验证

| 检查项 | 说明 | 对应代码位置 |
|------|------|------|
| `sender_name` 为空消息 | 无 sender_id 的 system/orchestrator 消息的 sender_name 是否正常返回 | `message.py:_batch_get_sender_names` |
| `artifacts` 为空数组 | 无产物的消息是否返回 `artifacts: []` 而非 null | `message.py:_format_message` 第 145 行 |
| orchestrator 消息 | sender_type="orchestrator" 的消息 sender_name="Orchestrator" 和 artifacts 处理 | `message.py:_batch_get_sender_names` 第 194-195 行 |
| cursor 边界 | 最后一条消息的 cursor 格式是否为 ISO 8601 | `message.py:list_messages` 第 129 行 |

当前代码已覆盖大部分逻辑，本次以**验证 + 修边**为主，不重构。

---

## 3. API 路由

| 端点 | 方法 | 请求体 | 响应 |
|------|------|--------|------|
| `/api/v1/conversations/{conv_id}/messages` | GET | - | `MessageListResponse`（已有，本次仅验证） |

---

## 4. 验证检查点

- [ ] 导入检查通过
- [ ] `_load_pinned_messages()` 支持 limit 参数，默认 10 条
- [ ] `_load_spec_rules()` 从配置文件正确读取 Spec，不再 return None
- [ ] `SpecManager` 可正确读取 `backend/specs/` 目录下的 `.md` 文件
- [ ] 注入文本两段式格式正确：Pin > Spec
- [ ] `runner.py` 的 `state_delta` 已新增 `spec_ids` 和 `context_window_size`
- [ ] `GET /messages` 所有消息均含 `artifacts: []`（无产物时为空数组）
- [ ] `GET /messages` 所有 sender_type 的 `sender_name` 均不为 null
- [ ] pinned 数量上限通过 `AGENTHUB_MAX_PINNED_CONTEXT` 可配置
- [ ] `/docs` 可查看现有端点，无报错

---

## 5. 依赖与风险

- 依赖：Day05 已完成的 `pin_spec_injector.py` + `runner.py` 的 `before_model_callback` 接线
- 依赖：Day02-03 已完成的 `MessageService.list_messages` + `_batch_get_sender_names`
- **不依赖**：ADK `Session.events` 的消息历史（已由 ADK 自动管理，callback 不重复加载）
- 风险：pinned 消息过多 → 已通过 limit 参数控制数量上限，默认 10 条
- 风险：SpecManager 的 DB 表尚未建表 → 本次用配置文件方案作为过渡，文件位置 `backend/specs/`
- 风险：`Session.state` API 在 ADK 不同版本间可能变化 → 统一通过 `state_delta` + callback 读取路径，避免直接依赖 ADK 内部结构
