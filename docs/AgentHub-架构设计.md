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
- React 18 / TypeScript / Vite
- TailwindCSS + shadcn/ui
- Zustand（UI 临时状态）+ TanStack React Query（服务端状态）
- react-virtuoso（聊天长列表虚拟化）
- Monaco Editor（代码编辑与 Diff）
- 原生 fetch + ReadableStream（SSE 客户端）

### 后端
- FastAPI（REST + SSE）
- **Google ADK 2.0**（核心引擎：Agent 生命周期、Workflow 编排、Event 流式、模型适配）
- **AnthropicLlm**（Claude 模型）+ **LiteLLM**（OpenAI/Codex 等 100+ 模型）
- PostgreSQL（业务数据：会话、消息、Agent 配置、产物索引）
- Redis（缓存、SSE Pub/Sub）
- MinIO / S3（附件与产物对象存储）

### 客户端与多端（P2）
- 桌面端：Tauri / 移动端：React Native / PWA

### 基础设施与沙箱（P2）
- ADK `ContainerCodeExecutor` / Docker 容器

---

## 3. 功能来源矩阵：ADK 提供 vs 自研实现

> 以下矩阵覆盖 AgentHub.txt 全部核心功能，标注每项功能的实现来源。

| # | AgentHub 功能 | 来源 | 实现方式 |
|---|---|---|---|
| **IM 聊天交互** | | | |
| 1 | 对话列表 CRUD + 搜索/排序 | **自研** | FastAPI + PostgreSQL，ADK 不参与 |
| 2 | 单聊 (1v1 Agent) | **ADK+自研** | ADK LlmAgent + Runner；自研 SSE Translator、Context Assembler |
| 3 | 群聊 (@多Agent) | **ADK+自研** | ADK Workflow Graph 编排；自研两阶段协议、DAG Tracer |
| 4 | 消息类型 (文本/代码/图片/文件) | **ADK+自研** | ADK Event.content 承载文本；自研 Artifact Service 管理卡片 |
| 5 | 消息操作 (回复/引用/重生成/复制) | **ADK+自研** | ADK Session 管理历史；自研 Message API 提供操作端点 |
| 6 | 上下文管理 (历史+Pin) | **ADK+自研** | ADK Session.events 自动传递；自研 Context Assembler 注入 Pin |
| **Orchestrator** | | | |
| 7 | 意图理解与任务拆解 | **ADK** | BuiltInPlanner / PlanReActPlanner |
| 8 | Agent 分派与调度 | **ADK** | Workflow Graph (Node/Edge/max_concurrency) |
| 9 | 计划→确认→执行协议 | **自研** | OrchestratorTwoPhaseProtocol，ADK 提供 state_delta 基础 |
| 10 | 并行调度 | **ADK** | Node(parallel_worker=True) + Workflow(max_concurrency=N) |
| 11 | 失败降级与重试 | **ADK** | retry_config + on_model_error_callback |
| 12 | 代码冲突处理 | **自研** | MergeAggregator 冲突检测 + ADK Orchestrator 协调 |
| **多 Agent 接入** | | | |
| 13 | 统一适配器 (Claude/Codex/OpenCode) | **ADK** | AnthropicLlm + LiteLLM，无需自研适配器 |
| 14 | 用户自建 Agent (对话式创建) | **自研** | Meta-Agent (Builder Agent)，基于 ADK LlmAgent 实现 |
| 15 | Agent 能力标签与注册 | **自研** | CapabilityRegistry，注入 ADK instruction |
| **产物预览与编辑** | | | |
| 16 | 产物内联卡片 (代码/Diff/预览/文件) | **ADK+自研** | ADK EventActions.artifact_delta 推送；自研 Artifact Service 落库 |
| 17 | 代码编辑器 + 全屏预览 | **自研** | 前端 Monaco Editor + iframe 模态框 |
| 18 | Diff 视图 + 版本历史 (P2) | **自研** | Diff 解析引擎 + artifacts.version 字段 |
| 19 | 对话式局部修改 (P2) | **自研** | context_reference 消息元数据 + ADK 上下文注入 |
| **部署发布 (P2)** | | | |
| 20 | 部署指令 → 状态卡片 | **自研** | Deployment Service + SSE deploy_status 事件 |
| 21 | 预览 URL / 静态站点 / 容器化 | **自研** | MinIO 静态托管 + ADK ContainerCodeExecutor |
| **创新功能** | | | |
| 22 | DAG 执行轨迹可视化 | **自研** | ExecutionTracer + DAGBuilder，从 ADK callback + Workflow Graph 提取 |
| 23 | Spec/Skill/Rules 注入 | **自研** | SpecManager + ADK global_instruction / before_agent_callback |
| 24 | 结果仲裁解释 | **自研** | MergeAggregator，调用 ADK Orchestrator 生成解释 |
| 25 | 成本-质量自适应路由 (P2) | **自研** | CostQualityRouter，基于 Agent 能力评分 |

