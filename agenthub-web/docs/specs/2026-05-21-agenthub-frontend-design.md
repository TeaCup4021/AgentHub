# AgentHub 前端产品设计方案

日期：2026-05-21 | 状态：已确认

---

## 1. 项目概述

AgentHub 是一个以 IM 聊天为核心交互范式的多 Agent 协作平台。用户像使用飞书/微信一样，通过对话与不同 AI Agent 交互。核心差异化在于群聊模式下，Orchestrator 自动拆解任务、调度多 Agent 并行执行、聚合结果。

### 技术栈

| 层   | 选型                              |
| ---- | --------------------------------- |
| 框架 | React 19 + TypeScript + Vite      |
| 样式 | TailwindCSS                       |
| 状态 | Zustand（UI 状态）+ React Query（服务端状态） |
| 路由 | react-router-dom v7               |
| 流式 | SSE (Server-Sent Events)          |

### 后端（合作方提供）

FastAPI + PostgreSQL + Redis + Celery + MinIO，架构文档见 `AgentHub-架构设计.md`。

---

## 2. 功能范围

### P0 — 必须交付

- **单聊模式**：1v1 与指定 Agent 对话，流式输出，代码块渲染
- **群聊模式 + Orchestrator**：混合调度（自动拆解 → 展示计划 → 用户确认/调整 → 执行），多 Agent 交织消息流 + 进度条

### P1 — 尽量交付

- **产物内联预览**：代码卡片、Diff 卡片、网页 iframe 预览卡片、文件附件卡片
- **自建 Agent**：表单快捷创建 + 对话式创建，两种入口共存
- **多平台 Agent 适配**：通过后端统一代理接入 Claude Code、Codex、OpenCode

### P2 — 低优先级，有余力则做

- 一键部署：聊天中发"部署"指令 → DeployStatus 卡片（构建中/已部署/失败）→ 预览 URL
- Diff 版本历史：代码产物的版本对比和回溯
- 对话式局部修改：选中代码 → 在聊天中描述修改 → Agent 定点改动
- PPT 预览卡片：产物预览支持 PPT 类型渲染
- 多端支持：桌面端 + 移动端（Web 端已覆盖）

---

## 3. 核心用户流程

### 3.1 单聊

```
新建/选择对话 → 输入消息 → Agent 流式回复
→ 消息气泡内含代码/Diff/预览卡片 → 可复制/展开/应用
```

### 3.2 群聊（混合模式）

```
新建群聊（选多 Agent）→ 描述任务
→ Orchestrator 展示拆解计划（可手动调整 @指派）
→ 用户确认 → Agent 并行/串行执行
→ 顶部进度条 + 各 Agent 交织消息流
→ Orchestrator 聚合汇总
```

### 3.3 创建 Agent

- **方式一**：点击 Sidebar 的 🤖 按钮 → 表单模态框（名称/头像/System Prompt/能力标签/工具集）
- **方式二**：新建对话 → 描述需求 → Agent 工厂对话式生成配置 → 确认创建

---

## 4. 组件架构

```
App
├── AppLayout
│   ├── Sidebar
│   │   ├── SidebarHeader       (Logo + 收起)
│   │   ├── SearchInput         (搜索对话)
│   │   ├── ConversationList
│   │   │   └── ConversationItem[]  (标题/最后消息/时间/群聊标签/置顶)
│   │   ├── CreateAgentButton   (🤖 快捷入口)
│   │   └── CreateConversationDialog
│   │
│   └── ChatArea
│       ├── ChatHeader          (标题 + 参与Agent标签)
│       ├── AgentProgressBar    (群聊：各Agent执行状态)
│       ├── MessageList         (虚拟列表)
│       │   └── MessageBubble[]
│       │       ├── TextBubble
│       │       ├── CodeCard
│       │       ├── DiffCard
│       │       ├── PreviewCard
│       │       ├── FileCard
│       │       └── OrchestratorPlan
│       └── ChatInput
│           └── MentionInput    (@提及自动补全)
│
├── CreateAgentModal             (表单式创建)
└── PreviewFullscreen            (产物全屏预览)
```

