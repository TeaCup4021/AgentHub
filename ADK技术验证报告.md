# Google ADK 2.0 技术验证报告

**日期**: 2026-05-22  
**验证版本**: google-adk 2.0.0 (2026年4月发布)  
**结论**: ADK 2.0 **可以**作为 AgentHub 核心引擎，但需要自研 6 个关键模块（占比 33%）

---

## 1. 验证方法

```bash
pip install google-adk
python backend/verify_adk.py  # 5个Phase全覆盖验证
```

通过以下5个Phase进行验证：
1. **导入验证**: 所有ADK模块的可用性
2. **Agent拓扑构建**: 单聊/群聊/流水线/Agent-as-Tool模式
3. **Event→SSE协议转换**: ADK Event模型字段→AgentHub 6事件映射
4. **集成模式代码验证**: 核心集成代码模式
5. **能力映射矩阵**: 18项AgentHub需求逐项对比

---

## 2. ADK 2.0 核心能力总览

### 2.1 架构层次

```
ADK 2.0
├── Agents (LlmAgent, Workflow)
│   ├── Callbacks (before/after agent/model/tool)
│   ├── Planner (BuiltInPlanner, PlanReActPlanner)
│   └── Tool System (AgentTool, MCP, OpenAPI, Bash, CodeExec)
├── Runner (run_async → AsyncGenerator[Event])
├── Events (Event + EventActions)
├── Sessions (state, events, multiple backends)
├── Artifacts (InMemory, File, GCS)
├── Models (AnthropicLLM, GoogleLLM, LiteLLM → 100+)
├── Workflow (Graph, Node, Edge, JoinNode) ← ADK 2.0 新特性
└── Plugins (跨切面拦截)
```

### 2.2 废弃警告 (CRITICAL)

`ParallelAgent`、`SequentialAgent`、`LoopAgent` 在 ADK 2.0 中已被标记为 **deprecated**，推荐使用新的 `Workflow` (Graph-based) 系统：

```python
# 旧方式 (DEPRECATED)
pipeline = SequentialAgent(sub_agents=[agent_a, agent_b])

# 新方式 (ADK 2.0)
from google.adk.workflow import Workflow, Node, Edge, START
agent_a = Node(name="generator")
agent_b = Node(name="reviewer")
workflow = Workflow(
    name="pipeline",
    edges=[Edge(from_node=START, to_node=agent_a),
           Edge(from_node=agent_a, to_node=agent_b)]
)
```

**这对 AgentHub 的影响**: Workflow Graph 天然产生 DAG 结构，更适合实现"多 Agent 协作可视化 DAG"创新点。

---

## 3. 能力映射矩阵 (18项需求)

| # | AgentHub 需求 | 覆盖度 | ADK 支持方式 |
|---|---|---|---|
| 1 | 多 Agent 编排 | **COMPLETE** | Workflow (Graph/Node/Edge) + max_concurrency |
| 2 | 单聊对话 | **COMPLETE** | LlmAgent + Runner.run_async() |
| 3 | 群聊协作 | **COMPLETE** | LlmAgent(sub_agents) + AgentTool |
| 4 | SSE 流式输出 | **COMPLETE** | AsyncGenerator[Event] 逐事件转 SSE |
| 5 | 上下文管理 | **COMPLETE** | Session.events + state_delta |
| 6 | 产物内联 | **COMPLETE** | EventActions.artifact_delta + ArtifactService |
| 7 | 任务拆解计划 | **PARTIAL** | Planner 提供基础，需自定义 plan schema |
| 8 | 计划→确认→执行 (HITL) | **CUSTOM** | state_delta 提供基础，需自建两阶段协议 |
| 9 | DAG 执行轨迹可视化 | **CUSTOM** | after_agent_callback + Workflow Graph 提取，需自建 |
| 10 | Agent 能力注册中心 | **CUSTOM** | 自建 + 注入 instruction/state |
| 11 | 失败降级与重试 | **COMPLETE** | retry_config + error callbacks |
| 12 | Spec/Skill/Rules 注入 | **CUSTOM** | global_instruction + callbacks，需自建管理 |
| 13 | 结果聚合与解释 | **CUSTOM** | 通过 Orchestrator instruction 实现 |
| 14 | 成本-质量自适应路由 | **CUSTOM** | 需自建 Router Agent |
| 15 | Claude 模型 | **COMPLETE** | AnthropicLLM (pip install anthropic) |
| 16 | OpenAI/Codex | **COMPLETE** | LiteLLM 支持 100+ 模型 |
| 17 | 代码执行沙箱 | **COMPLETE** | ContainerCodeExecutor |
| 18 | 会话持久化 | **COMPLETE** | SQLiteSessionService / DatabaseSessionService |