**统计：25 项功能中，ADK 直接提供 5 项 (20%)，ADK+自研 8 项 (32%)，完全自研 12 项 (48%)。ADK 参与度为 52%。**

---

## 4. 总体架构设计

```text
┌─────────────────────────────────────────────────────────────┐
│  [Web Client]                                               │
│  Chat UI / Artifact UI / Diff UI / SSE Client              │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST + SSE (6 event protocol)
┌──────────────────────▼──────────────────────────────────────┐
│  [API Gateway - FastAPI]           ← 全部自研               │
│  ├─ Conversation Service    (CRUD, 搜索, 排序, Pin)         │
│  ├─ Message Service         (存储, 内联 artifacts)          │
│  ├─ Agent Management API    (CRUD, 能力注册)                │
│  ├─ Orchestrator API        (计划确认, DAG查询)             │
│  └─ Stream Endpoint         (SSE 连接管理)                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  [自研层 — AgentHub 定制组件]                                │
│  ├─ ADK-to-SSE Translator  ← ADK Event → 6事件 SSE         │
│  ├─ Context Assembler      ← 历史消息 + Pin + Rules 组装    │
│  ├─ Orchestrator 2-Phase   ← 计划→确认→执行协议             │
│  ├─ Execution Tracer       ← callback 拦截 → DAG 数据       │
│  ├─ Capability Registry    ← Agent 能力标签管理             │
│  ├─ Spec Manager           ← Spec/Rules CRUD + 注入         │
│  ├─ Meta-Agent (Builder)   ← 对话式创建 Agent               │
│  └─ Merge Aggregator       ← 结果聚合 + 仲裁解释            │
└──────────────────────┬──────────────────────────────────────┘
                       │ 调用 ADK Python API
┌──────────────────────▼──────────────────────────────────────┐
│  [ADK 引擎层 — Google ADK 2.0]    ← ADK 直接提供            │
│  ├─ LlmAgent                ← 单聊 Agent                    │
│  ├─ Workflow (Graph)        ← 多 Agent 编排 (替代 Parallel) │
│  ├─ Runner.run_async()      ← AsyncGenerator[Event] 流式    │
│  ├─ AnthropicLlm / LiteLLM  ← Claude/Codex/OpenAI 模型适配  │
│  ├─ BuiltInPlanner          ← 任务拆解                      │
│  ├─ Session + State         ← 会话上下文 + 状态持久化       │
│  ├─ ArtifactService         ← 产物二进制存储                │
│  ├─ Callback System         ← before/after agent/model/tool │
│  ├─ RetryConfig             ← 失败重试                      │
│  ├─ ContainerCodeExecutor   ← 代码沙箱执行                  │
│  └─ Plugin System           ← 跨切面拦截                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  [Infra]                                                    │
│  PostgreSQL / Redis / MinIO-S3 / Docker Sandbox             │
└─────────────────────────────────────────────────────────────┘
```

**架构原则**：
- **ADK 负责**：Agent 生命周期、模型调用、流式生成、多 Agent 编排拓扑、会话状态、重试
- **自研负责**：业务 API、SSE 协议转换、计划确认交互、DAG 可视化数据、能力注册、Spec 管理、产物落库
- **边界清晰**：自研层通过 ADK Python API 调用引擎，不修改 ADK 源码，ADK 版本升级不影响自研层

---

## 5. 核心模块详细说明

> 标注规则：**[ADK]** = Google ADK 2.0 直接提供 &emsp; **[自研]** = 自行开发 &emsp; **[ADK+自研]** = ADK 提供基础能力，自研封装

