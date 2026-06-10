# AgentHub 产品设计文档

> **版本**: v1.0  
> **日期**: 2026-06-10  
> **状态**: 已完成核心功能开发

---

## 目录

1. [产品概述](#1-产品概述)
2. [目标用户与使用场景](#2-目标用户与使用场景)
3. [核心功能全景](#3-核心功能全景)
4. [系统架构](#4-系统架构)
5. [功能模块详解](#5-功能模块详解)
   - [5.1 认证与用户系统](#51-认证与用户系统)
   - [5.2 项目工作区](#52-项目工作区)
   - [5.3 Agent 管理](#53-agent-管理)
   - [5.4 单聊对话](#54-单聊对话)
   - [5.5 群聊编排](#55-群聊编排)
   - [5.6 产物卡片系统](#56-产物卡片系统)
   - [5.7 部署功能](#57-部署功能)
   - [5.8 消息管理](#58-消息管理)
   - [5.9 设置与个性化](#59-设置与个性化)
6. [用户体验设计](#6-用户体验设计)
7. [数据模型](#7-数据模型)
8. [API 设计规范](#8-api-设计规范)
9. [技术架构](#9-技术架构)
10. [产品路线图](#10-产品路线图)

---

## 1. 产品概述

### 1.1 产品定位

**AgentHub** 是一个 **Multi-Agent 协作平台**，以 IM 聊天界面为载体，集成 Google ADK（Agent Development Kit）编排引擎，支持用户与单个 AI Agent 对话、以及多个 AI Agent 群聊协作两种核心模式。

### 1.2 核心价值主张

| 维度 | 价值 |
|------|------|
| **统一入口** | 在一个聊天界面中接入多种 AI Agent（Claude、GPT、DeepSeek 等云端模型 + Claude Code CLI、Codex CLI 等本地 Agent） |
| **协作编排** | 通过 Planner → Coordinator / DAG Workflow 实现多 Agent 自动分工与并行执行 |
| **富产物输出** | Agent 产出的代码、文档、Diff、部署预览等 8 种产物卡片内联渲染，支持编辑回写 |
| **开放适配** | Adapter 模式统一抽象 LLM 和 CLI Agent，支持任意兼容 OpenAI/Anthropic 协议的模型 |
| **实时流式** | SSE（Server-Sent Events）7 种事件协议实现逐 token 流式输出、思维链可视化、Agent 状态追踪 |

### 1.3 产品形态

- **Web 应用**（React 19 SPA），适配桌面浏览器
- **后端服务**（FastAPI + PostgreSQL）提供 REST API + SSE 流式接口
- 支持 Mock 模式（前端独立开发）和真实 API 模式

---

## 2. 目标用户与使用场景

### 2.1 目标用户画像

| 用户角色 | 特征 | 核心需求 |
|----------|------|----------|
| **开发者** | 熟悉编程，日常使用 AI 辅助编码 | 代码生成/审查、Diff 对比、一键部署预览 |
| **技术管理者** | 关注项目进度和质量 | 多 Agent 协作完成复杂任务、产物可追溯 |
| **AI 爱好者** | 探索不同 AI 模型能力 | 自由接入各类模型、对比 Agent 输出质量 |
| **产品/设计人员** | 非技术背景，需要 AI 辅助创作 | 文档生成、PPT 预览、链接预览 |

### 2.2 典型使用场景

#### 场景 1：单 Agent 编程辅助

> 用户选择 Claude Code CLI Agent，发送"帮我写一个 Python Flask REST API"，Agent 返回带语法高亮的代码卡片，用户选中某段代码，点击「引用此片段修改」要求 Agent 对特定函数添加异常处理，Agent 返回 Diff 卡，用户点击「应用到源文件」将改动合并到原始代码卡。

#### 场景 2：多 Agent 协作调研

> 用户在群聊中 @Claude @GPT @DeepSeek，发送"请各自调研 WebAssembly 在 2026 年的最新进展，然后汇总成一份报告"。Planner 自动拆解任务为 3 个子任务分派给 3 个 Agent，Coordinator 协调执行顺序，最后 MergeAggregator 汇总为一份报告。

#### 场景 3：一键部署预览

> 用户让 Agent 生成一个 HTML  landing page，Agent 返回代码卡片的同时自动触发部署流程（源码收集 → 静态站点构建 → 容器启动），前端 DeployStatusCard 实时轮询部署状态，完成后显示预览链接，用户点击即可在 iframe 中查看效果。

#### 场景 4：文档转换与预览

> 用户上传 PPTX 文件，后端通过 Gotenberg 自动转换为 PDF，DocumentCard 以内联 PDF iframe 渲染，用户无需下载即可预览。

---

## 3. 核心功能全景

```
AgentHub
├── 认证与用户系统
│   ├── JWT 登录/注册
│   ├── Refresh Token 自动续期
│   └── 邮箱验证码
│
├── 项目工作区
│   ├── 项目 CRUD
│   ├── 项目切换
│   └── 对话归属项目
│
├── Agent 管理
│   ├── Agent CRUD（自定义创建/编辑/删除）
│   ├── 多 Provider 适配（Anthropic / OpenAI / LiteLLM / CLI）
│   ├── 能力标签系统（CapabilityRegistry）
│   ├── 工具配置（ToolLoader → ADK FunctionTool）
│   ├── 连通性验证
│   └── 内置种子 Agent（5 个默认 Agent）
│
├── 单聊对话
│   ├── 对话 CRUD（创建/列表/归档/删除）
│   ├── 流式消息（SSE 7 事件协议）
│   ├── 上下文组装（4 层 Token Budget）
│   ├── 消息重新生成
│   ├── 思维链可视化（ThinkingBlock）
│   └── 消息操作（复制/引用/钉选）
│
├── 群聊编排
│   ├── @ 提及触发群聊
│   ├── Planner 任务拆解（LLM 自动规划）
│   ├── 计划审批（plan_draft → refine → confirm）
│   ├── Coordinator 动态分派执行
│   ├── DAG Workflow 静态依赖图执行
│   ├── DAG 可视化（DagGraph 组件）
│   ├── Agent 进度条（AgentProgressBar）
│   ├── ReAct 面板（思考过程追踪）
│   └── MergeAggregator 结果汇总
│
├── 产物卡片系统
│   ├── CodeCard（代码高亮/编辑/选区改写/版本链回写）
│   ├── DiffCard（并排对比/应用到源文件）
│   ├── FileCard（文件下载）
│   ├── PreviewCard（网页 iframe 内嵌预览）
│   ├── LinkPreviewCard（OG 元数据卡片）
│   ├── DocumentCard（PDF/PPTX/DOC 内联预览）
│   ├── DeployStatusCard（部署状态轮询/预览链接）
│   └── ConflictResolver（多 Agent 冲突文件对比）
│
├── 部署功能
│   ├── 部署命令解析
│   ├── 源码收集
│   ├── 静态站点构建
│   ├── 容器化部署
│   ├── 部署状态轮询
│   └── 预览 URL 生成
│
├── 消息管理
│   ├── 消息列表（游标分页）
│   ├── 消息钉选/取消钉选（含用户消息）
│   ├── 消息上下文菜单（右键）
│   └── 对话级软删除
│
└── 设置与个性化
    ├── 主题切换（亮色/暗色/跟随系统）
    ├── 背景色自定义
    ├── Token 用量统计与图表
    └── 用户偏好持久化
```

---

## 4. 系统架构

### 4.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     agenthub-web (React 19)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Zustand   │ │TanStack   │ │ SSE      │ │ Semi Design   │  │
│  │ Stores(6) │ │Query(5)   │ │ Manager  │ │ UI Components │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP REST + SSE Stream
┌──────────────────────┴──────────────────────────────────────┐
│                   FastAPI Backend                            │
│  ┌──────────────┐  ┌──────────────────────────────────────┐ │
│  │ API Layer    │  │         Service Layer                 │ │
│  │ (Route→Param)│  │  ┌────────────┐ ┌─────────────────┐  │ │
│  │              │  │  │ Adapters   │ │  ADK Engine     │  │ │
│  │ • agents     │  │  │ (3 types)  │ │  • Runner       │  │ │
│  │ • convs      │  │  │            │ │  • Planner      │  │ │
│  │ • messages   │  │  │ • Anthropic│ │  • Coordinator  │  │ │
│  │ • orch       │  │  │ • LiteLLM  │ │  • DAG Workflow │  │ │
│  │ • projects   │  │  │ • CLI      │ │  • Tracer       │  │ │
│  │ • files      │  │  └────────────┘ └─────────────────┘  │ │
│  │ • deploy     │  │  ┌──────────────────────────────────┐ │ │
│  │ • auth       │  │  │ Domain Services                  │ │ │
│  └──────────────┘  │  │ • ContextAssembler               │ │ │
│                    │  │ • ArtifactDetector               │ │ │
│  ┌──────────────┐  │  │ • ArtifactService                │ │ │
│  │ Core         │  │  │ • PinSpecInjector                │ │ │
│  │ • Config     │  │  │ • DeploymentService              │ │ │
│  │ • Database   │  │  │ • Converter (Gotenberg)          │ │ │
│  │ • Middleware │  │  │ • AgentBuilder                   │ │ │
│  │ • Exception  │  │  └──────────────────────────────────┘ │ │
│  └──────────────┘  └──────────────────────────────────────┘ │
└──────┬──────────┬──────────┬───────────┬────────────────────┘
       │          │          │           │
  ┌────┴────┐ ┌──┴───┐ ┌───┴───┐ ┌────┴─────┐
  │PostgreSQL│ │Redis │ │MinIO  │ │Gotenberg │
  │ (主存储) │ │(缓存)│ │(文件) │ │(文档转换)│
  └──────────┘ └──────┘ └───────┘ └──────────┘
```

### 4.2 技术选型

| 层次 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| **前端框架** | React + TypeScript | 19 / 6 | 生态成熟，类型安全 |
| **构建工具** | Vite | 8 | 快速 HMR，ESM 原生 |
| **UI 组件库** | Semi Design | 2.x | 字节跳动出品，组件丰富，主题定制强 |
| **状态管理** | Zustand | 5 | 轻量、无 boilerplate、支持 React 外调用 |
| **服务端状态** | TanStack React Query | 5 | 自动缓存/失效/重取 |
| **后端框架** | FastAPI | — | 异步原生、自动 OpenAPI 文档 |
| **ORM** | SQLAlchemy | async | 异步支持，成熟稳定 |
| **数据库** | PostgreSQL | — | JSONB 支持、ACID 事务 |
| **Agent 引擎** | Google ADK | 2.0 | 多 Agent 编排、Workflow Graph |
| **LLM SDK** | Anthropic + OpenAI + LiteLLM | — | 多 Provider 覆盖 |
| **文件存储** | MinIO | — | S3 兼容，自托管 |
| **文档转换** | Gotenberg | — | PPTX→PDF 无头转换 |
| **代码编辑器** | Monaco Editor | — | VS Code 内核 |
| **语法高亮** | Shiki | — | TextMate 语法，准确度高 |
| **图表** | Recharts | — | React 原生，可组合 |

---

## 5. 功能模块详解

### 5.1 认证与用户系统

#### 5.1.1 功能概述

基于 JWT 的认证体系，支持 Access Token + Refresh Token 双令牌机制。前端 axios interceptor 自动处理 Token 刷新，用户无感续期。

#### 5.1.2 功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 用户名+密码注册 | ✅ 已完成 | JWT Access + Refresh Token |
| 登录/登出 | ✅ 已完成 | authStore 管理状态 |
| Token 自动刷新 | ✅ 已完成 | axios interceptor 透明续期 |
| 受保护路由 | ✅ 已完成 | ProtectedRoute 组件 |
| 邮箱验证码 | ✅ 已完成 | 发送逻辑已实现，支持 Resend API |
| 密码修改 | ✅ 已完成 | 旧密码验证 |
| 频率限制 | ✅ 已完成 | 验证码发送频率控制 |

#### 5.1.3 用户流程

```
注册 → 登录 → [Access Token (30min) + Refresh Token (7d)]
                     ↓
          前端拦截器自动判断 401 → 用 Refresh Token 换新 Access Token
                     ↓
          续期失败 → 清除状态 → 跳转登录页
```

---

### 5.2 项目工作区

#### 5.2.1 功能概述

支持多项目隔离，每个对话可归属到特定项目。通过 ProjectSwitcher 组件在顶部切换。

#### 5.2.2 功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 项目创建 | ✅ 已完成 | ProjectCreateModal |
| 项目切换 | ✅ 已完成 | ProjectSwitcher 下拉 |
| 对话归属 | ✅ 已完成 | conversations.project_id |
| 项目删除级联 | ✅ 已完成 | ON DELETE SET NULL |

---

### 5.3 Agent 管理

#### 5.3.1 功能概述

Agent 是平台的一等公民。用户可创建自定义 Agent（选择 Provider、配置模型/API Key/能力标签/工具），也可使用内置种子 Agent。系统通过 **Adapter 模式** 统一抽象不同 Provider。

#### 5.3.2 Provider 适配矩阵

| Provider | Adapter | 类型 | 说明 |
|----------|---------|------|------|
| `anthropic` | AnthropicAdapter | LLM | Anthropic 官方 API / 兼容代理 |
| `openai` | LiteLlmAdapter | LLM | OpenAI 官方 API / 兼容代理 |
| `deepseek` | LiteLlmAdapter | LLM | DeepSeek API |
| `litellm` | LiteLlmAdapter | LLM | 任意 LiteLLM 兼容端点 |
| `claude-code-cli` | CliAdapter | CLI | 本地 `claude` 命令行 |
| `codex-cli` | CliAdapter | CLI | 本地 `codex` 命令行 |

#### 5.3.3 Agent 属性模型

```
Agent {
  name: string              # 显示名称
  avatar_url: string        # 头像 URL
  provider: string          # Provider 标识
  model: string             # 模型名（自由输入，无前缀校验）
  system_prompt: string     # 系统提示词
  capabilities: string[]    # 能力标签（如 ["coding", "writing"]）
  api_key: string           # API Key（支持多 Provider 独立配置）
  base_url: string          # API 端点（自动剥离标准后缀）
  tool_config: {            # 工具配置
    tools: [{type: "builtin"|"custom", name: string}]
  }
  is_builtin: boolean       # 是否内置
  is_active: boolean        # 启用状态
}
```

#### 5.3.4 工具系统

| 工具类型 | 说明 | 示例 |
|----------|------|------|
| **builtin** | 内置工具，CLI Runner 提供 | `read_file`, `write_file`, `execute_command`, `search_code`, `web_fetch` |
| **custom** | 自定义 FunctionTool / AgentTool | 通过 JSONB 配置，ToolLoader 转换为 ADK 工具 |

#### 5.3.5 能力标签系统（CapabilityRegistry）

- Agent 声明 `capabilities` 标签数组（如 `["frontend", "react", "css"]`）
- Planner 根据用户需求自动匹配具备相应能力的 Agent
- 使用 PostgreSQL `JSONB contains` 查询实现高效匹配

---

### 5.4 单聊对话

#### 5.4.1 功能概述

单聊是平台的基础交互模式：用户选择 1 个 Agent，发送消息，Agent 通过 SSE 流式返回响应。支持 LLM Agent 和 CLI Agent 两种执行路径。

#### 5.4.2 对话生命周期

```
创建对话 → 发送消息 → Agent 流式响应 → 消息持久化 → 继续对话 / 归档
              ↑___________ 重新生成 ___________↓
```

#### 5.4.3 上下文组装（ContextAssembler）

每次 Agent 调用前，系统自动组装 4 层上下文，共享 **128K token 预算**：

```
┌────────────────────────────────────────────┐
│ Layer 1: Agent system_prompt (25%)         │  固定分配
├────────────────────────────────────────────┤
│ Layer 2: Spec Rules (动态加载)              │  从 .md 文件按 conversation 加载
├────────────────────────────────────────────┤
│ Layer 3: Pinned Messages (钉选消息)         │  最多 10 条，最旧优先截断
├────────────────────────────────────────────┤
│ Layer 4: Chat History (70%)                │  最近消息优先，TokenBudget 截断
└────────────────────────────────────────────┘
```

#### 5.4.4 SSE 流式协议（7 种事件）

| # | 事件 | 方向 | 触发时机 | 关键字段 |
|---|------|------|----------|----------|
| 1 | `message_start` | S→C | Agent 开始响应 | `messageId`, `sender`, `meta.plan` |
| 2 | `token` | S→C | 逐 token 文本增量 | `messageId`, `delta`, `index` |
| 3 | `artifact` | S→C | 产物卡片生成 | `messageId`, `artifact` |
| 4 | `agent_status` | S→C | Agent 状态变更 | `messageId`, `agent`, `status`, `progress` |
| 5 | `thinking` | S→C | 思维链步骤 | `messageId`, `phase`, `text` |
| 6 | `message_end` | S→C | 消息完成 | `messageId`, `finishReason`, `usage` |
| 7 | `error` | S→C | 出错 | `code`, `message`, `retryable` |

**协议设计原则**：
- 事件间独立，前端按 `messageId` 路由到不同气泡
- `message_end` 在消息持久化完成后才发送（防止"显示后消失"）
- 流结束必须为所有已开始的 invocation 补发 `message_end`（防止加载指示器卡住）

#### 5.4.5 CLI Agent 执行路径

```
用户消息 → CliAdapter.stream()
         → 启动 claude/codex 子进程（--include-partial-messages）
         → 逐行 parse JSON 事件 → SSE token/thinking/artifact 事件
         → 消息持久化 + artifact 检测（从文本 + function_response 双通道）
         → message_end
```

---

### 5.5 群聊编排

#### 5.5.1 功能概述

群聊是 AgentHub 的核心差异化能力。用户在 IM 群聊中 @ 多个 Agent，系统自动完成**任务规划 → 计划审批 → 并行执行 → 结果汇总**全流程。

#### 5.5.2 编排管线

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐
│ 用户消息  │ → │ Planner  │ → │ 计划审批  │ → │  执行引擎    │ → │ 结果汇总  │
│ @Agent   │    │ (LLM拆解) │   │ (审视/修改)│   │ (Coord/DAG) │    │ (Merge)  │
└──────────┘    └──────────┘    └──────────┘    └──────────────┘    └──────────┘
                     ↓               ↓                ↓                  ↓
              plan_draft SSE    refine_plan     agent_status × N    orchestrator
                               confirm_plan    token × N (并行)     _summary SSE
```

#### 5.5.3 两种执行模式

| 模式 | 文件 | 适用场景 | 调度方式 |
|------|------|----------|----------|
| **Coordinator** | `coordinator_builder.py` | 动态任务分配 | 协调者 LLM 实时判断下一步分派给谁 |
| **DAG Workflow** | `workflow_builder.py` | 静态依赖图 | 预定义 Graph + edges，按拓扑序执行 |

**执行保障**：
- 确定性消息 ID：`(invocation_id, author)` 组合确保多 Agent 并行输出正确分流
- agent_name_map：解决 ADK 内部名与注册名不一致问题
- DAG 事件过滤：自动跳过 Planner/JoinNode 等非 Agent 节点事件

#### 5.5.4 群聊 UI 组件

| 组件 | 功能 |
|------|------|
| `OrchestratorPlan` | 展示 Planner 生成的任务计划卡片，支持 approve/refine |
| `DagGraph` | DAG 依赖图可视化（SVG/Canvas 渲染） |
| `AgentProgressBar` | 各 Agent 执行进度条 |
| `ReActPanel` | Thought → Action → Observation 思维链面板 |
| `OrchestratorSummary` | 最终汇总摘要卡片 |
| `ConflictResolver` | 多 Agent 冲突文件并排对比，接受/拒绝 |

#### 5.5.5 Planner 触发机制

- **自动触发**：群聊对话中 @ 提及 ≥ 2 个 Agent 时，系统自动分配 Planner
- **UX 简化**：无需用户手动选择 Planner Agent，降低群聊使用门槛
- **分配策略**：Planner 根据用户需求和 Agent 的 `capabilities` 自动匹配

---

### 5.6 产物卡片系统

#### 5.6.1 功能概述

Agent 输出不仅仅是大段文本——系统自动检测和提取 **8 种产物卡片**，以内联富媒体形式渲染在消息气泡中。卡片支持编辑回写、版本管理、全屏预览等高级交互。

#### 5.6.2 产物检测管道

```
Agent 输出内容
    │
    ├─→ 文本检测（artifact_detector.py）
    │   ├── <artifact type="code" ...> XML 标签解析
    │   ├── ```code fence 自动识别
    │   └── URL 链接自动识别
    │
    └─→ 工具响应检测（extract_download_artifacts_from_tool_response）
        ├── function_response.inline_data → FileCard/DocumentCard
        └── function_response.executable_code → CodeCard
                │
                ↓
        去重合并（_mergeKey = md5(content)）→ 持久化到 DB + MinIO
                │
                ↓
        SSE artifact 事件 → 前端 CardRenderer → 对应卡片组件
```

#### 5.6.3 8 种产物卡片

| 卡片 | artifact_type | 渲染方式 | 高级交互 |
|------|---------------|----------|----------|
| **CodeCard** | `code` | Monaco Editor / Shiki 语法高亮 + 行号 | ✏️ 编辑→版本链回写后端；划选片段→「引用此片段修改」选区改写 |
| **DiffCard** | `diff` | 并排对比（SideBySideDiffViewer）+ 行级高亮 | 📥 「应用到源文件」一键合并到源代码卡；「另存为文件」下载 |
| **FileCard** | `file` | 文件名 + 大小 + 下载按钮 | ⬇️ 直接下载 / MinIO 直链 |
| **PreviewCard** | `webpage` | sandbox iframe 内嵌 | 🔗 新标签页打开；允许嵌入域名白名单（Google Docs/Office/Notion/Figma/YouTube） |
| **LinkPreviewCard** | `link` | OG 卡片（标题+描述+缩略图） | 🔗 新标签页打开（不遵循 iframe 的链接） |
| **DocumentCard** | `document` | PDF iframe 内联预览 | 📄 PPTX→PDF 自动转换（Gotenberg）；支持 PDF/DOC/DOCX/XLS/XLSX/PPT/PPTX/HTML/Markdown |
| **DeployStatusCard** | `deploy_status` | 状态图标 + 进度 + 预览链接 | 🔄 自动触发部署 + 状态轮询；🚀 一键打开预览 |
| **ConflictResolver** | `conflict` | 并排对比多版本 | ✅ 接受/拒绝单个版本 |

#### 5.6.4 卡片交互闭环

##### 代码编辑回写链

```
CodeCard 只读视图 → 点击编辑 → Monaco Editor
    → 修改代码 → 点击保存
    → PATCH /messages/artifacts/{id}（追加新版本，version+1）
    → invalidateQueries(["messages"]) 刷新
    → 页面显示最新版本
```

- **版本去重**：`list_messages` 按 `(message_id, _mergeKey)` 折叠，只取最高 version
- **fallback 降级**：前端文本兜底解析的卡（id 以 `fallback-` 开头）保存降级为本地下载

##### 选区改写链

```
CodeCard 选中代码片段 → 浮出「引用此片段修改」按钮
    → 写入 pendingQuote.codeRange
    → ChatInput.handleSend 拼接 [选区修改] prompt
    → 后端 inject_artifact_reminder 追加 diff 约束指令
    → Agent 返回 <artifact type="diff">
    → DiffCard 渲染 + 「应用到源文件」按钮
    → diffApply.ts 启发式匹配源卡（内容匹配 > 文件名匹配）
    → PATCH artifact 追加新版本
```

##### Diff 合并回写链

```
DiffCard「应用到源文件」
    → findApplyTarget: 从 ["messages", convId] 缓存收集所有代码卡
    → 内容启发式匹配（精确子串 + 空白容忍逐行匹配兜底）
    → applySnippet: splice 新片段到源卡全文
    → PATCH /messages/artifacts/{id} 追加新版本
```

#### 5.6.5 产物格式指令注入（Artifact Format）

后端 `artifact_format.py` 在 Agent 系统提示中注入产物格式要求：
- 代码：`<artifact type="code" language="python" title="app.py">...`
- Diff：`<artifact type="diff" file="app.py">...`
- 选区修改哨兵：检测 `[选区修改]` 前缀 → 追加 diff 定向约束指令
- 文档：`<artifact type="document" mimeType="application/pdf">...`

---

### 5.7 部署功能

#### 5.7.1 功能概述

Agent 生成代码后，可自动触发部署流程，将代码产物转换为可访问的在线预览。

#### 5.7.2 部署流程

```
Agent 产出代码
    ↓
deploy_command 解析部署指令（从 Agent 输出中提取）
    ↓
deployment_source 收集源码文件
    ↓
静态站点构建 / 容器化部署
    ↓
Deployment 记录写入 DB（status: building → running）
    ↓
前端 DeployStatusCard 轮询状态（GET /deployments/{id}/status）
    ↓
部署完成 → 显示预览 URL
```

#### 5.7.3 部署状态机

```
ready → building → running → stopped
                    ↓
                  failed (可重试)
```

#### 5.7.4 DeployStatusCard 交互

| 属性 | 说明 |
|------|------|
| `status` | ready / building / running / stopped / failed |
| `port` | 容器/静态服务端口 |
| `deploymentId` | 用于状态轮询 |
| `runtimeMeta` | 运行时元数据（框架类型、构建日志等） |
| 自动触发 | 卡片渲染时若 status=ready，自动 POST 触发部署 |
| 轮询刷新 | status 为 building/running 时每 3s 轮询 |

---

### 5.8 消息管理

#### 5.8.1 功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 消息列表 | ✅ 已完成 | 游标分页，ORDER BY created_at DESC |
| 消息发送 | ✅ 已完成 | 文本消息 + @提及解析 |
| 消息重新生成 | ✅ 已完成 | 删除旧消息 + 重新流式生成 |
| 消息钉选 | ✅ 已完成 | 支持用户消息和 Agent 消息；PinManager 弹窗列表 |
| 消息取消钉选 | ✅ 已完成 | 全入口（右键菜单 + 悬浮按钮 + PinManager）query 失效 |
| 消息复制 | ✅ 已完成 | 复制纯文本（剥离 artifact 标签） |
| 消息引用 | ✅ 已完成 | 整条引用 + 选区引用两种模式 |
| 对话软删除 | ✅ 已完成 | is_deleted 标记，可恢复 |
| 消息编辑 | ✅ 已完成 | Artifact 内容编辑 + 版本链回写 |
| 消息操作菜单 | ✅ 已完成 | 右键菜单（复制/引用/钉选/重新生成） |

#### 5.8.2 Pin 状态一致性

- **单一数据源**：所有视图（角标/左边框/列表计数）统一绑 store 派生的 `isPinnedByStore`
- **全入口同步**：pin/unpin 操作同时在所有入口 `invalidateQueries(["pins", "messages"])`

---

### 5.9 设置与个性化

#### 5.9.1 功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 主题切换 | ✅ 已完成 | 亮色 / 暗色 / 跟随系统（`prefers-color-scheme` 媒体查询） |
| 背景色自定义 | ✅ 已完成 | 7 种预设背景色 |
| Token 用量统计 | ✅ 已完成 | 总量 + 各模型分布 + Recharts 图表 |
| 日/周/月用量趋势 | ✅ 已完成 | TokenCharts 组件 |
| API Key 管理 | ✅ 已完成 | 每个 Agent 独立配置 |

#### 5.9.2 主题系统

- Semi Design CSS 变量体系，双色板（`lightColors` / `darkColors`）
- `ThemeSync` 组件监听 `useUIStore.theme`，动态注入 CSS 变量
- 亮色模式支持自定义背景色（`--color-bg-app`）
- 暗色模式强制深色背景，忽略自定义背景色

---

## 6. 用户体验设计

### 6.1 布局系统

```
┌──────────┬───────────────┬──────────────────────────┐
│          │               │                          │
│  Icon    │  Conversation │      Chat Area           │
│  Sidebar │  List         │  ┌─────────────────────┐ │
│  (64px)  │  (280px)      │  │ MessageList         │ │
│          │  • 搜索       │  │ • 消息气泡          │ │
│  🏠 首页  │  • 列表       │  │ • 产物卡片          │ │
│  💬 聊天  │  • 新建       │  │ • 思维链            │ │
│  🤖 Agent │               │  ├─────────────────────┤ │
│  ⚙️ 设置  │               │  │ ChatInput           │ │
│          │               │  │ • @提及             │ │
│          │               │  │ • 文件上传          │ │
│          │               │  │ • 发送按钮          │ │
│          │               │  └─────────────────────┘ │
│          │               │                          │
└──────────┴───────────────┴──────────────────────────┘
```

- **三栏布局**：IconSidebar (64px) + ConversationList (280px, 可拖拽调整) + ChatArea (flex: 1)
- **响应式调整**：侧栏宽度通过拖拽 handle 自由调整
- **过渡动画**：Framer Motion AnimatePresence 路由切换 150ms 淡入淡出

### 6.2 交互规范

| 交互 | 实现 |
|------|------|
| **消息发送** | Enter 发送，Shift+Enter 换行；空消息禁用发送 |
| **@ 提及** | `@` 触发 Agent 下拉搜索，选择后插入蓝色标签 |
| **流式渲染** | 打字机效果逐 token 追加；MarkdownBubble 实时解析渲染 |
| **自动滚动** | 新消息到达自动滚到底部；用户手动上滚时停止自动滚动 |
| **右键菜单** | 消息气泡右键 → 复制/引用/钉选/重新生成 |
| **悬浮操作** | 消息左侧悬浮 Pin 按钮 + 更多操作菜单 |
| **代码选区** | CodeCard 只读视图 mouseup 捕获选区 → 浮出操作按钮 |
| **Toast 通知** | Sonner 库，顶部居中，richColors |
| **空状态** | 各列表有空状态插图和引导文案 |

### 6.3 设计原则

1. **即时反馈**：所有操作有 loading/spinner/骨架屏
2. **容错降级**：网络异常有 Toast 提示；API 失败有重试按钮
3. **数据一致**：同一状态多视图共享数据源（Zustand store 单一真相源）
4. **渐进呈现**：思维链默认折叠；DAG 图可缩放平移
5. **内容优先**：IM 式时间线布局，Agent 输出为第一视觉焦点

---

## 7. 数据模型

### 7.1 ER 图（核心实体）

```
┌──────────┐       ┌────────────────┐       ┌──────────┐
│   User   │1────N│  Conversation  │1────N│  Message │
└──────────┘       └────────────────┘       └──────────┘
     │                  │    │                   │
     │                  │    │ N:1               │ 1:N
     │             N:M  │    └──────────┐        │
     │  ┌────────────────┘              │        │
     │  │                               │        │
     ▼  ▼                               ▼        ▼
┌──────────────────┐          ┌──────────────┐  ┌──────────┐
│ Conversation     │          │   Project    │  │ Artifact │
│ Participant      │          └──────────────┘  └──────────┘
└──────────────────┘                                 │
                                                     │ 1:N (版本链)
┌──────────┐       ┌────────────────┐               ▼
│  Agent   │1────N│OrchestratorTask│         ┌──────────┐
└──────────┘       └────────────────┘         │ Artifact │
     │                  │ 1:N                 │ (version)│
     │                  ▼                     └──────────┘
     │           ┌──────────────────┐
     │           │OrchestratorSubtask│
     │           └──────────────────┘
     │
     ├───── N:M ────┐
     │              │
     ▼              ▼
┌──────────┐  ┌──────────────┐
│ Message  │  │ MessagePin   │
│ Mention  │  └──────────────┘
└──────────┘
```

### 7.2 核心表结构

#### users
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| username | String(50) | 用户名 |
| email | String(200) | 邮箱 |
| hashed_password | String(200) | bcrypt 哈希 |
| avatar_url | String(500) | 头像 |
| is_active | Boolean | 激活状态 |

#### agents
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | String(100) | 显示名称 |
| provider | String(50) | Provider 标识 |
| model | String(100) | 模型名 |
| system_prompt | Text | 系统提示词 |
| capabilities | JSONB | 能力标签数组 |
| api_key | String(500) | API Key |
| base_url | String(500) | API 端点 |
| tool_config | JSONB | 工具配置 |
| is_builtin | Boolean | 是否内置 |
| is_active | Boolean | 是否启用 |
| created_by | UUID FK→users | 创建者 |

#### conversations
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| title | String(200) | 对话标题 |
| type | String(20) | `direct` / `group` |
| purpose | String(30) | `normal` / `orchestrator` |
| owner_id | UUID FK→users | 所有者 |
| project_id | UUID FK→projects | 归属项目 |
| is_archived | Boolean | 归档 |
| is_pinned | Boolean | 钉选 |
| is_deleted | Boolean | 软删除 |
| last_active_at | DateTime | 最后活跃时间 |

#### messages
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| conversation_id | UUID FK | 所属对话 |
| sender_type | String(20) | `user` / `agent` / `system` |
| sender_id | UUID | 发送者 ID（Agent 或 User） |
| parent_message_id | UUID FK | 父消息（重新生成时） |
| content_type | String(20) | `text` / `markdown` |
| content | Text | 消息正文 |
| status | String(20) | `pending` / `streaming` / `done` / `error` |
| meta | JSONB | 元数据（usage/plan 等） |

#### artifacts
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| conversation_id | UUID FK | 所属对话 |
| message_id | UUID FK | 所属消息 |
| artifact_type | String(30) | 卡片类型 |
| title | String(200) | 标题 |
| content | JSONB | 卡片内容 |
| storage_key | String(500) | MinIO 存储 key |
| mime_type | String(100) | MIME 类型 |
| version | Integer | 版本号（版本链） |
| created_at | DateTime | 创建时间 |

#### deployments
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| conversation_id | UUID | 所属对话 |
| user_id | UUID | 触发用户 |
| trigger_message_id | UUID | 触发消息 |
| name | String(255) | 部署名称 |
| target | String(30) | `preview` / `production` |
| port | Integer | 服务端口（unique） |
| directory | String(512) | 部署目录 |
| url | String(1000) | 预览 URL |
| source_files | JSONB | 源文件列表 |
| runtime_meta | JSONB | 运行时元数据 |
| status | String(30) | `ready`→`building`→`running`→`stopped`/`failed` |
| process_pid | Integer | 进程 PID |

---

## 8. API 设计规范

### 8.1 路由总览

| 前缀 | 标签 | 核心端点 |
|------|------|----------|
| `/api/v1/health` | health | `GET /` |
| `/api/v1/auth` | auth | `POST /register`, `POST /login`, `POST /refresh`, `GET /me` |
| `/api/v1/agents` | agents | CRUD + `POST /{id}/verify` |
| `/api/v1/conversations` | conversations | CRUD + `POST /{id}/stream` (SSE) + `POST /{id}/pin`, `DELETE /{id}/pin` |
| `/api/v1/conversations/{cid}/messages` | messages | `GET /` (游标分页) + `POST /` (含 prompt) + `POST /{mid}/regenerate` |
| `/api/v1/messages/artifacts/{aid}` | messages | `PATCH /` (编辑回写) |
| `/api/v1/orchestrator` | orchestrator | `POST /plan`, `POST /refine`, `POST /confirm` |
| `/api/v1/projects` | projects | CRUD |
| `/api/v1/files` | files | `POST /upload`, `GET /download/{key}` |
| `/api/v1/deployments` | deployments | CRUD + `GET /{id}/status` |

### 8.2 统一响应格式

```json
{
  "code": 200,
  "data": { ... },
  "message": "success"
}
```

- 成功：`code: 200`, `data` 为业务数据
- 客户端错误：`code: 4xx`, `data: null`, `message` 描述错误
- 服务端错误：`code: 5xx`, `data: null`, `message` 描述错误

### 8.3 统一分页格式

```json
{
  "list": [ ... ],
  "total": 150,
  "page": 1,
  "pageSize": 20
}
```

### 8.4 命名约定

| 层 | 风格 | 示例 |
|----|------|------|
| URL 路径 | kebab-case | `/api/v1/conversations/{conv_id}/messages` |
| 查询参数 | camelCase | `?plannerAgentId=xxx&pageSize=20` |
| JSON 字段 | camelCase | `{ "senderType": "user", "agentIds": [...] }` |
| Python 字段 | snake_case | `sender_type`, `agent_ids`（Pydantic 自动转 camelCase） |
| DB 列 | snake_case | `sender_type`, `created_at` |

---

## 9. 技术架构

### 9.1 后端架构

```
backend/app/
├── api/v1/              # 路由层（薄层，参数提取+分发）
│   ├── health.py        # 健康检查
│   ├── auth.py          # 认证端点
│   ├── agents.py        # Agent CRUD
│   ├── conversations.py # 对话 CRUD + SSE 流式
│   ├── messages.py      # 消息 CRUD + artifact 编辑
│   ├── orchestrator.py  # 群聊编排
│   ├── projects.py      # 项目管理
│   ├── files.py         # 文件上传
│   └── deployments.py   # 部署管理
│
├── core/                # 基础设施
│   ├── config.py        # Settings (pydantic-settings)
│   ├── database.py      # AsyncEngine + session factory
│   ├── exceptions.py    # AppException 体系 + 4 全局 handler
│   ├── middleware.py     # ResponseWrapperMiddleware
│   ├── seed.py          # 内置 Agent 种子数据
│   └── schema_compat.py # Schema 向后兼容
│
├── models/              # SQLAlchemy ORM (15 表)
│   ├── base.py          # UUIDMixin + TimestampMixin
│   ├── user.py, agent.py, conversation.py, message.py
│   ├── artifact.py, deployment.py, project.py
│   ├── orchestrator_task.py, orchestrator_subtask.py
│   ├── conversation_participant.py, message_mention.py
│   ├── message_pin.py, verification_code.py
│   └── __init__.py      # 所有模型集中导出
│
├── schemas/             # Pydantic Schema（请求/响应）
│
└── services/            # 业务逻辑
    ├── adapters/        # Agent 适配器层
    │   ├── base.py          # AgentAdapter ABC + AdapterRegistry
    │   ├── anthropic_adapter.py  # Anthropic LLM
    │   ├── litellm_adapter.py    # LiteLLM (OpenAI/DeepSeek)
    │   ├── cli_adapter.py        # Claude Code / Codex CLI
    │   └── adk_to_sse.py         # ADK Event → SSE 7 事件翻译
    │
    ├── adk/             # ADK 引擎集成
    │   ├── runner.py            # 单聊流式封装
    │   ├── planner.py           # LLM 任务拆解
    │   ├── coordinator_builder.py   # 动态协调者
    │   ├── workflow_builder.py      # 静态 DAG
    │   ├── execution_tracer.py      # 执行追踪 + 可视化
    │   ├── stream_sequentializer.py # 群聊按序输出
    │   ├── merge_aggregator.py      # 多 Agent 汇总
    │   ├── cli_runner.py            # CLI 子进程运行
    │   ├── cli_tools.py             # 5 个内置 CLI 工具
    │   └── tool_loader.py           # JSONB→ADK 工具转换
    │
    ├── agent_builder.py        # Agent 构建统一入口
    ├── context_assembler.py    # 4 层 TokenBudget 上下文
    ├── artifact_detector.py    # 产物检测（文本+工具响应双通道）
    ├── artifact_format.py      # 产物格式指令注入
    ├── artifact.py             # Artifact 版本管理 + MinIO
    ├── pin_spec_injector.py    # 钉选消息 + Spec 规则注入
    ├── capability_registry.py  # 能力标签匹配
    ├── deployment.py           # 部署服务
    ├── deployment_command.py   # 部署命令解析
    ├── deployment_source.py    # 源码收集
    ├── converter.py            # PPTX→PDF (Gotenberg)
    ├── preview_server.py       # 静态预览挂载
    ├── og_fetcher.py           # OG 元数据抓取
    └── storage.py              # MinIO 文件存储
```

### 9.2 前端架构

```
agenthub-web/src/
├── App.tsx                # 入口 + 路由 + QueryClientProvider + 主题同步
├── components/
│   ├── layout/            # AppLayout, IconSidebar, ConversationList
│   ├── chat/              # ChatArea, MessageList, ChatInput, MessageBubble
│   ├── cards/             # 8 种产物卡片 + CardRenderer + 子组件
│   │   ├── CardRenderer.tsx       # 卡片分发器
│   │   ├── CodeCard.tsx           # 代码卡（编辑/选区改写）
│   │   ├── DiffCard.tsx           # Diff 卡（并排对比/应用到源文件）
│   │   ├── FileCard.tsx           # 文件卡
│   │   ├── PreviewCard.tsx        # 网页内嵌预览
│   │   ├── LinkPreviewCard.tsx    # OG 链接预览
│   │   ├── DocumentCard.tsx       # 文档预览（PDF/PPTX）
│   │   ├── DeployStatusCard.tsx   # 部署状态
│   │   ├── ConflictResolver.tsx   # 冲突解决
│   │   ├── SideBySideDiffViewer.tsx
│   │   ├── VersionSelector.tsx    # 版本切换
│   │   └── FullscreenModal.tsx    # 全屏预览
│   ├── orchestrator/      # OrchestratorPlan, DagGraph, AgentProgressBar, ReActPanel
│   ├── agent/             # AgentManageModal, CreateAgentModal, AgentDetailPopover
│   ├── settings/          # SettingsPage, TokenUsagePanel, TokenCharts
│   ├── auth/              # LoginPage
│   ├── project/           # ProjectSwitcher, ProjectCreateModal
│   ├── editor/            # MonacoCodeEditor
│   └── ui/                # ThinkingBlock, PinManager, PinnedMessages, MessageActions
├── stores/                # 6 个 Zustand Store
│   ├── chatStore.ts       # 消息/流式/引用状态
│   ├── uiStore.ts         # 主题/背景色/侧栏宽度
│   ├── authStore.ts       # 认证状态 + fetchMe
│   ├── agentStore.ts      # Agent 列表/选择
│   ├── dashboardStore.ts  # 仪表盘数据
│   └── tokenUsageStore.ts # Token 用量
├── lib/                   # 工具模块
│   ├── api.ts             # Axios 客户端 + 拦截器
│   ├── sse.ts             # SSE 连接管理器（7 事件分发）
│   ├── queryClient.ts     # TanStack Query 单例
│   ├── diffApply.ts       # Diff → 源文件应用
│   ├── diff.ts            # Diff 生成
│   ├── artifacts.ts       # Artifact 类型工具
│   └── redactSensitiveText.ts  # 敏感信息脱敏
├── types/                 # TypeScript 类型定义
│   ├── chat.ts, agent.ts, api.ts, project.ts
├── mocks/                 # MSW Mock（handlers + SSE Mock + 种子数据）
├── e2e/                   # Playwright E2E (6 spec)
└── __tests__/             # Vitest 单元测试 (19 个)
```

### 9.3 状态管理分层

| 层 | 技术 | 职责 |
|----|------|------|
| **客户端状态** | Zustand (6 stores) | UI 状态、认证、Agent 选择、流式 buffer、主题偏好 |
| **服务端状态** | TanStack React Query | API 数据缓存、自动失效、乐观更新 |
| **实时流式** | SSE Manager (lib/sse.ts) | SSE 连接、事件解析、流式内容累积 |

---

## 10. 产品路线图

### 10.1 已完成（截至 2026-06-10）

- ✅ 完整的三栏布局 IM 聊天界面
- ✅ 单 Agent 流式对话（LLM + CLI 双路径）
- ✅ 多 Agent 群聊编排（Planner → Coordinator / DAG Workflow）
- ✅ 8 种产物卡片（代码/对比/文件/预览/链接/文档/部署/冲突）
- ✅ 代码卡片编辑回写（版本链）、选区改写闭环、Diff 合并到源文件
- ✅ Agent CRUD + 多 Provider 适配 + 能力标签 + 工具配置
- ✅ JWT 认证 + Token 刷新 + 路由保护
- ✅ 主题切换（亮/暗/系统）+ 背景色自定义
- ✅ 消息钉选管理 + 右键菜单 + 悬浮操作
- ✅ 部署功能（静态站点 + 容器部署 + 状态轮询）
- ✅ PPTX→PDF 自动转换 + 文档内联预览
- ✅ Token 用量统计与图表
- ✅ DAG 可视化 + Agent 进度 + ReAct 面板
- ✅ 思维链分步展示

### 10.2 下一阶段规划

| 方向 | 计划 | 说明 |
|------|------|------|
| **安全增强** | API Key 加密存储 | Agent 凭据加密脱敏，提升安全性 |
| **性能优化** | CLI 会话复用 | 编排模式下多 subtask 共享 CLI 会话，大幅提升执行效率 |
| **编排增强** | Coordinator 分配优化 | 智能调度多 Agent 并行执行，减少等待时间 |
| **部署扩展** | 错误恢复 + 历史管理 | 完善部署生命周期管理，支持部署历史回溯 |
| **规则管理** | Spec Manager DB 版 | 按 conversation 存储和解析项目规则 |
| **产品体验** | 全屏预览 + 消息编辑 | 补全卡片全屏预览入口，完善消息操作能力 |

### 10.3 远期展望

| 方向 | 计划 | 说明 |
|------|------|------|
| **实时通信** | WebSocket 双向通道 | 支持用户中途干预 Agent 执行 |
| **交互增强** | Agent 排序拖拽 + 虚拟滚动 | 群聊执行顺序可视化调整，长会话性能优化 |
| **国际化** | i18n 多语言支持 | 中英文完整覆盖 |
| **多端适配** | 移动端响应式布局 | 手机/平板端体验优化 |
| **可观测性** | OpenTelemetry + APM | 分布式追踪与性能监控 |
| **异步任务** | Celery 后台任务 | 长时间部署、大文件转换异步化 |
| **访问无障碍** | WCAG 合规 | 国际标准无障碍访问 |

---

## 附录

### A. 关键术语表

| 术语 | 说明 |
|------|------|
| **ADK** | Google Agent Development Kit，多 Agent 编排引擎 |
| **SSE** | Server-Sent Events，服务端推送流式数据到客户端 |
| **Artifact** | Agent 产出的富媒体产物（代码/文档/部署等），以卡片形式渲染 |
| **Adapter** | Provider 适配器，统一不同 LLM/CLI 的调用接口 |
| **Planner** | 任务规划 Agent，将用户需求拆解为可执行的子任务 |
| **Coordinator** | 协调者 Agent，动态分派子任务给执行 Agent |
| **DAG Workflow** | 有向无环图工作流，按依赖关系静态编排 Agent 执行顺序 |
| **MergeAggregator** | 结果汇总 Agent，将多 Agent 输出合并为统一回复 |
| **ReAct** | Thought → Action → Observation 推理-行动循环 |
| **Pin** | 消息钉选，将重要消息固定在上下文窗口顶部 |
| **Spec Rules** | 项目规则文件（.md），动态注入到 Agent 上下文 |
| **Gotenberg** | 无头文档转换服务，用于 PPTX→PDF 等格式转换 |
| **MinIO** | S3 兼容对象存储，存储文件产物 |

### B. 环境依赖

| 服务 | 端口 | 用途 |
|------|------|------|
| PostgreSQL | 5433 | 主数据库 |
| Redis | 6379 | 缓存 |
| MinIO | 9000 | 对象存储 |
| Gotenberg | 3001 | 文档转换 |
| FastAPI | 8000 | 后端 API |
| Vite Dev | 5173 | 前端开发服务器 |
| Preview Server | 8080 | 静态预览服务 |

### C. 参考文档

- [Google ADK 官方文档](https://google.github.io/adk-docs/)
- [Semi Design 组件库](https://semi.design/)
- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [Zustand 状态管理](https://docs.pmnd.rs/zustand)
- [TanStack React Query](https://tanstack.com/query)

---

> 📝 **文档维护**：本文档随产品迭代持续更新。功能变更后请同步更新对应章节。
>
> 🤖 **生成方式**：基于 `CLAUDE.md`（项目上下文）、源代码结构、数据库模型和 API 路由综合分析生成。