**统计**: ADK 直接覆盖 12/18 (67%)，需自研 6/18 (33%)

---

## 4. Event→SSE 转换验证 (全部通过)

### 4.1 字段映射全覆盖

ADK Event 模型的 13 个关键字段全部能映射到 AgentHub SSE 6 事件协议：

| ADK Event 字段 | → | SSE 事件 | 用途 |
|---|---|---|---|
| `invocation_id` | → | `message_id` | 消息唯一标识 |
| `author` | → | `sender` | 发送者信息 |
| `content.parts[].text` | → | `token.delta` | 流式增量文本 |
| `partial` | → | 流式/完成区分 | True=流式中 |
| `turn_complete` | → | `message_end` 触发 | Agent 说完 |
| `actions.transfer_to_agent` | → | `agent_status` | Agent 切换 |
| `actions.end_of_agent` | → | `message_end` | 子Agent完成 |
| `actions.artifact_delta` | → | `artifact` | 产物推送 |
| `branch` | → | `subtask_id` | 并行分支标识 |
| `usage_metadata` | → | `usage` | Token统计 |
| `error_code` | → | `error.code` | 错误码 |
| `error_message` | → | `error.message` | 错误信息 |
| `timestamp` | → | `timestamp` | 时间戳 |

### 4.2 核心转换模式

```python
async def adk_to_sse(runner, user_id, session_id, message):
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=Content(role="user", parts=[Part.from_text(text=message)]),
        run_config=RunConfig(streaming_mode=StreamingMode.SSE),
    ):
        if event.partial and event.content:
            yield sse_event("token", {"delta": event.content.parts[0].text})
        elif event.actions and event.actions.artifact_delta:
            yield sse_event("artifact", extract_artifact(event))
        elif event.turn_complete:
            yield sse_event("message_end", extract_usage(event))
        elif event.error_code:
            yield sse_event("error", {"code": event.error_code})
```

---

## 5. 需自研的 6 个关键模块

### 5.1 Orchestrator 两阶段协议 (计划→确认→执行)

**ADK提供**: `state_delta` 注入、`custom_metadata`、`RunConfig`

**自研内容**:
- `PlanGenerator`: 调用 ADK Planner 生成计划，输出标准 JSON schema
- `PlanConfirmationAPI`: `POST /api/v1/conversations/{id}/orchestrator/confirm`
- 计划消息的 artifact schema: `artifact_type: "plan"`
- 前端 OrchestratorPlan 卡片渲染

### 5.2 DAG 执行轨迹 → 可视化数据

**ADK提供**: Workflow Graph 结构、`after_agent_callback`、`Event.branch`、`NodeInfo.path`

**自研内容**:
- `ExecutionTracer`: 收集 callback 数据和 Event 信息
- `DAGBuilder`: 将执行轨迹转为 DAG JSON (nodes + edges)
- `GET /api/v1/orchestrator/tasks/{id}/dag` 端点

### 5.3 Agent 能力注册中心

**ADK提供**: Agent `description` 字段 (用于 LLM-driven routing)、`output_key`

**自研内容**:
- `CapabilityRegistry`: 管理 Agent 能力标签 (coding/docs/ui/reasoning)
- `AgentRouter`: 基于能力 + 成本 + 质量的匹配算法
- 评分学习机制 (P2)

### 5.4 Spec/Skill/Rules 管理系统

**ADK提供**: `global_instruction`、`before_agent_callback`、Plugin 系统

**自研内容**:
- `SpecManager`: CRUD 管理 Spec 文档
- `ContextInjector`: 在 callback 中从 DB 读取并注入
- Spec 版本管理

### 5.5 结果聚合与仲裁解释

**ADK提供**: Orchestrator Agent 的 LLM reasoning

