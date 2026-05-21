# AgentHub 多 Agent 协作平台架构设计（Python 后端版）

## 1. 项目目标与范围

基于 `AgentHub.txt` 要求，构建一个以 IM 聊天为核心交互范式的多 Agent 协作平台，支持：

- 单聊（1v1 与指定 Agent）
- 群聊协作（@多个 Agent，由 Orchestrator 自动拆解与分派）
- 多会话并行（会话列表管理）
- 上下文连续（历史消息 + Pin 关键上下文）
- 产物内联（文本、代码、Diff、预览卡片、附件）
- 流式输出（SSE）

P2 目标：部署状态卡片、版本历史、局部二次修改、多端扩展。

---

## 2. 技术栈（确定版）

### 前端
- React 18
- TypeScript
- Vite
- TailwindCSS + shadcn/ui
- Zustand（状态管理）
- react-virtuoso（聊天长列表虚拟化）
- Monaco Editor（代码编辑与 Diff）
- SSE（接收 Agent 流式输出）

### 后端
- FastAPI（REST + SSE）
- PostgreSQL（业务数据）
- Redis（缓存、Pub/Sub、队列中间件）
- Celery（并行任务调度、重试、超时控制）
- MinIO / S3（附件与产物对象存储）

### 客户端与多端（P2）
- 桌面端：Tauri（跨平台原生框架，提供本地文件读写与本地 Agent 进程管控）
- 移动端：React Native / PWA（轻量级消息交互、状态流转审批与产物预览）

### 基础设施与沙箱（P2）
- 代码测试与部署沙箱：Docker 容器 或 Firecracker 微虚拟机（保障代码编译、部署测试安全隔离）

---

## 3. 总体架构设计

```text
[Web Client]
  └─ Chat UI / Artifact UI / Diff UI
      └─ REST + SSE

[API Gateway - FastAPI]
  ├─ Auth & User Service
  ├─ Conversation Service
  ├─ Message Service
  ├─ Artifact Service
  └─ Stream Service (SSE)

[Orchestrator Core]
  ├─ Intent Parser
  ├─ Task Planner
  ├─ Agent Router
  ├─ Parallel Executor (Celery)
  ├─ Result Aggregator
  └─ Conflict Resolver

[Adapter Layer]
  ├─ Claude Adapter
  ├─ Codex/OpenCode Adapter
  └─ Custom Agent Adapter

[Infra]
  ├─ PostgreSQL
  ├─ Redis
  ├─ Celery Workers
  ├─ MinIO / S3
  └─ Sandbox Environment (Docker/Firecracker)
```

---

## 4. 核心模块说明

### 4.1 Conversation Service（会话域）
- 管理会话列表：新建、置顶、归档、搜索、最近活跃排序
- 支持会话类型：`single` / `group`
- 支持 `pin` 关键消息作为长期上下文

### 4.2 Message Service（消息域）
- 存储消息流与结构化元数据
- 支持消息类型：文本、代码块、附件、Diff、预览卡片、部署状态卡片
- 提供重新生成、引用、回复等操作所需数据

### 4.3 Orchestrator（编排域）
- 输入：用户消息 + 上下文 + @目标（可选）
- 流程：意图识别 → 任务拆解 → Agent 路由 → 并行执行 → 聚合输出
- 能力：并行调度、失败降级、冲突检测

### 4.4 Adapter Layer（接入域）
统一 Provider 接口，屏蔽不同 Agent 平台协议差异：

- `send_message()`
- `stream_message()`
- `cancel_run()`
- `parse_artifact()`

新增 Agent 仅需新增 Adapter，不改 Orchestrator 主流程。

### 4.5 Artifact Service（产物域）
- 统一产物模型（代码、Diff、网页预览、附件、PPT/办公文档等多媒体类产物）
- 与对象存储集成，提供可控访问 URL
- 支持一键应用 Diff（P2）

### 4.6 Stream Service（SSE）
- 统一流式事件协议（版本化）
- 支持 token 增量输出与多 Agent 状态回传