### 5.1 [自研] Conversation Service（会话域）
**ADK 角色**：无。会话元数据（列表、排序、归档）属于业务逻辑，不经过 ADK。

- 管理会话列表：新建、置顶、归档、搜索、最近活跃排序
- 会话类型：`single` / `group`
- Pin 消息管理：`message_pins` 表存储，供 Context Assembler 读取
- API：`POST/GET/PATCH/DELETE /api/v1/conversations`

### 5.2 [自研] Message Service（消息域）
**ADK 角色**：无。消息存储由自研管理，ADK Session.events 仅用于运行时上下文传递。

- 消息存储：`messages` 表，含 sender_type/user/agent/orchestrator/system
- 消息类型：text/markdown（content 字段），卡片类型通过关联 `artifacts` 表实现
- 内联产物：查询时 JOIN `artifacts` 表，每条消息直接包含 `artifacts[]` 数组
- 操作端点：发送、重生成、引用回复、Pin/Unpin
- API：`POST/GET /api/v1/conversations/{id}/messages`、`POST /api/v1/messages/{id}/regenerate`

### 5.3 [ADK] Agent 引擎 — 模型调用与流式生成
**对应 ADK API**：`LlmAgent` + `Runner.run_async()`

ADK 直接提供的能力：
- **模型调用**：`AnthropicLlm` 调用 Claude、LiteLLM 调用 OpenAI/Codex，一行配置切换模型
- **流式生成**：`Runner.run_async()` 返回 `AsyncGenerator[Event]`，Event 包含 `partial`（流式增量）、`turn_complete`（完成）、`usage_metadata`（Token 统计）
- **System Prompt**：通过 `LlmAgent(instruction=...)` 设置
- **Tool Calling**：通过 `LlmAgent(tools=[...])` 注册工具函数
- **生命周期回调**：`before_agent_callback`、`after_agent_callback`、`before_model_callback`、`after_model_callback`

自研层如何调用：
```python
# 自研的 ADK-to-SSE Translator 调用 ADK
async for event in runner.run_async(
    user_id=user_id,
    session_id=session_id,
    new_message=Content(role=”user”, parts=[Part.from_text(text=user_msg)]),
    run_config=RunConfig(streaming_mode=StreamingMode.SSE),
):
    # 自研层将 event 转为 SSE 6事件格式
    yield translate_event_to_sse(event)
```

### 5.4 [ADK] Agent 编排引擎 — Workflow Graph
**对应 ADK API**：`Workflow` + `Node` + `Edge` + `JoinNode`

ADK 2.0 使用 Graph-based Workflow 系统（替代已废弃的 ParallelAgent/SequentialAgent/LoopAgent）：

- **拓扑定义**：`Node`（Agent 节点）+ `Edge`（有向边）+ `JoinNode`（汇聚节点）
- **并发控制**：`Node(parallel_worker=True)` + `Workflow(max_concurrency=N)`
- **条件路由**：`Edge(route=...)` 支持条件分支
- **状态传递**：Node 之间通过 `output_key` + Session `state` 传递数据

自研层使用方式：
```python
# 自研 Orchestrator 根据 Plan JSON 动态构建 Workflow
code_gen = Node(name=”code_gen”, agent=claude_agent, parallel_worker=True)
code_review = Node(name=”code_review”, agent=reviewer_agent, parallel_worker=True)
merge = JoinNode(name=”merge”)

workflow = Workflow(
    name=”task_execution”,
    edges=[
        Edge(from_node=START, to_node=code_gen),
        Edge(from_node=START, to_node=code_review),  # 并行
        Edge(from_node=code_gen, to_node=merge),
        Edge(from_node=code_review, to_node=merge),
    ],
    max_concurrency=2,
)
```

### 5.5 [ADK] Planner — 任务拆解
**对应 ADK API**：`BuiltInPlanner` / `PlanReActPlanner`

- `BuiltInPlanner`：基础规划器，生成步骤列表
- `PlanReActPlanner`：Reasoning + Acting 规划器，适合复杂推理任务
- 通过 `LlmAgent(planner=BuiltInPlanner())` 配置

自研层封装：Orchestrator 调用 Planner 生成计划 → 转为标准 Plan JSON schema → 返回前端 OrchestratorPlan 卡片。

