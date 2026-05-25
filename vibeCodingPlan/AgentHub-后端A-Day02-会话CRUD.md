# AgentHub-后端A-Day1实施计划补充（会话 CRUD）

## 1. 基础依赖与结构定义 (Schemas & Utils)
*   **分页工具类 (`app/schemas/base.py`)**: 添加泛型 `Page[T]` 响应模型，包含 `list`（数据列表）、`total`（总数）、`page`（当前页码）、`pageSize`（每页条数）。
*   **会话数据模型 (`app/schemas/conversation.py`)**:
    *   定义 `ConversationCreate`：用于创建会话接收的参数。
    *   定义 `ConversationUpdate`：用于更新会话的参数。
    *   定义 `ConversationResponse`：在其基础字段中附加 `agentIds: List[UUID]`，以满足返回格式要求。

## 2. 会话逻辑层 (Service层：`app/services/conversation.py`)
*   **搜索与分页查询**：
    *   基于 `page` 和 `pageSize` 实现分页。
    *   如果传入 `keyword` 标题过滤，利用 SQLAlchemy 的 `ILIKE` 进行模糊匹配。
    *   排序逻辑：由于要求**置顶优先 + last_active_at倒序**，将使用 `.order_by(Conversation.is_pinned.desc(), Conversation.last_active_at.desc())`。
    *   连表/子查询：针对返回结果中的 `agentIds`，查询 `conversation_participants` 表（其中 `participant_type='agent'` 的记录）来组装。
*   **CRUD功能**：
    *   **创建会话 (Create)**：插入 `conversations` 表，若传入了 `agentIds`，同时插入相关的 `conversation_participants` 记录。
    *   **更新会话 (Update)**：除了支持更新常规状态（如标题、是否归档/置顶），也支持对 `agentIds` 的覆写或更新。
    *   **删除会话 (Delete)**：删除会话并级联清理关联的参与者信息。

## 3. 路由层 (API Endpoint：`app/api/v1/conversations.py`)
*   `POST /`：创建会话，返回新生成的会话数据。
*   `GET /`：分页列表查询，接收 `page`, `pageSize`, `keyword` 等 Query 传参。
*   `PATCH /{id}`：部分字段修改功能（如置顶、改标题操作）。
*   `DELETE /{id}`：删除指定会话。

## 4. 路由注册
*   修改 `app/api/router.py`，将新的 `conversations` 路由注册进主 `api_router`（挂载在 `/v1/conversations` 路径下）。
