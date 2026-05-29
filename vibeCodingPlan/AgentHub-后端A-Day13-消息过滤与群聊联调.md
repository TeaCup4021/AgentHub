# AgentHub-后端A-Day13-消息过滤与群聊联调

## 实施目标
消息列表新增 `sender_type` 和 `sender_id` 两个可选过滤查询参数，支撑前端群聊界面按发送者类别（如仅查看 agent 消息）或具体发送者（如只看某个 Agent 的输出）筛选消息。配合后端 B 完成群聊全链路 REST 侧验证。

## 计划实现功能

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/conversations/{conv_id}/messages?senderType=agent` | GET | 按发送者类型过滤（新增） |
| `/api/v1/conversations/{conv_id}/messages?senderId=<uuid>` | GET | 按具体发送者过滤（新增） |

> 两个参数可单独使用，也可组合使用（AND 语义）。本日无新增端点，仅对现有 `GET /messages` 增加可选过滤参数。

---

## 1. Schema 定义

### 关键设计决策
- `MessageListResponse` 无需变更（返回格式不变）
- 新增两个查询参数：
  - `sender_type`（后端 snake_case），通过 `alias="senderType"` 兼容前端 camelCase，取值 `"user" | "agent" | "system" | "orchestrator"`
  - `sender_id`（后端 snake_case），通过 `alias="senderId"` 兼容前端 camelCase，UUD 格式
- 两个参数均为可选，不传时不过滤（保持原有行为，向后兼容）
- 同时传入时 AND 语义：`WHERE sender_type = :type AND sender_id = :id`

### 类设计

| 类 | 用途 | 字段特点 |
|---|---|---|
| 无新增 Schema | 仅修改端点函数签名 | 新增 `sender_type: Optional[str] = Query(None, alias="senderType")` + `sender_id: Optional[UUID] = Query(None, alias="senderId")` |

---

## 2. Service 逻辑

### 方法列表

| 方法 | 说明 |
|------|------|
| `MessageService.list_messages(db, conv_id, user_id, cursor, limit, sender_type, sender_id)` | 新增 `sender_type` + `sender_id` 参数，SQL 查询中条件拼接 |

### 核心逻辑
1. `MessageService.list_messages()` 签名新增 `sender_type: Optional[str] = None` 和 `sender_id: Optional[UUID] = None`
2. SQL 基础查询不变（JOIN artifacts、users/agents）
3. 条件拼接：
   - 若 `sender_type` 非空 → `WHERE messages.sender_type = :sender_type`
   - 若 `sender_id` 非空 → `WHERE messages.sender_id = :sender_id`
   - 两者同时传入 → AND 拼接
4. 游标分页、排序（`created_at DESC`）逻辑不受影响
5. `_batch_get_sender_names` 无需修改

---

## 3. API 路由

| 端点 | 方法 | 请求体 | 响应 |
|------|------|--------|------|
| `/api/v1/conversations/{conv_id}/messages` | GET | - | `MessageListResponse` |

查询参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `cursor` | `Optional[str]` | 否 | None | 游标 |
| `limit` | `int` | 否 | 50 | 1-100 |
| `senderType` | `Optional[str]` | 否 | None | 按发送者类别过滤："user" / "agent" / "system" / "orchestrator" |
| `senderId` | `Optional[UUID]` (string) | 否 | None | 按具体发送者 ID 过滤（agent 的 UUID 或 user 的 UUID） |

---

## 4. 验证检查点

### sender_type 过滤
- [ ] `?senderType=agent` 仅返回 sender_type="agent" 的消息
- [ ] `?senderType=orchestrator` 仅返回 orchestrator 汇总消息（含 orchestrator_summary artifact）
- [ ] `?senderType=user` 仅返回用户消息
- [ ] 不传 senderType 不过滤（回归验证）

### sender_id 过滤
- [ ] `?senderId=<某个agent的UUID>` 仅返回该 Agent 产生的消息
- [ ] `?senderId=<某个user的UUID>` 仅返回该用户的消息
- [ ] senderId 传入不存在的 UUID 返回空列表（不报错）

### 组合过滤
- [ ] `?senderType=agent&senderId=<UUID>` AND 语义，仅返回同时满足两个条件的消息

### 通用
- [ ] 非法 senderType 值（如 "unknown"）返回 422
- [ ] 非法 senderId 值（非 UUID）返回 422
- [ ] camelCase 序列化正确（`senderType` → `sender_type`、`senderId` → `sender_id`）
- [ ] 游标分页在过滤条件下正常（hasMore、nextCursor 正确）

### 群聊 REST 侧联合验证

- [ ] 群聊消息列表中 orchestrator 消息的 sender_name = "Orchestrator"
- [ ] 子 Agent 消息的 sender_name 正确（从 agents 表或 meta_data.agent_name 解析）
- [ ] orchestrator_summary artifact 内联在 orchestrator 消息中
- [ ] confirm_plan 幂等性：重复确认同一 plan 返回 409
- [ ] 不传 orchestrateMode 时 stream 端点不触发执行（兜底行为）

---

## 5. 依赖与风险

- **依赖**：`messages.sender_type` 和 `messages.sender_id` 列已在 Day 1 建表，无需 migration
- **依赖**：orchestrator 消息由后端 B 的 MergeAggregator 写入（Day 13 同步开发）
- **依赖**：`_batch_get_sender_names` 已有的 orchestrator / system 静态映射无需修改
- **风险**：组合过滤与游标分页叠加时，若匹配的消息稀疏，单页返回数量可能少于 `limit`。不影响正确性，前端按 `hasMore` 判断即可
