# AgentHub-后端A-Day09-10-CapabilityRegistry 与计划 API

## 实施目标
实现 Agent CapabilityRegistry 初版，支持按能力标签匹配 Agent，为群聊 Orchestrator 提供 Agent 筛选能力。

## 计划实现功能

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/agents/capabilities` | GET | 获取所有可用能力标签列表（便利接口） |

> 注：CapabilityRegistry 核心定位为**内部 Service**，供 Orchestrator Planner 和 Context Assembler 调用。`match_agents` 不直接暴露 REST 端点，而是通过 Service 层供后端 B 使用。

---

## 1. Schema 定义

### 关键设计决策
- 继承 `BaseSchema`，享受 camelCase 序列化
- `match_agents` 返回 `List[Agent]`，调用方可自行序列化
- 能力标签无独立 Schema，使用 `List[str]`，存储于 `agents.capabilities` JSONB
- `GET /capabilities` 返回 `List[str]`，由中间件包裹为 `{ code, data, message }`

### 类设计

| 类 | 用途 | 字段特点 |
|---|---|---|
| `CapabilityRegistry` | 能力注册中心 Service | 静态方法：`match_agents(db, required_capability, limit)`、`get_all_capabilities(db)` |

---

## 2. Service 逻辑

### 方法列表

| 方法 | 说明 |
|------|------|
| `CapabilityRegistry.match_agents(db, required_capability, limit)` | 按能力标签匹配 Agent，返回匹配的 Agent 列表 |
| `CapabilityRegistry.get_all_capabilities(db)` | 从所有 Agent 的 capabilities JSONB 聚合去重，返回可用标签列表 |

### 核心逻辑
1. `match_agents`: 使用 SQLAlchemy `contains` 操作符查询 `agents.capabilities` 包含指定标签的活跃 Agent
2. `get_all_capabilities`: 查询所有活跃 Agent 的 capabilities，Python 侧去重 + 字母排序

---

## 3. API 路由

| 端点 | 方法 | 请求体 | 响应 |
|------|------|--------|------|
| `/api/v1/agents/capabilities` | GET | - | `List[str]`（中间件包裹） |

> 路由顺序：`/capabilities` **必须**在 `/{agent_id}` 之前注册，防止 FastAPI 将 "capabilities" 当作 agent_id 解析

---

## 4. 验证检查点

- [x] 导入检查通过
- [x] `/capabilities` 路由在 `/{agent_id}` 之前
- [x] camelCase 序列化正确（中间件 + BaseSchema）
- [x] 不破坏现有 Agent CRUD 端点
- [x] `orchestrator` sender_type 已存在于 Message Schema（无需修改）

---

## 5. 依赖与风险

- **依赖**：`agents.capabilities` JSONB 列已在 Day 1 建表（无需 migration）
- **依赖**：`orchestrator` sender_type 已在 `message.py:32` 就位（无需修改）
- **风险**：`match_agents` 初版仅支持单标签精确匹配，后续 Day 14 可扩展多标签 AND/OR 语义