### 5.6 [自研] ADK-to-SSE Translator（协议转换器）
**核心职责**：将 ADK `AsyncGenerator[Event]` 转换为 AgentHub 前端约定的 `SSE 6 事件协议`。

**字段映射表**（ADK Event → SSE 事件）：

| ADK Event 字段 | 判断条件 | SSE 事件 | SSE 字段 |
|---|---|---|---|
| `invocation_id` | 首次出现新 invocation_id | `message_start` | message_id |
| `author` | 新 author 首次出现 | `message_start` | sender.type/id/name |
| `content.parts[].text` | `partial=True` | `token` | delta, index(自增) |
| `actions.artifact_delta` | 非空 | `artifact` | artifact.id/type/title/content |
| `actions.transfer_to_agent` | 非空 | `agent_status` | agent.id/name, status=”running” |
| `actions.end_of_agent` | True | `agent_status` / `message_end` | status=”done” / finish_reason |
| `turn_complete` | True | `message_end` | finish_reason, usage |
| `usage_metadata` | 非空 | `message_end` | usage.input_tokens/output_tokens |
| `error_code` / `error_message` | 非空 | `error` | code, message, retryable |
| `timestamp` | 始终 | 全部事件 | timestamp |
| `branch` | 非空 | `agent_status` | subtask_id |

实现位置：`backend/app/services/adapters/adk_to_sse.py`

### 5.7 [自研] Context Assembler（上下文组装器）
**职责**：在调用 ADK Runner 前，从数据库组装完整的上下文。

- 截取最近 N 条消息（可配置窗口大小）
- 合并 pinned 消息（从 `message_pins` 表读取）
- 注入 Spec/Skill/Rules（从 SpecManager 读取）
- 注入 Agent 能力描述（从 CapabilityRegistry 读取）
- 组装为 ADK `Content` 列表传入 `runner.run_async()`

### 5.8 [自研] Orchestrator 两阶段协议
**职责**：实现”计划→确认→执行”的群聊交互协议。

**流程**：
```
① 用户发送群聊消息（mode: auto_orchestrate）
② [ADK Planner] 拆解为结构化计划 JSON
③ [自研] 生成 sender_type=”orchestrator” 的计划消息，附带 artifact_type=”plan”
④ 前端渲染 OrchestratorPlan 卡片
⑤ 用户确认/调整 → POST /api/v1/conversations/{id}/orchestrator/confirm
⑥ [ADK Workflow] 根据确认后的 Plan JSON 动态构建 Workflow Graph 并执行
⑦ [自研] 通过 after_agent_callback 监听 → 推送 agent_status SSE 事件
⑧ 各 Agent 流式输出 → [自研 ADK-to-SSE Translator] 转换为独立消息气泡
⑨ [自研 Merge Aggregator] 聚合汇总
```

**ADK 提供的支持**：`state_delta` 机制可实现 Phase 1 → Phase 2 的状态标记传递。

### 5.9 [ADK+自研] Artifact Service（产物域）
**ADK 提供**：`EventActions.artifact_delta` 机制、`InMemoryArtifactService` / `FileArtifactService` 二进制存储。

**自研封装**：
- 统一产物模型（`artifacts` 表）：code / diff / file / preview / plan / deploy_status
- MinIO 集成：大文件存储，`storage_key` 指向 MinIO 路径
- 产物 URL 生成：可控访问链接
- Diff 解析引擎：从 Agent 输出提取代码变更 → 标准 Diff JSON

### 5.10 [自研] Agent Capability Registry（能力注册中心）
**ADK 角色**：无内置能力注册。自研实现。

- 每个 Agent 在 `agents.capabilities` (JSONB) 中存储能力标签：`[“coding”, “docs”, “ui”, “reasoning”]`
- Context Assembler 读取标签，注入 ADK instruction 作为路由提示
- 后续可扩展：基于历史任务成功率的能力评分

### 5.11 [自研] Spec/Skill/Rules Manager（规范管理器）
**ADK 角色**：提供注入点（`global_instruction`、`before_agent_callback`），但不管理规范内容。

- Spec CRUD：创建/编辑/删除协作规范文档
- 注入时机：Context Assembler 在调用 ADK 前将 Spec 注入 `global_instruction` 或 `new_message` 前缀
- 版本管理：Spec 变更历史记录