### 4.7 Meta-Agent（创建域）
- 系统内置 Builder Agent 机制，支持用户以“对话交互”的形式创建自有 Agent。
- 解析自然语言意图，通过内置的 Tool Calling 自动闭环完成 System Prompt 的生成、能力标签归类以及配置落库。

---

## 5. 可扩展性设计

1. **协议版本化**
   - 所有 SSE 事件、消息体包含 `version` 字段，支持向后兼容演进。

2. **策略可插拔**
   - 路由策略（速度优先/质量优先/成本优先）可配置。
   - 聚合策略（优选单结果/融合多结果）可扩展。

3. **能力注册中心（Agent Capability Registry）**
   - 每个 Agent 注册能力标签（coding/docs/ui/reasoning/tool-use）。
   - Orchestrator 基于能力匹配路由，后续可接入评分学习机制。

4. **渲染插件机制（前端）**
   - 前端按 `artifact_type` 注册渲染器组件，扩展新卡片类型时无需改聊天核心。

5. **上下文分层管理**
   - 短期窗口 + pin 消息 + 摘要记忆，保障长会话稳定与性能。

---

## 6. 创新性设计

1. **多 Agent 协作可视化 DAG**
   - 展示任务拆解、并行路径、耗时、重试轨迹，提升可解释性。

2. **Spec/Skill/Rules 自动注入**
   - 将团队协作规范自动注入上下文，提高多 Agent 输出一致性。

3. **结果仲裁解释（Explainable Merge）**
   - 聚合结果时给出采纳理由（质量、冲突程度、一致性）。

4. **成本-质量自适应路由（可选）**
   - 简单任务走低成本 Agent，复杂任务自动升级高能力 Agent。

---

## 7. 数据库表设计（PostgreSQL）

> 说明：以下为 P0 + P2 可扩展模型，字段可按实际开发精简。

