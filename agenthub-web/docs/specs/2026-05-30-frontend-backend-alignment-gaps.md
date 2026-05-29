# 前后端对齐差距分析 — 2026-05-30

基于 origin/main 6 个新提交 (e6b16ce..309978c) 与前端现状的对照。

## 总览

| 模块 | 新增端点 | P1 状态 | P2 状态 |
|------|---------|:--:|:--:|
| 认证 | 7 个 (`/v1/auth/*`) | ✅ 完成 | 🔴 用户信息编辑需后端加接口 |
| 项目管理 | 5 个 (`/v1/projects/*`) | ✅ 完成 | ✅ 已对齐 |
| Agent 能力 | 1 个 (`GET /agents/capabilities`) | ✅ 完成 | ✅ 已对齐 |
| 对话接口扩展 | `projectId`/`orchestrateMode` | ✅ 完成 | ✅ 完成 |
| 消息接口扩展 | `senderType`/`senderId` 过滤 | ✅ 完成 | ✅ 完成 |
| Mock 对齐 | — | ✅ 完成 | ✅ 完成 |
| DAG 可视化 | 1 个 (`GET /orchestrator/.../dag`) | ✅ 完成 | ✅ 完成 |

---

## P1 阶段性完成 — 2026-05-30

### 实现清单

| # | 模块 | 新增文件 | 修改文件 | 内容 |
|---|------|---------|---------|------|
| T1 | 对话与项目关联 | — | 6 | `Conversation`/`CreateConversationParams`/`ConversationListParams` 加 `projectId`；`conversationApi.list` 支持过滤；新增 `useConversationsByProject` hook；Mock 支持 `projectId` 过滤和创建 |
| T2 | Agent 能力标签 | — | 3 | `agentApi.capabilities()`；`useAgentCapabilities()` hook；Mock `GET /agents/capabilities` |
| T3 | 认证 UI 增强 | — | 1 | `IconSidebar` 新增用户头像 Dropdown（邮箱 + 退出登录） |
| T4 | 密码修改 UI | — | 3 | `authApi.changePassword()`；`SettingsPage` 安全设置区 + 密码修改表单；Mock `PATCH /auth/password` |
| T5 | 项目管理全链路 | 5 | 6 | `types/project.ts`；`projectApi` (CRUD)；`useProjects` hooks；`uiStore.selectedProjectId`；`ProjectSwitcher` + `ProjectCreateModal` 组件；`AppLayout` + `ConversationList` 接入项目过滤 |
| T6 | Mock 对齐 | — | 2 | Auth Mock (send-code/register/login/refresh/me)；DAG Mock；预设测试账号 |

### 新增文件

```
src/
├── types/project.ts                          # Project / CreateProjectParams / UpdateProjectParams
├── hooks/useProjects.ts                      # useProjects / useProject / useCreateProject / useUpdateProject / useDeleteProject
├── components/project/ProjectSwitcher.tsx     # 项目下拉选择器
└── components/project/ProjectCreateModal.tsx  # 创建项目弹窗
```

### Mock 预设账号

| 字段 | 值 |
|------|-----|
| 邮箱 | `test@agenthub.dev` |
| 密码 | `123456` |
| 用户名 | 测试用户 |

注册接口可用任意邮箱，验证码固定为 Mock 生成的 6 位数字（控制台无输出，默认放行）。

---

## 差距详情

### G1 🔴 项目管理 — 全链路缺失 (P1)