### 消息卡片 — 可插拔渲染器

```typescript
// 按 artifact_type 路由到对应组件，新增类型只需加一行
const cardRenderers: Record<string, React.FC<CardProps>> = {
  code: CodeCard,           // P0
  diff: DiffCard,           // P1
  preview: PreviewCard,     // P1 (web/ppt)
  file: FileCard,           // P1
  deploy_status: DeployStatusCard,  // P2
};
```

---

## 5. 数据流

```
后端 REST API  ←→  React Query    (会话列表、消息历史、Agent 列表)
后端 SSE       ←→  SSE Client     (流式：token、artifact、agent_status)
前端 UI 状态   ←→  Zustand        (activeId、searchQuery、isStreaming)
```

- **React Query** 管理所有 REST 数据的缓存与失效
- **Zustand** 仅存 UI 状态和流式过程中的临时状态
- **SSE** 按活跃会话管理连接生命周期，切换会话时断开旧连接、建立新连接

---

## 6. SSE 流式协议

对接后端定义的 6 种 SSE 事件（详见 `AgentHub-架构设计.md` 第 9 节）：

| 事件           | 触发时机          | 前端行为                              |
| -------------- | ----------------- | ------------------------------------- |
| `message_start` | Agent 开始生成    | 创建空白消息气泡（status: streaming） |
| `token`        | 逐 token 输出     | 增量追加文本 delta 到当前 text block  |
| `artifact`     | 产出代码/Diff等   | 在当前位置插入对应卡片组件            |
| `agent_status` | Agent 状态变更    | 更新 AgentProgressBar（仅群聊）       |
| `message_end`  | 消息生成完成      | status → done，冻结 content 数组      |
| `error`        | 执行异常          | 显示错误提示，标记重试/降级状态       |

### 单条消息生命周期

```
message_start → token→...→artifact→token→...→message_end
     │                                               │
  streaming 闪烁光标                              done 冻结
```

### 连接管理

- URL: `GET /api/v1/conversations/{id}/stream`
- 切换会话: 断开旧 SSE → 建立新 SSE
- 断线重连: 指数退避（1s / 2s / 4s），最多 3 次
- 清理: 组件卸载时 AbortController.abort()

---

## 7. 前后端数据映射

后端消息模型（`content_type: text/markdown` + 独立 `artifacts` 表）与前端 `MessageContent[]` 数组之间的转换：

- **历史消息加载**：后端在消息列表响应中附带关联的 `artifacts[]`，前端组装为 `MessageContent[]`
- **流式过程**：前端实时从 SSE 事件组装 content 数组，无需额外查 artifacts 表
- **消息完成**：前端 content 数组与后端 artifacts 记录一一对应

## 8. 群聊 Orchestrator 交互

```
用户发送任务描述 (mode: auto_orchestrate)
    ↓
Orchestrator 计划消息 (OrchestratorPlan 卡片渲染)
    │  展示子任务列表 + 指派Agent + 依赖关系
    ↓
用户确认 / 手动调整 @指派 ← 混合模式核心：可覆盖调度决策
    ↓
并行执行 (AgentProgressBar 实时状态)
    ├── Agent A streaming...
    ├── Agent B streaming...
    └── Agent C queued...
    ↓
Orchestrator 聚合汇总消息
```

### AgentProgressBar

紧凑横向进度条，基于 `agent_status` SSE 事件更新：
- 每个 Agent 一个状态块：queued / running / done / failed
- running 状态显示进度百分比（来自 SSE 的 progress 字段）
- 全部 done 时自动收起

---

## 9. 已确认的决策记录