### 5.12 [自研] Meta-Agent（Builder Agent — 对话式 Agent 创建）
**ADK 角色**：提供 `LlmAgent` 作为 Builder 的底层引擎。自研实现对话式创建流程。

- 识别用户”创建 Agent”意图 → 触发 Builder 流程
- Builder 通过多轮对话收集：名称、能力描述、System Prompt、工具需求
- 自动生成 System Prompt → 能力标签归类 → `POST /api/v1/agents` 落库
- 创建完成后返回 Agent 卡片消息

### 5.13 [自研] Execution Tracer + DAG Builder（执行轨迹 → 可视化数据）
**ADK 角色**：提供 `after_agent_callback`（拦截点）、`Event.branch`（分支标识）、Workflow Graph 结构（拓扑）。

**自研实现**：
- `ExecutionTracer`：在 callback 中收集每个 Node 的执行信息（agent_name, start_time, end_time, status, latency_ms, retry_count）
- `DAGBuilder`：将 Workflow Graph 的 edges + ExecutionTracer 的运行时数据合并为 DAG JSON
- API：`GET /api/v1/orchestrator/tasks/{id}/dag` → `{ nodes: [...], edges: [...] }`

### 5.14 [自研] Merge Aggregator（结果聚合与仲裁）
**ADK 角色**：提供 Orchestrator Agent 的自然语言总结能力。自研实现结构化聚合逻辑。

- 聚合策略：优选单结果 / 融合多结果（可配置）
- 冲突检测：多个 Agent 修改同一文件时标记冲突
- 仲裁解释：调用 ADK Orchestrator 生成采纳理由文本
- 聚合结果写入 `orchestrator_tasks.result_summary`

### 5.15 [自研] Cost-Quality Router（成本-质量自适应路由 — P2）
**完全自研**，ADK 不提供成本感知路由。

- 任务复杂度分析 → 选择 Agent 级别（低成本 Haiku vs 高能力 Opus）
- Token 消耗追踪
- 基于历史任务成功率的质量评分

---

## 6. 可扩展性设计

1. **ADK 版本隔离**
   - 自研层仅通过 ADK 公开 Python API 调用（`Runner`, `LlmAgent`, `Workflow`, `Event`）
   - 不修改 ADK 源码，不依赖 ADK 内部私有 API
   - 锁定 `google-adk==2.0.0`，升级时仅需验证自研层的适配

2. **协议版本化**
   - 所有 SSE 事件、消息体包含 `version` 字段（当前 `v1`）
   - ADK 升级导致 Event 字段变化时，在 Translator 层做兼容转换

3. **策略可插拔**
   - 路由策略（速度优先/质量优先/成本优先）通过 CapabilityRegistry 配置
   - 聚合策略（优选单结果/融合多结果）通过 MergeAggregator 策略模式切换

4. **渲染插件机制（前端）**
   - 前端按 `artifact_type` 注册渲染器组件（CodeCard / DiffCard / PreviewCard / FileCard / DeployStatusCard）
   - 新增卡片类型：自研层新增 artifact type + 前端新增渲染组件

5. **上下文分层管理**
   - 短期窗口（最近 N 条）+ Pin 消息（长期）+ ADK Session 自动摘要
   - ADK 的 token compaction 机制自动压缩超长上下文

6. **模型热切换**
   - ADK AnthropicLlm + LiteLLM 支持 100+ 模型
   - 修改 Agent 配置的 `model` 字段即可切换，无需改代码

---

## 7. 创新性设计（与 ADK 关系）

| 创新点 | ADK 提供的支撑 | 自研增量 |
|---|---|---|
| DAG 协作可视化 | Workflow Graph 拓扑 + callback 拦截点 | ExecutionTracer 运行时数据 + DAGBuilder |
| Spec/Rules 自动注入 | global_instruction + before_agent_callback 注入点 | SpecManager CRUD + 版本管理 |
| 结果仲裁解释 | Orchestrator Agent 的 LLM reasoning | 结构化冲突检测 + 采纳理由生成 |
| 成本-质量自适应路由 | 多模型切换能力 | 任务复杂度分析 + 成本追踪 + 质量评分 |
| IM 聊天式 Agent 协作 | LlmAgent + Runner 流式引擎 | 会话管理 + SSE 协议 + 前端 Chat UI |