**自研内容**:
- `MergeStrategy`: 优选单结果 / 融合多结果
- `ExplainableMerge`: 生成采纳理由
- 冲突检测算法

### 5.6 成本-质量自适应路由

**完全自研**:
- `RouterAgent`: 分析任务复杂度 → 选择 agent 级别
- 成本追踪: 记录每次调用的 token 消耗
- 质量评分: 基于用户反馈/task success rate

---

## 6. 架构调整建议

### 6.1 当前架构问题

当前 `AgentHub-架构设计.md` 第4.3节描述:

> "使用 ADK 内置的 Planner 代理直接处理多 Agent 调度逻辑"

需要修正为:

> "使用 ADK 2.0 **Workflow (Graph-based)** 系统处理多 Agent 调度，Planner 仅用于任务拆解"

### 6.2 推荐架构

```
[AgentHub Core Engine]
├── ADK Workflow Graph ← 多 Agent 编排 (替代废弃的 ParallelAgent)
├── ADK Planner ← 任务拆解 (BuiltInPlanner/PlanReActPlanner)
├── ADK Runner ← Event 流式生成
├── ADK SessionService ← 会话持久化 (使用 PostgreSQL backend)
│
├── [自研] OrchestratorTwoPhaseProtocol ← 计划→确认→执行
├── [自研] ExecutionTracer + DAGBuilder ← 可视化数据
├── [自研] CapabilityRegistry ← Agent 能力注册
├── [自研] SpecInjector ← Spec/Rules 注入
├── [自研] MergeAggregator ← 结果聚合
└── [自研] CostQualityRouter ← 自适应路由
```

### 6.3 20天计划调整

| 阶段 | 原计划 | 调整 | 原因 |
|---|---|---|---|
| Day 4-5 | "引入 ADK 包" | 确认 ADK 已安装 (v2.0.0) + 安装 anthropic SDK | ADK 可直接使用 |
| Day 9-10 | "ADK 内置 Multi-Agent Planning" | 改用 Workflow Graph 构建编排拓扑 | ParallelAgent 已废弃 |
| Day 11-12 | "ADK execute_plan" | 使用 Workflow Graph + max_concurrency 控制并发 | 新 API |
| Day 16 | "DAG 数据接口" | 基于 Workflow Graph edges + callback trace 生成 DAG | Graph 天然产生 DAG |

### 6.4 自研模块分配

| 模块 | 负责人建议 | 预计工时 |
|---|---|---|
| Orchestrator 两阶段协议 | 后端B | Day 9-10 |
| DAG 执行轨迹 | 后端B | Day 16 |
| Agent 能力注册中心 | 后端A | Day 14-15 |
| Spec/Skill/Rules 注入 | 后端A | Day 14-15 |
| 结果聚合 | 后端B | Day 13 |
| 自适应路由 | P2 (不排入20天) | Day 17+ |

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| ADK AnthropicLLM 功能不完整 | 中 | 中 | 备选: 通过 LiteLLM 调用 Claude |
| Workflow Graph 学习曲线 | 中 | 低 | 提供示例代码，概念接近 DAG |
| ADK 版本更新 breaking change | 低 | 高 | 锁定 google-adk==2.0.0 |
| ADK 并发限制 (Rate Limit) | 中 | 中 | max_concurrency 控制 + 降级为串行 (Plan B2) |

---

## 8. 最终结论

**ADK 2.0 是 AgentHub 核心引擎的合适选择**，理由：

1. **67% 功能直接覆盖**: 多 Agent 编排、Event 流式、会话管理、模型适配
2. **33% 自研部分清晰可控**: 每项都有明确的 ADK 扩展点作为基础
3. **Workflow Graph 更适合创新**: 天然产生 DAG 数据，支持"协作可视化"创新点
4. **模型无关**: AnthropicLLM + LiteLLM 确保 Claude/Codex/OpenCode 全支持
5. **生产级**: Google 内部使用 (Agentspace, CES)，v2.0 已 GA

**必须立即执行的行动项**:
1. `pip install anthropic openai` — 安装模型 SDK
2. 将 `verify_adk.py` 中的 Workflow (替代 ParallelAgent) 模式写入架构文档
3. Day 4-5 引入 ADK 时优先验证 AnthropicLLM + Workflow Graph 的组合