| # | 决策点               | 选择             | 理由                                     |
|---| -------------------- | ---------------- | ---------------------------------------- |
| 1 | Orchestrator 模式    | C - 混合模式     | 自动拆解 + 用户确认，既省心又可干预      |
| 2 | 产物卡片范围         | B - 完整方案     | 有后端支持，Demo 展示效果好              |
| 3 | 群聊 UI 呈现         | C - 混合流       | 交织消息 + 进度条，兼顾临场感和全局视角  |
| 4 | 自建 Agent 流程      | C - 两者兼有     | 表单快捷 + 对话式特色，共用后端接口      |
| 5 | Agent 接入架构       | A - 后端统一代理 | 与后端方案一致，FastAPI 网关 + Adapter   |
| 6 | 功能范围             | P0 + P1 + P2     | P2 保留但优先级最低，有余力则做        |

---

## 10. 后续步骤

1. 用户审核本设计文档
2. 通过 `writing-plans` skill 生成前端实施计划
3. 后端对齐 API 细节（字段名、分页格式、错误码）
4. 按计划逐步实现

---

## 11. OpenAkita 前端方案借鉴

> 来源：[OpenAkita](https://github.com/openakita/openakita) — 开源多 Agent 协作框架（Tauri + React + TypeScript，Apache 2.0，1.4k Stars）。以下是其前端方案中对 AgentHub 有参考价值的部分。

### 11.1 面板式信息架构 — 从聊天框到工作台

OpenAkita 没有做成单一聊天窗口，而是把不同职责拆分到 **11 个独立面板**。这个思路对 AgentHub 的中期演进有关键参考价值：

```
OpenAkita 面板:                           AgentHub 对应/可演进方向:
┌─ 聊天助手 ─────────────────────┐        ✅ 已覆盖 (ChatArea)
├─ Agent 仪表盘 ─────────────────┤        🆕 可新增 (Phase 8 建议)
├─ LLM 端点管理 ────────────────┤        🆕 可新增 (Phase 9 建议)
├─ IM 频道设置 ──────────────────┤        🔵 暂不需要 (纯 Web 端)
├─ 技能市场 ────────────────────┤        🔵 远期考虑
├─ MCP 管理 ────────────────────┤        🔵 远期考虑
├─ 记忆面板 ────────────────────┤        🔵 远期考虑
├─ 定时任务 ────────────────────┤        🔵 远期考虑
├─ Token 统计 ──────────────────┤        🆕 可新增 (Phase 9 建议)
├─ Persona 切换 ────────────────┤        🔵 远期考虑
└─ 系统托盘 ────────────────────┘        🔵 桌面端才需要
```

**核心原则**：每个面板只做一件事，用户不需要在一个界面里消化所有信息。AgentHub 当前以 IM 聊天为核心、Sidebar 为辅助，这个架构在 P0 阶段是正确的，但需要在设计上预留面板扩展的接口。

### 11.2 ReAct 推理可视化 — Thinking 块

OpenAkita 将 Agent 的推理过程拆为"思考→行动→观察"三阶段并做了可折叠的步骤卡片。这比简单的"加载中..."体验好很多。

**对 AgentHub 的启发**：在流式消息中增加 `ThinkingBlock` 组件，将 Agent 的 intermediate reasoning 以可折叠卡片展示在消息气泡中。

```
用户消息: "帮我写一个 React 登录页面"
    ↓
Agent 回复 (消息气泡内):
┌─ 🔍 思考 (可折叠) ──────────────────────┐
│  需要创建 LoginPage.tsx、LoginForm.tsx   │
│  使用 useState 管理表单状态             │
└─────────────────────────────────────────┘
    ├── token 流式文本...
    ├── [CodeCard: LoginPage.tsx]
    └── [CodeCard: LoginForm.tsx]
```

**实现要点**：
- Thinking 内容作为 SSE `token` 事件的一个特殊块（用 `content_block_type: "thinking"` 区分）或独立 SSE 事件 `thinking`
- 默认折叠，用户可点击展开查看推理链
- 不影响主消息流的阅读体验
- 与 OrchestratorPlan 卡片互补——OrchestratorPlan 是"任务拆解"，Thinking 是"单 Agent 推理过程"

### 11.3 Agent 状态仪表盘 — 超越进度条

OpenAkita 的 Agent 仪表盘实时展示每个 Agent 的工作状态（空闲/思考中/执行中/等待/错误）、当前任务、耗时和 token 消耗。AgentHub 当前的 `AgentProgressBar` 只是紧凑横向状态条，可以演进为更丰富的面板。

**演进路径**：

| 阶段 | 组件 | 说明 |
|------|------|------|
| P0（当前） | `AgentProgressBar` | 紧凑横向状态条，5 种状态 + 百分比 |
| P1（建议） | `AgentDashboard` | 可展开面板，显示每个 Agent 的详细状态、耗时、token |
| P2（远期） | 委派树可视化 | 展示 Orchestrator → 子 Agent 的委派层级和依赖关系 |

**AgentDashboard 关键设计**：
- 侧边栏或可折叠面板，不影响聊天主区域
- 每个 Agent 一行：头像 + 名称 + 状态图标 + 当前任务摘要 + 耗时
- 支持最多 5 层委派深度的缩进展示
- 状态颜色编码：idle=灰、running=蓝脉动、success=绿、failed=红、waiting=黄

### 11.4 LLM 配置面板

OpenAkita 有专门的 LLM 端点管理 UI，支持多供应商、优先级路由和故障转移规则的可视化配置。AgentHub 如果对接多个模型（Claude/GPT/DeepSeek 等），需要一个配置面板。

**最小可行方案（P2）**：
- 设置页中的一个配置区域（非独立面板）
- API Key 管理（加密存储）
- 默认模型选择
- 简单优先级顺序（主模型 → 备用模型）

### 11.5 用量统计面板

OpenAkita 提供 12 种 trace span 类型和全链路 token 统计面板。对 AgentHub 而言，token 用量和成本追踪在 Demo 展示和实际使用中都有价值。

**最小可行方案（P2）**：
- 当前会话 token 消耗（输入/输出/总计）
- 按 Agent 分组的用量饼图
- 简单成本估算（基于模型单价）

### 11.6 Plan Mode 增强

OpenAkita 的 Plan Mode 支持检查点/回滚、循环检测和策略自动切换。AgentHub 的 `OrchestratorPlan` 目前只展示子任务列表 + 确认按钮，可以增加：

- **依赖关系可视化**：子任务间的依赖用箭头连线表示
- **回滚状态展示**：某子任务失败后，哪些步骤需要重做
- **实时步骤状态**：每个子任务卡片独立显示 queued/running/done/failed
- **自动收起已完成步骤**：全部完成后自动折叠，只保留摘要

### 11.7 务实的采纳策略

| 优先级 | 借鉴点 | 落地形式 | 对应 Phase |
|--------|--------|---------|------------|
| **P1** | ReAct 推理可视化 | `ThinkingBlock` 组件 + SSE `thinking` 事件 | Phase 7 |
| **P1** | Plan Mode 增强 | `OrchestratorPlan` 增加依赖线和步骤状态 | 融入 Phase 5 |
| **P2** | Agent 状态仪表盘 | `AgentDashboard` 可展开面板 | Phase 8 |
| **P2** | LLM 配置面板 | 设置页中的 `LLMConfigSection` | Phase 9 |
| **P2** | 用量统计面板 | `TokenUsagePanel` + SSE `usage` 数据 | Phase 9 |
| **P3** | 委派树可视化 | `DelegationTree` 组件 | 远期 |
| **P3** | 技能市场 UI | 独立面板 | 远期 |

**核心原则**：不要一上来就做 11 个面板。OpenAkita 的面板架构是 83 个版本迭代出来的。AgentHub 应先跑通 IM 聊天核心闭环（Phase 1-6），再逐步扩展面板。当前设计中的组件架构和数据流已经为面板扩展预留了接口（可插拔 CardRenderer + Zustand store 分离）。
