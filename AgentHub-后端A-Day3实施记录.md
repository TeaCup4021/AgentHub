# AgentHub 后端 A — Day 3 实施记录

> 对应 20 天计划 **第一阶段 Day 3**，目标：消息 API 骨架（POST/GET messages），游标分页，内联 artifacts + sender_name。

---

## 一、完成内容概览

| # | 内容 | 状态 |
|---|------|------|
| 1 | Message Schema 定义 | ✅ |
| 2 | Message Service（创建 + 游标分页查询） | ✅ |
| 3 | Message API 路由 + 注册 | ✅ |

---

## 二、新增文件

### 2.1 `app/schemas/message.py` — Schema 定义

| 类 | 用途 |
|---|---|
| `MessageCreate` | 创建消息请求体：content, content_type, mentions, parent_message_id |
| `ArtifactBrief` | 消息内联产物简要信息 |
| `MessageResponse` | 消息响应：含 id, sender_name, artifacts[], 全部消息字段 |
| `MessageListResponse` | 游标分页响应：items[], next_cursor, has_more |

所有 Schema 继承 `BaseSchema`，自动 camelCase 序列化。

### 2.2 `app/services/message.py` — Service 层

**`create_message(db, conv_id, user_id, data)`**
- 校验会话存在且属于当前用户
- 写入 messages 表（sender_type="user", status="done"）
- 批量写入 message_mentions 表
- 更新 conversations.last_active_at
- 返回带 sender_name 的格式化消息

**`list_messages(db, conv_id, user_id, cursor, limit)`**
- 游标分页（cursor = ISO 8601 datetime），返回早于游标的历史消息
- 无 cursor 时返回最新消息
- 多取 1 条判断 `has_more`
- 批量查询 artifacts（一次 SQL JOIN 全部消息的 artifacts）
- 批处理解析 sender_name（区分 user/agent/orchestrator/system）
- 消息按 `created_at DESC` 排序

**辅助方法**
- `_format_message()` — 消息 ORM 对象 → 字典
- `_get_sender_name()` — 单条 sender_name 查询
- `_batch_get_sender_names()` — 批量 sender_name 查询（避免 N+1）

### 2.3 `app/api/v1/messages.py` — API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/{conv_id}/messages` | 游标分页查询消息历史，参数 `cursor`(可选), `limit`(默认50) |
| `POST` | `/{conv_id}/messages` | 创建新消息，body: content + mentions + parent_message_id |

### 2.4 路由注册

修改 `app/api/router.py`，新增 messages 路由挂载在 `/v1/conversations` 前缀下，最终路径：
- `GET /api/v1/conversations/{conv_id}/messages`
- `POST /api/v1/conversations/{conv_id}/messages`

---

## 三、API 详细说明

### 3.1 创建消息

```
POST /api/v1/conversations/{conv_id}/messages
```

请求体：
```json
{
  "content": "@claude 帮我写一个React组件",
  "contentType": "text",
  "mentions": ["<agent-uuid>"],
  "parentMessageId": null
}
```

响应 (201)：
```json
{
  "code": 201,
  "data": {
    "id": "uuid",
    "conversationId": "uuid",
    "senderType": "user",
    "senderId": "uuid",
    "senderName": "Test User",
    "parentMessageId": null,
    "contentType": "text",
    "content": "@claude 帮我写一个React组件",
    "status": "done",
    "meta": null,
    "artifacts": [],
    "createdAt": "2026-05-23T10:00:00Z",
    "updatedAt": "2026-05-23T10:00:00Z"
  },
  "message": "success"
}
```

### 3.2 查询消息历史

```
GET /api/v1/conversations/{conv_id}/messages?cursor=&limit=50
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `cursor` | ISO 8601 string | 否 | — | 分页游标，传上一页 `nextCursor` 以加载更早消息 |
| `limit` | int | 否 | 50 | 每页条数，范围 1-100 |

响应 (200)：
```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "id": "uuid",
        "conversationId": "uuid",
        "senderType": "agent",
        "senderId": "uuid",
        "senderName": "Claude Code",
        "contentType": "markdown",
        "content": "这是生成的React组件...",
        "status": "done",
        "artifacts": [
          {
            "id": "uuid",
            "artifactType": "code",
            "title": "Button.tsx",
            "content": { "language": "tsx", "code": "..." },
            "storageKey": null,
            "mimeType": null,
            "version": 1,
            "createdAt": "2026-05-23T10:00:00Z"
          }
        ],
        "createdAt": "2026-05-23T10:00:00Z",
        "updatedAt": "2026-05-23T10:00:00Z"
      }
    ],
    "nextCursor": "2026-05-23T09:58:00Z",
    "hasMore": true
  },
  "message": "success"
}
```

---

## 四、关键设计决策

| 决策 | 说明 |
|------|------|
| **游标分页而非页码分页** | 消息历史实时追加，页码分页会导致新增消息后数据偏移；游标分页（基于 created_at）避免此问题 |
| **多取 1 条判 has_more** | limit=50 时实际查询 51 条，存在第 51 条则 has_more=true，前端据此决定是否显示"加载更多" |
| **批量 artifacts 查询** | 一次 SQL `WHERE message_id IN (...)` 拉取当前页所有 artifacts，避免 N+1 |
| **批量 sender_name 解析** | 收集所有 (sender_type, sender_id) 对，分别 batch-query users 和 agents 表 |
| **sender_name 静态映射** | orchestrator → "Orchestrator"、system → "System"，无需查表 |
| **创建时写死 status=done** | Day 3 无 SSE 流式，用户消息直接完成；Day 4+ 接入 ADK 后 Agent 消息 status 为 streaming → done |

---

## 五、验证清单

| # | 验证项 | 方法 |
|---|--------|------|
| 1 | App 启动无报错 | `uvicorn app.main:app` |
| 2 | 新路由已注册 | 访问 `/docs` 查看 Swagger UI |
| 3 | 创建消息成功 | `POST /api/v1/conversations/{id}/messages` → 201 |
| 4 | camelCase 输出 | 响应 JSON key 全部为 camelCase |
| 5 | 查询消息历史 | `GET /api/v1/conversations/{id}/messages` → 200 含 items + nextCursor |
| 6 | 空会话查消息 | 新创建的会话返回 items=[], hasMore=false |
| 7 | 游标翻页 | 传入 nextCursor 获取更早消息 |
| 8 | 权限校验 | 用不属于自己的 conv_id → 404 |
| 9 | 不存在的会话 | 随机 UUID → 404 |

---

## 六、与后端 B 的 Day 3 协作边界

| 事项 | 负责人 | 说明 |
|------|--------|------|
| Message Schema + API | 后端 A | ✅ 已完成，B 写 SSE 流式时复用 `MessageResponse` |
| Mock SSE 端点 | 后端 B | 待完成，消费 A 的消息存储 |
| ADK Runner 预研 | 后端 B | 待完成，验证 Event 字段映射 |
| 消息 `status` 流转 | 后端 B | SSE 流式推送时写入 `streaming` 状态 |
