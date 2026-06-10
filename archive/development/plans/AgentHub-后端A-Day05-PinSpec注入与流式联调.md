# AgentHub-后端A-Day05-PinSpec注入与流式联调

## 实施目标
在不改动既有前后端契约的前提下，完成 Day05 后端A的 Pin/Spec 注入 callback，并接入现有 ADK 单聊流式链路。

## 计划实现功能

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/conversations/{conv_id}/pins` | POST | 复用既有 Pin 能力，不重设计 |
| `/api/v1/conversations/{conv_id}/pins/{message_id}` | DELETE | 复用既有 Unpin 能力，不重设计 |
| `/api/v1/conversations/{conv_id}/stream` | GET | 复用既有 SSE 链路，仅新增 callback 注入能力 |

---

## 1. Schema 定义

### 关键设计决策
- 不新增 REST Schema，不新增接口字段。
- 严格沿用现有 snake_case 存储 + camelCase 序列化机制。

### 类设计

| 类 | 用途 | 字段特点 |
|---|---|---|
| `before_agent_callback` | ADK 执行前注入上下文 | 读取 conversation_id，对 pinned/spec 进行拼接注入 |

---

## 2. Service 逻辑

### 方法列表

| 方法 | 说明 |
|------|------|
| `_load_pinned_messages()` | 从 `message_pins + messages` 读取 pinned 内容 |
| `_load_spec_rules()` | 预留 spec/rules 来源（当前最小可用占位） |
| `_build_injection_text()` | 组装注入文本 |
| `before_agent_callback()` | 在 ADK 执行前返回注入 Content |

### 核心逻辑
- callback 从 ADK state 获取 `conversation_id`。
- 按会话读取 pinned 消息并拼接注入文本。
- 不改已有 SSE 事件协议，仅在 Agent 执行前补充上下文。

---

## 3. API 路由

| 端点 | 方法 | 请求体 | 响应 |
|------|------|--------|------|
| `/api/v1/conversations/{conv_id}/stream` | GET | `prompt?` | `text/event-stream` |

---

## 4. 验证检查点

- [ ] 导入检查通过
- [ ] callback 在 `build_single_chat_agent` 已接线
- [ ] `state_delta` 已携带 `conversation_id`
- [ ] 不影响既有 Pin/Unpin 与 SSE 路由

---

## 5. 依赖与风险

- 依赖：现有 ADK Runner 与 SSE Translator。
- 风险：若 ADK callback 运行时上下文字段变化，需要按 SDK 实际对象微调。