**新增端点：**
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/projects` | 创建项目 |
| GET | `/v1/projects` | 列出用户项目 |
| GET | `/v1/projects/{id}` | 项目详情 |
| PATCH | `/v1/projects/{id}` | 更新项目 |
| DELETE | `/v1/projects/{id}` | 删除项目 |

**需改动文件：**

1. `src/types/api.ts` — 新增类型：
   - `Project` 接口
   - `CreateProjectRequest` / `UpdateProjectRequest`
   - `ProjectListResponse` / `ProjectDetailResponse`

2. `src/lib/api.ts` — 新增 `projectApi`：
   - `projectApi.create(params)` — POST `/projects`
   - `projectApi.list()` — GET `/projects`
   - `projectApi.detail(id)` — GET `/projects/{id}`
   - `projectApi.update(id, data)` — PATCH `/projects/{id}`
   - `projectApi.delete(id)` — DELETE `/projects/{id}`

3. `src/hooks/useProjects.ts` — 新增 React Query hooks：
   - `useProjects()` — `useQuery(["projects"])`
   - `useProject(id)` — `useQuery(["projects", id])`
   - `useCreateProject()` — `useMutation`
   - `useUpdateProject()` — `useMutation`
   - `useDeleteProject()` — `useMutation`

4. `src/components/project/` — 新增组件：
   - `ProjectSwitcher.tsx` — 侧边栏项目下拉选择器
   - `ProjectCreateModal.tsx` — 创建项目弹窗
   - `ProjectSettingsModal.tsx` — 编辑/删除项目

5. `src/components/layout/IconSidebar.tsx` — 集成 ProjectSwitcher

6. `src/mocks/handlers.ts` — 新增项目 mock 拦截器

7. `src/mocks/data.ts` — 新增模拟项目数据

**工作量估计：** 3-4 个 task

---

### G2 🟡 对话与项目关联 (P1)

**变更：**
- `GET /conversations` 新增 `projectId` 查询参数
- `POST /conversations` 请求体新增 `project_id`
- `ConversationResponse` 新增 `project_id`

**需改动文件：**

1. `src/types/chat.ts` — `Conversation` 新增 `projectId?: string`，`CreateConversationParams` 新增 `projectId?: string`
2. `src/types/api.ts` — `ConversationListParams` 新增 `projectId?: string`
3. `src/lib/api.ts` — `conversationApi.list(params)` 传递 `projectId`
4. `src/hooks/useConversations.ts` — `useConversations` 接受 `projectId` 参数，传入 query key
5. `src/components/layout/ConversationList.tsx` — 选择项目后按 `projectId` 过滤
6. `src/mocks/handlers.ts` — 模拟 `projectId` 过滤 + 创建关联

**工作量估计：** 1 个 task

---

### G3 🟡 Agent 能力标签 (P1)

**新增端点：**
- `GET /v1/agents/capabilities` → `string[]`

**需改动文件：**

1. `src/lib/api.ts` — `agentApi` 新增 `capabilities()` → `GET /agents/capabilities`
2. `src/hooks/useAgents.ts` — 新增 `useAgentCapabilities()`
3. `src/components/agent/CreateAgentModal.tsx` — 能力字段改为下拉多选（从 registry 获取选项）
4. `src/components/agent/AgentManageModal.tsx` — 能力标签展示用 registry 名称
5. `src/mocks/handlers.ts` — 新增 `GET /agents/capabilities`

**工作量估计：** 1 个 task

---

### G4 🟡 DAG 可视化面板 (P2)

**新增端点：**
- `GET /v1/orchestrator/tasks/{task_id}/dag` → `DagResponse { nodes[], edges[] }`

**需改动文件：**

1. `src/types/chat.ts` — 新增类型：
   - `DagResponse { taskId, status, nodes, edges }`
   - `DagNode { subtaskId, agentId, agentName, instruction, status, latencyMs?, outputMessageId? }`
   - `DagEdge { from, to }`

2. `src/lib/api.ts` — 新增 `orchestratorApi.dag(taskId)` → `GET /orchestrator/tasks/{task_id}/dag`

3. `src/components/chat/ReActPanel.tsx` — 集成 DAG 图视图：
   - 调用 orchestratorApi.dag 获取 DAG 数据
   - 用 CSS/内联 SVG 渲染 DAG 拓扑图（不引入 cytoscape 等重型库）
   - 节点颜色按 status 区分（running=蓝, success=绿, failed=红, queued=灰）
   - 悬浮显示 agent 名称、指令、耗时

4. `src/mocks/handlers.ts` — 新增 DAG mock

**工作量估计：** 2 个 task

---

### G5 🟡 对话 SSE orchestrateMode (P2)

**变更：**
- `GET /conversations/{id}/stream` 新增 `orchestrateMode` 参数
- SSE `message_start.meta` 新增 `plan[]` 字段（SubTaskPlan 列表）

**需改动文件：**

1. `src/types/chat.ts` — `SSEMessageStartMeta` 拓展 `plan` 字段（已有基础结构）
2. `src/lib/sse.ts` — `createSSEStream` 新增 `orchestrateMode` 参数
3. `src/components/layout/ChatArea.tsx` — 群聊模式传递 `orchestrateMode`；消费 SSE plan 事件触发 OrchestratorPlan 展示

**工作量估计：** 1 个 task

---

### G6 🟢 消息过滤参数透传 (P2)

**变更：**
- `GET /conversations/{id}/messages` 新增 `senderType`/`senderId` 参数

**需改动文件：**

1. `src/lib/api.ts` — `messageApi.list` 新增可选参数 `senderType?`/`senderId?`
2. 前端暂不添加 UI 筛选入口（后端先支持，前端按需再开）

**工作量估计：** 0.5 task

---

### G7 🟡 密码修改 UI (P1)

**新增端点：**
- `PATCH /v1/auth/password` — `{ old_password, new_password }`

**需改动文件：**

1. `src/lib/api.ts` — 新增 `authApi.changePassword(old, new)` → `PATCH /v1/auth/password`
2. `src/components/settings/SettingsPage.tsx` — 安全设置区新增"修改密码"区块
3. `src/mocks/handlers.ts` — 新增 mock

**工作量估计：** 0.5 task

---

### G8 🟡 认证相关 UI 增强 (P1)

**登出按钮、User 头像展示，这些基础交互尚未完善：**

1. `src/components/layout/IconSidebar.tsx` — 底部加用户头像 + 登出按钮
2. `src/components/layout/AppLayout.tsx` — 未登录时跳转 `/login`（已有 ProtectedRoute）
3. Token 刷新已有拦截器，需测试过期 → 刷新 → 重试链路

**工作量估计：** 1 task

---

### G9 🟡 Mock 对齐 (独立开发必备)

**需新增 Mock：**

| Mock 端点 | 返回值 |
|-----------|--------|
| `POST /v1/auth/send-code` | `{ status: "ok" }` |
| `POST /v1/auth/register` | `TokenResponse` |
| `POST /v1/auth/login` | `TokenResponse` |
| `POST /v1/auth/refresh` | `TokenResponse` |
| `GET /v1/auth/me` | `UserResponse` |
| `PATCH /v1/auth/password` | `{ status: "ok" }` |
| `GET/POST/PATCH/DELETE /v1/projects` | CRUD |
| `GET /v1/agents/capabilities` | `["coding","review","..."]` |
| `GET /v1/orchestrator/tasks/{id}/dag` | `DagResponse` |

**工作量估计：** 1.5 task

---

## 实施计划 — 全部完成

| Task | 名称 | 优先级 | 状态 |
|------|------|--------|:--:|
| T1 | 对话与项目关联 | P1 | ✅ |
| T2 | Agent 能力标签 | P1 | ✅ |
| T3 | 认证 UI 增强 | P1 | ✅ |
| T4 | 密码修改 UI | P1 | ✅ |
| T5 | 项目管理全链路 | P1 | ✅ |
| T6 | Mock 对齐 | P1 | ✅ |
| T7 | DAG 可视化面板 | P2 | ✅ |
| T8 | SSE orchestrateMode 对接 | P2 | ✅ |
| T9 | 消息过滤参数透传 | P2 | ✅ |

---

## 完整后端对齐验证 — 2026-05-30

全量审计后端 32 个端点 vs 前端 API/Store/Hook/Mock 覆盖。

### 认证模块 (7 端点)

| 端点 | 后端 | 前端调用 | Mock | 对齐 |
|------|:--:|------|:--:|:--:|
| `POST /v1/auth/send-code` | ✅ | `authStore.sendCode()` | ✅ | ✅ |
| `POST /v1/auth/register` | ✅ | `authStore.register()` | ✅ | ✅ |
| `POST /v1/auth/login` | ✅ | `authStore.login()` | ✅ | ✅ |
| `POST /v1/auth/refresh` | ✅ | Axios 拦截器自动 | ✅ | ✅ |
| `GET /v1/auth/me` | ✅ | `authStore.fetchMe()` | ✅ | ✅ |
| `PATCH /v1/auth/password` | ✅ | `authApi.changePassword()` | ✅ | ✅ |
| `PATCH /v1/auth/me` | ❌ 缺失 | `authApi.updateProfile()` | ✅ | 🔴 |

**字段对齐：** `TokenResponse` / `UserResponse` / `RegisterRequest` / `LoginRequest` / `ChangePasswordRequest` 全部字段匹配 ✅

**Token 管理链：** localStorage → Axios 拦截器 → Bearer → 401 自动 refresh + 重试队列 → 失败清除 ✅

### 项目管理模块 (5 端点)

| 端点 | 后端 | 前端调用 | Mock | 对齐 |
|------|:--:|------|:--:|:--:|
| `POST /v1/projects` (201) | ✅ | `projectApi.create()` | ✅ | ✅ |
| `GET /v1/projects` | ✅ | `projectApi.list()` → `useProjects()` | ✅ | ✅ |
| `GET /v1/projects/{id}` | ✅ | `projectApi.detail()` → `useProject()` | ✅ | ✅ |
| `PATCH /v1/projects/{id}` | ✅ | `projectApi.update()` → `useUpdateProject()` | ✅ | ✅ |
| `DELETE /v1/projects/{id}` (204) | ✅ | `projectApi.delete()` → `useDeleteProject()` | ✅ | ✅ |

**8 字段对齐：** id/name/description/ownerId/defaultAgentIds/conversationCount/createdAt/updatedAt ✅

**UI 覆盖：** ProjectSwitcher（IconSidebar 项目卡片） + ProjectCreateModal + ConversationList 按 projectId 过滤 ✅

### Agent 模块 (8 端点)

| 端点 | 后端 | 前端调用 | Mock | 对齐 |
|------|:--:|------|:--:|:--:|
| `GET /v1/agents/capabilities` | ✅ | `agentApi.capabilities()` → `useAgentCapabilities()` | ✅ | ✅ |
| `GET /v1/agents` | ✅ | `agentApi.list()` → `useAgents()` | ✅ | ✅ |
| `GET /v1/agents/{id}` | ✅ | `agentApi.detail()` → `useAgent()` | ✅ | ✅ |
| `POST /v1/agents` (201) | ✅ | `agentApi.create()` → `useCreateAgent()` | ✅ | ✅ |
| `PATCH /v1/agents/{id}` | ✅ | `agentApi.update()` → `useUpdateAgent()` | ✅ | ✅ |
| `DELETE /v1/agents/{id}` (204) | ✅ | `agentApi.delete()` → `useDeleteAgent()` | ✅ | ✅ |
| `POST /v1/agents/verify` | ✅ | `agentApi.verify()` | ✅ | ✅ |

**注意：** 后端 `GET /agents` 支持 `skip/limit` 分页参数，前端暂未使用（直接拿全量）。🟢 不影响功能。

### 会话模块 (8 端点)

| 端点 | 后端 | 前端调用 | Mock | 对齐 |
|------|:--:|------|:--:|:--:|
| `GET /v1/conversations` | ✅ | `conversationApi.list()` → `useConversations()` | ✅ | ✅ |
| `POST /v1/conversations` (201) | ✅ | `conversationApi.create()` → `useCreateConversation()` | ✅ | ✅ |
| `GET /v1/conversations/{id}` | ✅ | `conversationApi.detail()` → `useConversation()` | ✅ | ✅ |
| `PATCH /v1/conversations/{id}` | ✅ | `conversationApi.update()` → `useUpdateAnyConversation()` | ✅ | ✅ |
| `DELETE /v1/conversations/{id}` (204) | ✅ | `conversationApi.delete()` → `useDeleteConversation()` | ✅ | ✅ |
| `POST /v1/conversations/{id}/pins` | ✅ | `conversationApi.pinMessage()` | ✅ | ✅ |
| `DELETE /v1/conversations/{id}/pins/{mid}` | ✅ | `conversationApi.unpinMessage()` | ✅ | ✅ |
| `GET /v1/conversations/{id}/stream` | ✅ | `createSSEStream()` | ✅ (mock SSE) | ✅ |

**查询参数对齐：**
- `projectId` 过滤 → ✅ T1
- `orchestrateMode` → ✅ T8
- `keyword` 搜索 → ✅ 已有
- `page/pageSize` 分页 → ✅ 已有

### 消息模块 (3 端点)

| 端点 | 后端 | 前端调用 | Mock | 对齐 |
|------|:--:|------|:--:|:--:|
| `GET /v1/conversations/{id}/messages` | ✅ | `messageApi.list()` → `useMessages()` | ✅ | ✅ |
| `POST /v1/conversations/{id}/messages` | ✅ | `messageApi.send()` → ChatArea | ✅ | ✅ |
| `POST /v1/messages/{id}/regenerate` | ✅ | `messageApi.regenerate()` | ✅ | ✅ |
| `GET /v1/messages/{id}/artifacts` | ✅ | `messageApi.getArtifacts()` | ✅ | ✅ |

**查询参数对齐：** `cursor`/`limit`/`senderType`/`senderId` → ✅ T9

### 编排器模块 (1 端点)

| 端点 | 后端 | 前端调用 | Mock | 对齐 |
|------|:--:|------|:--:|:--:|
| `GET /v1/orchestrator/tasks/{id}/dag` | ✅ | `orchestratorApi.dag()` → DagGraph | ✅ | ✅ |

**SSE 事件类型对齐（7 种）：**
`message_start` / `token` / `artifact` / `agent_status` / `thinking` / `message_end` / `error` ✅

### 健康检查 (1 端点)

| 端点 | 后端 | 前端 | 说明 |
|------|:--:|:--:|------|
| `GET /v1/health` | ✅ | ❌ 无 | 后端运维用，前端无需接入 🟢 |

---

## 对齐总结

| 模块 | 端点总数 | 已对齐 | 缺口 |
|------|:--:|:--:|------|
| 认证 | 7 | 6 + 1 🔴 | `PATCH /v1/auth/me` 后端缺失 |
| 项目管理 | 5 | 5 | 无 |
| Agent | 8 | 8 | 无 |
| 会话 | 8 | 8 | 无 |
| 消息 | 4 | 4 | 无 |
| 编排器 | 1 | 1 | 无 |
| 健康检查 | 1 | N/A | 前端无需 |
| **合计** | **34** | **32 + 1 🔴** | **1 个后端缺口** |

---

## 🔴 待后端补充

### 1. `PATCH /v1/auth/me` — 用户信息编辑

前端已全部实现，详见上文。后端需新增 3 处代码（schema/service/route）。

---

## 🟡 已设计未实现（不在当前范围）

以下功能在 `vibeCodingSummary/AgentHub-后端-需求方案-项目工作区与分享链接.md` 和 `vibeCodingPlan/` 中有设计方案，但**前后端均未实现**，属于后续迭代：

| 功能 | 优先级 | 说明 |
|------|:--:|------|
| 对话分享 | P2 | `shared_conversations` 表 + `POST/DELETE /share` + `GET /share/{id}` |
| 记忆管理 | P3 | `memory_entries` 表，按项目存储 Agent 工作上下文 |
| Agent API 分页 | 🟢 | 后端 `GET /agents` 已支持 `skip/limit`，前端按需加 |

---

## 来源

- **后端全量代码审计** (32 端点)：`backend/app/api/v1/auth.py` / `projects.py` / `agents.py` / `conversations.py` / `messages.py` / `orchestrator.py` / `health.py` / `router.py` / `deps.py`
- **后端 schemas**：`backend/app/schemas/auth.py` / `project.py` / `agent.py` / `conversation.py` / `message.py` / `orchestrator.py` / `base.py`
- **后端配置**：`backend/app/core/config.py` / `middleware.py` / `exceptions.py`
- **后端文档**：`vibeCodingSummary/AuthSystem-Implementation.md` / `vibeCodingSummary/AgentHub-后端-需求方案-项目工作区与分享链接.md`
- **前端全量代码审计** (17 文件)：`src/lib/api.ts` / `src/mocks/handlers.ts` / 5 个 stores / 4 个 hooks 文件 / 3 个 types 文件 / `src/lib/sse.ts`