---

## 8. 数据库表设计（PostgreSQL）

> 说明：以下为 P0 + P2 可扩展模型，字段可按实际开发精简。

### 8.1 `users`
- `id` (uuid, pk)
- `email` (varchar, unique)
- `name` (varchar)
- `avatar_url` (varchar, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 8.2 `agents`
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

### 8.3 `conversations`
- `id` (uuid, pk)
- `title` (varchar)
- `type` (varchar) // single/group
- `owner_id` (uuid, fk -> users.id)
- `is_archived` (boolean)
- `is_pinned` (boolean)
- `last_active_at` (timestamp)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 8.4 `conversation_participants`
- `id` (uuid, pk)
- `conversation_id` (uuid, fk -> conversations.id)
- `participant_type` (varchar) // user/agent/orchestrator
- `participant_id` (uuid) // 对应 users.id 或 agents.id
- `role` (varchar, nullable) // owner/member
- `joined_at` (timestamp)

索引建议：
- unique(`conversation_id`, `participant_type`, `participant_id`)

### 8.5 `messages`
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

### 8.6 `message_mentions`
- `id` (uuid, pk)
- `message_id` (uuid, fk -> messages.id)
- `agent_id` (uuid, fk -> agents.id)
- `created_at` (timestamp)

### 8.7 `message_pins`
- `id` (uuid, pk)
- `conversation_id` (uuid, fk -> conversations.id)
- `message_id` (uuid, fk -> messages.id)
- `created_by` (uuid, fk -> users.id)
- `created_at` (timestamp)

### 8.8 `artifacts`
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

### 8.9 `orchestrator_tasks`
- `id` (uuid, pk)
- `conversation_id` (uuid, fk -> conversations.id)
- `trigger_message_id` (uuid, fk -> messages.id)
- `status` (varchar) // queued/running/partial_success/success/failed
- `plan` (jsonb) // 拆解任务计划
- `result_summary` (jsonb, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### 8.10 `orchestrator_subtasks`
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

## 9. API 清单（REST + SSE）

## 9.1 会话与消息

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

## 9.2 Agent 管理

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

## 9.3 产物与 Diff

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

## 9.4 部署（P2）

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

## 9.5 SSE 流式

### 订阅会话流
- `GET /api/v1/conversations/{conversation_id}/stream`
- Headers:
  - `Accept: text/event-stream`
  - `Authorization: Bearer <token>`

---

## 10. SSE 事件 JSON 示例

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
  "message": "Google ADK 执行子任务 agent-codex 超时，已触发降级策略",
  "retryable": true,
  "timestamp": "2026-05-20T10:00:06Z"
}
```

---

## 11. 三人/20天实施建议（ADK 分工版）

### 前端（1人）
- 聊天主界面、会话列表、消息卡片体系
- SSE 流式渲染（6事件协议消费）、虚拟列表、Monaco + Diff
- OrchestratorPlan 卡片、AgentProgressBar、DAG 可视化组件

### 后端A（1人）— 业务 API + 数据层 + 自研组件
- FastAPI 基础工程、响应中间件、camelCase 序列化
- 会话/消息/Agent CRUD API（ADK 不参与）
- PostgreSQL 模型与迁移、MinIO 接入
- **自研组件**：Context Assembler、Artifact Service、CapabilityRegistry、SpecManager、Meta-Agent

### 后端B（1人）— ADK 集成 + 流式管道 + 编排
- ADK 2.0 环境配置：AnthropicLlm + LiteLLM 模型配置
- **自研组件**：ADK-to-SSE Translator、Orchestrator 两阶段协议、ExecutionTracer + DAGBuilder、MergeAggregator
- ADK Workflow Graph 动态构建、Planner 集成
- 流式管道：ADK Event → SSE 6事件 → 前端渲染
- 异常处理：ADK error_code/error_message → SSE error 事件

---

## 12. 交付物映射

- 产品设计文档：本架构文档 + 页面交互补充
- 技术文档：API + 数据库 + SSE 协议
- 可运行 Demo：P0 全链路（单聊/群聊/流式/产物）
- AI 协作记录：Spec/Skill/Rules 注入流程与样例
- 3 分钟 Demo 视频：核心路径 + 创新点展示