### 7.1 `users`
- `id` (uuid, pk)
- `email` (varchar, unique)
- `name` (varchar)
- `avatar_url` (varchar, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 7.2 `agents`
- `id` (uuid, pk)
- `name` (varchar)
- `avatar_url` (varchar, nullable)
- `provider` (varchar)  // claude, codex, opencode, custom
- `model` (varchar)
- `system_prompt` (text, nullable)
- `capabilities` (jsonb) // ["coding", "docs", ...]
- `tool_config` (jsonb, nullable)
- `is_builtin` (boolean)
- `is_active` (boolean)
- `created_by` (uuid, fk -> users.id, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 7.3 `conversations`
- `id` (uuid, pk)
- `title` (varchar)
- `type` (varchar) // single/group
- `owner_id` (uuid, fk -> users.id)
- `is_archived` (boolean)
- `is_pinned` (boolean)
- `last_active_at` (timestamp)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 7.4 `conversation_participants`
- `id` (uuid, pk)
- `conversation_id` (uuid, fk -> conversations.id)
- `participant_type` (varchar) // user/agent/orchestrator
- `participant_id` (uuid) // 对应 users.id 或 agents.id
- `role` (varchar, nullable) // owner/member
- `joined_at` (timestamp)

索引建议：
- unique(`conversation_id`, `participant_type`, `participant_id`)

### 7.5 `messages`
- `id` (uuid, pk)
- `conversation_id` (uuid, fk -> conversations.id)
- `sender_type` (varchar) // user/agent/orchestrator/system
- `sender_id` (uuid, nullable)
- `parent_message_id` (uuid, fk -> messages.id, nullable) // 回复/引用
- `content_type` (varchar) // text/markdown
- `content` (text)
- `status` (varchar) // pending/streaming/done/failed
- `meta` (jsonb, nullable) // 扩展元数据：如局部二次修改选中的 context_reference 代码块、重试信息等
- `created_at` (timestamp)
- `updated_at` (timestamp)

索引建议：
- index(`conversation_id`, `created_at`)

### 7.6 `message_mentions`
- `id` (uuid, pk)
- `message_id` (uuid, fk -> messages.id)
- `agent_id` (uuid, fk -> agents.id)
- `created_at` (timestamp)

### 7.7 `message_pins`
- `id` (uuid, pk)
- `conversation_id` (uuid, fk -> conversations.id)
- `message_id` (uuid, fk -> messages.id)
- `created_by` (uuid, fk -> users.id)
- `created_at` (timestamp)

### 7.8 `artifacts`
- `id` (uuid, pk)
- `conversation_id` (uuid, fk -> conversations.id)
- `message_id` (uuid, fk -> messages.id)
- `artifact_type` (varchar) // code/diff/file/preview/deploy_status
- `title` (varchar, nullable)
- `content` (jsonb) // 结构化内容
- `storage_key` (varchar, nullable) // 对象存储路径
- `mime_type` (varchar, nullable)
- `version` (int)
- `created_at` (timestamp)

### 7.9 `orchestrator_tasks`
- `id` (uuid, pk)
- `conversation_id` (uuid, fk -> conversations.id)
- `trigger_message_id` (uuid, fk -> messages.id)
- `status` (varchar) // queued/running/partial_success/success/failed
- `plan` (jsonb) // 拆解任务计划
- `result_summary` (jsonb, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 7.10 `orchestrator_subtasks`
- `id` (uuid, pk)
- `task_id` (uuid, fk -> orchestrator_tasks.id)
- `agent_id` (uuid, fk -> agents.id)
- `instruction` (text)
- `status` (varchar) // queued/running/success/failed/timeout
- `retry_count` (int)
- `latency_ms` (int, nullable)
- `output_message_id` (uuid, fk -> messages.id, nullable)
- `error_detail` (text, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

---

## 8. API 清单（REST + SSE）

## 8.1 会话与消息

### 创建会话
- `POST /api/v1/conversations`
- body:
```json
{
  "title": "实现登录页面",
  "type": "group",
  "participant_agent_ids": ["agent-claude", "agent-codex"]
}
```

### 获取会话列表
- `GET /api/v1/conversations?keyword=&archived=false&page=1&page_size=20`

### 获取会话详情
- `GET /api/v1/conversations/{conversation_id}`

### 归档/取消归档会话
- `PATCH /api/v1/conversations/{conversation_id}`
```json
{ "is_archived": true }
```

### 发送消息（触发 Orchestrator/Agent）
- `POST /api/v1/conversations/{conversation_id}/messages`
```json
{
  "content": "@claude 把这段逻辑改成使用 map 实现",
  "mentions": ["agent-claude", "agent-codex"],
  "mode": "auto_orchestrate",
  "context_reference": {
    "artifact_id": "art-1001",
    "file_path": "src/components/Login.tsx",
    "start_line": 15,
    "end_line": 25,
    "selected_text": "for (let i = 0; i < items.length; i++) { ... }"
  }
}
```

### 获取消息历史
- `GET /api/v1/conversations/{conversation_id}/messages?cursor=&limit=50`

### 重新生成消息
- `POST /api/v1/messages/{message_id}/regenerate`

### Pin/Unpin 消息
- `POST /api/v1/conversations/{conversation_id}/pins`
```json
{ "message_id": "msg-123" }
```
- `DELETE /api/v1/conversations/{conversation_id}/pins/{message_id}`

## 8.2 Agent 管理

### 获取可用 Agent 列表
- `GET /api/v1/agents`

### 创建自定义 Agent
- `POST /api/v1/agents`
```json
{
  "name": "前端代码助手",
  "provider": "custom",
  "model": "claude-sonnet-4-6",
  "system_prompt": "你是一个前端工程助手...",
  "capabilities": ["coding", "ui"],
  "tool_config": {"web_search": true}
}
```

### 更新 Agent
- `PATCH /api/v1/agents/{agent_id}`

## 8.3 产物与 Diff

### 获取消息关联产物
- `GET /api/v1/messages/{message_id}/artifacts`

### 一键应用 Diff（P2）
- `POST /api/v1/artifacts/{artifact_id}/apply-diff`
```json
{
  "target": "workspace",
  "path": "src/components/Login.tsx"
}
```

## 8.4 部署（P2）

### 触发部署
- `POST /api/v1/deployments`
```json
{
  "conversation_id": "conv-001",
  "artifact_id": "art-001",
  "provider": "vercel"
}
```

### 查询部署状态
- `GET /api/v1/deployments/{deployment_id}`

## 8.5 SSE 流式

### 订阅会话流
- `GET /api/v1/conversations/{conversation_id}/stream`
- Headers:
  - `Accept: text/event-stream`
  - `Authorization: Bearer <token>`

---

## 9. SSE 事件 JSON 示例

> SSE 格式：
> - `event: <event_name>`
> - `data: <json_string>`

### 9.1 `message_start`
```json
{
  "version": "v1",
  "event_id": "evt-001",
  "conversation_id": "conv-001",
  "message_id": "msg-2001",
  "sender": {
    "type": "agent",
    "id": "agent-claude",
    "name": "Claude Code"
  },
  "timestamp": "2026-05-20T10:00:00Z"
}
```

### 9.2 `token`
```json
{
  "version": "v1",
  "event_id": "evt-002",
  "conversation_id": "conv-001",
  "message_id": "msg-2001",
  "delta": "我先给出登录页组件实现，",
  "index": 1,
  "timestamp": "2026-05-20T10:00:01Z"
}
```

### 9.3 `artifact`
```json
{
  "version": "v1",
  "event_id": "evt-003",
  "conversation_id": "conv-001",
  "message_id": "msg-2001",
  "artifact": {
    "id": "art-1001",
    "type": "diff",
    "title": "Login.tsx 更新",
    "content": {
      "file": "src/components/Login.tsx",
      "language": "tsx",
      "diff": "@@ -1,5 +1,12 @@ ..."
    }
  },
  "timestamp": "2026-05-20T10:00:02Z"
}
```

### 9.4 `agent_status`
```json
{
  "version": "v1",
  "event_id": "evt-004",
  "conversation_id": "conv-001",
  "task_id": "task-9001",
  "subtask_id": "subtask-02",
  "agent": {
    "id": "agent-codex",
    "name": "Codex"
  },
  "status": "running",
  "progress": 60,
  "timestamp": "2026-05-20T10:00:03Z"
}
```

### 9.5 `message_end`
```json
{
  "version": "v1",
  "event_id": "evt-005",
  "conversation_id": "conv-001",
  "message_id": "msg-2001",
  "finish_reason": "completed",
  "usage": {
    "input_tokens": 1200,
    "output_tokens": 480
  },
  "timestamp": "2026-05-20T10:00:05Z"
}
```

### 9.6 `error`
```json
{
  "version": "v1",
  "event_id": "evt-006",
  "conversation_id": "conv-001",
  "message_id": "msg-2001",
  "code": "AGENT_TIMEOUT",
  "message": "agent-codex 执行超时，已触发降级策略",
  "retryable": true,
  "timestamp": "2026-05-20T10:00:06Z"
}
```

---

## 10. 三人/20天实施建议（可直接分工）

### 前端（1人）
- 聊天主界面、会话列表、消息卡片体系
- SSE 流式渲染、虚拟列表、Monaco + Diff

### 后端A（1人）
- FastAPI 基础工程、会话/消息/产物 API
- PostgreSQL 模型与迁移、对象存储接入

### 后端B（1人）
- Orchestrator、Adapter、Celery 调度
- 失败降级、聚合输出、SSE 推送集成

---

## 11. 交付物映射

- 产品设计文档：本架构文档 + 页面交互补充
- 技术文档：API + 数据库 + SSE 协议
- 可运行 Demo：P0 全链路（单聊/群聊/流式/产物）
- AI 协作记录：Spec/Skill/Rules 注入流程与样例
- 3 分钟 Demo 视频：核心路径 + 创新点展示
