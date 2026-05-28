# AgentHub ADK 工作流改进方案

**日期**: 2026-05-28
**当前状态**: 纯星型并行图（Star Topology）
**目标**: DAG + Coordinator 混合架构，支持任务依赖、动态协调、工作流嵌套

---

## 1. 现状诊断

### 1.1 当前架构

```
用户消息
    │
    ▼
┌─────────────────────────────┐
│ Phase 1: OrchestratorPlanner │  调用 ADK BuiltInPlanner
│   planner.py:31              │  → 生成扁平 JSON plan
│   _build_instruction()       │  → 退出，不参与执行
└─────────────┬───────────────┘
              │ OrchestratorPlan (flat list)
              ▼
┌─────────────────────────────┐
│ Phase 2: WorkflowBuilder     │  workflow_builder.py:11
│   build(plan)                │  → 所有 subtask → LlmAgent
│                              │  → Edge(START, agent_i) for all i
│   return Workflow(           │  → 纯星型并行图
│     edges=[                  │
│       START→A1, START→A2,   │
│       START→A3, START→A4    │
│     ],                       │
│     max_concurrency=2        │
│   )                          │
└─────────────────────────────┘
```

### 1.2 关键文件现状

| 文件 | 当前行为 | 问题 |
|------|---------|------|
| `schemas/orchestrator.py` | `SubTaskPlan` 只有 `subtask_id`, `agent_id`, `agent_name`, `instruction` | 无 `depends_on`，无 `mode`，无 `output_key` |
| `services/adk/planner.py` | prompt 要求输出扁平 JSON 数组 | 不要求 LLM 分析任务依赖关系 |
| `services/adk/workflow_builder.py` | 所有 Agent 挂 START 下，纯星型 | 无法表达串行、汇聚、条件分支 |
| `models/orchestrator_subtask.py` | 无 `depends_on`、`execution_order` 字段 | DB 层不支持依赖关系 |

### 1.3 核心缺陷

| # | 问题 | 影响 |
|---|------|------|
| 1 | **无任务依赖** | 「查天气 → 推荐穿搭」会被同时触发，后者拿不到数据 |
| 2 | **无执行期协调** | Planner 在 Phase 1 退出，执行中无人动态调整 |
| 3 | **无结果聚合** | 所有 Agent 跑完结束，无汇总节点 |
| 4 | **无法嵌套** | 不能表达「A 和 B 并行，结果给 C 汇总」或「循环直到通过」 |
| 5 | **无法动态扩展** | 执行期发现需要新任务，无人调度 |

---

## 2. 目标架构

### 2.1 总体设计

```
                        ┌─────────────────────────────────┐
用户消息 ──────────────►│  OrchestratorAgent (Coordinator) │
                        │  mode: chat                      │
                        │  model: claude-sonnet-4-6        │
                        │                                  │
                        │  运行期持续协调：                 │
                        │  - 理解意图，拆解任务             │
                        │  - 动态调用 sub_agents            │
                        │  - 处理中间结果，调整策略         │
                        │  - 向用户确认/澄清               │
                        │  - 聚合最终结果                   │
                        │                                  │
                        │  sub_agents: [                   │
                        │    weather_agent (single_turn),  │
                        │    code_agent (task),            │
                        │    review_workflow (nested),     │
                        │    user_custom_agent (...),      │
                        │  ]                               │
                        └──────────────┬──────────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            │                          │                          │
            ▼                          ▼                          ▼
   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
   │ weather_agent   │    │ code_agent      │    │ review_workflow │
   │ mode:single_turn│    │ mode: task      │    │ (嵌套 Workflow) │
   │ 无交互，自动返回 │    │ 可澄清，自动返回 │    │                 │
   └─────────────────┘    └─────────────────┘    │ ┌──► write_code │
                                                  │ │              │
                                                  │ ├──► review    │
                                                  │ │    (loop)    │
                                                  │ └──► test      │
                                                  └─────────────────┘
```

### 2.2 两种模式并存

根据不同场景自动选择执行模式：

| 场景 | 模式 | 机制 |
|------|------|------|
| 简单并行任务（查询天气+查航班） | **Static DAG** | Planner 生成依赖图 → WorkflowBuilder 构建 Graph |
| 复杂交互任务（写代码→审查→修改） | **Coordinator** | OrchestratorAgent 动态调度 sub_agents |
| 混合任务 | **Coordinator + Nested Graph** | Coordinator 调用内嵌 Workflow 子图 |
| 单 Agent 对话 | **现有单聊** | 不变，LlmAgent + Runner |

### 2.3 架构决策：Coordinator 为主，Static DAG 为辅

**理由**：

- AgentHub 的核心场景是「群聊协作」—— 一个主协调器调度多个子 Agent
- 这与 ADK 2.0 Collaborative Workflow 的设计高度一致
- Static DAG 适用于可预先确定的流水线，但不适用于需要中间澄清和动态调整的对话场景
- Coordinator 模式下，LLM 本身做路由决策，比硬编码图更灵活

---

## 3. 分阶段实施计划

### Phase 1: Schema 升级（1 天）

**目标**: 数据层支持依赖关系和工作流类型

#### 3.1.1 Schema 变更

```python
# schemas/orchestrator.py

class SubTaskPlan(BaseSchema):
    subtask_id: str
    agent_id: UUID
    agent_name: str
    instruction: str
    depends_on: list[str] = []           # 新增：依赖的 subtask_id 列表
    mode: str = "single_turn"            # 新增：chat | task | single_turn
    output_key: str | None = None        # 新增：输出写入 state 的 key
```

#### 3.1.2 DB Model 变更

```python
# models/orchestrator_subtask.py — 新增字段

class OrchestratorSubtask(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "orchestrator_subtasks"
    # ... 现有字段保留 ...

    depends_on: Mapped[list] = mapped_column(JSONB, nullable=True)          # 新增
    mode: Mapped[str] = mapped_column(String(20), server_default='single_turn')  # 新增
    execution_order: Mapped[int] = mapped_column(Integer, nullable=True)    # 新增
```

#### 3.1.3 数据库迁移

```sql
ALTER TABLE orchestrator_subtasks ADD COLUMN depends_on JSONB;
ALTER TABLE orchestrator_subtasks ADD COLUMN mode VARCHAR(20) DEFAULT 'single_turn';
ALTER TABLE orchestrator_subtasks ADD COLUMN execution_order INTEGER;
```

---

### Phase 2: Planner 升级（1-2 天）

**目标**: Planner 输出带依赖关系的 DAG 而非扁平列表

#### 3.2.1 升级 Planner Prompt

```python
# services/adk/planner.py — _build_instruction()

def _build_instruction(self, user_message: str, agents: List[Agent]) -> str:
    agent_list = "\n".join(
        f"- {a.name} (id={a.id}): {a.description or 'No description'}"
        for a in agents
    ) if agents else "(none)"

    return (
        "You are a task orchestrator. Analyze the user's request and break it down "
        "into subtasks with dependencies.\n\n"
        f"Available agents:\n{agent_list}\n\n"
        "Output ONLY a JSON object (no markdown, no extra text):\n"
        '{\n'
        '  "subtasks": [\n'
        '    {\n'
        '      "subtaskId": "s1",\n'
        '      "agentId": "<uuid>",\n'
        '      "agentName": "<name>",\n'
        '      "instruction": "<self-contained instruction>",\n'
        '      "dependsOn": [],\n'
        '      "mode": "single_turn",\n'
        '      "outputKey": "weather_data"\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        "Rules:\n"
        "1. Use exact agentId and agentName from the list\n"
        '2. "dependsOn" lists subtaskIds that must finish before this subtask starts\n'
        '3. If subtask B needs subtask A\'s output, add A\'s subtaskId to B\'s dependsOn\n'
        '4. Independent subtasks should have empty dependsOn (they run in parallel)\n'
        '5. "mode" choices: "single_turn" (no user interaction), "task" (can ask user)\n'
        '6. "outputKey" is the state key where this subtask stores its result\n'
        f"User request: {user_message}"
    )
```

#### 3.2.2 升级 Parse 逻辑

```python
def _parse_plan(self, raw_text, user_message, agents) -> OrchestratorPlan:
    # ... JSON 提取逻辑不变 ...
    subtasks = [
        SubTaskPlan(
            subtask_id=item.get("subtaskId", self._gen_subtask_id()),
            agent_id=UUID(item["agentId"]),
            agent_name=item["agentName"],
            instruction=item["instruction"],
            depends_on=item.get("dependsOn", []),
            mode=item.get("mode", "single_turn"),
            output_key=item.get("outputKey"),
        )
        for item in data.get("subtasks", [])
    ]
```

---

### Phase 3: WorkflowBuilder 升级（1-2 天）

**目标**: 根据 DAG 依赖关系构建正确的工作流图

#### 3.3.1 核心逻辑

```python
# services/adk/workflow_builder.py

from google.adk.agents import LlmAgent, Agent
from google.adk.workflow import Workflow, Edge, JoinNode, START

class WorkflowBuilder:

    def build(self, plan: OrchestratorPlan) -> Workflow:
        # 1. 创建所有 Agent 节点
        agent_map: dict[str, LlmAgent] = {}
        for st in plan.subtasks:
            agent = LlmAgent(
                name=f"agent_{str(st.agent_id).replace('-', '_')}",
                model=get_anthropic_llm(),
                instruction=st.instruction,
                output_key=st.output_key,
            )
            agent_map[st.subtask_id] = agent

        # 2. 分析依赖，构建边
        edges: list[Edge] = []

        # 找出所有被依赖的节点（作为下游节点出现）
        dependent_nodes: set[str] = set()
        for st in plan.subtasks:
            for dep_id in st.depends_on:
                dependent_nodes.add(dep_id)

        for st in plan.subtasks:
            if not st.depends_on:
                # 无依赖 → 从 START 开始
                edges.append(Edge(from_node=START, to_node=agent_map[st.subtask_id]))
            elif len(st.depends_on) == 1:
                # 单一依赖 → 直接边
                dep_agent = agent_map[st.depends_on[0]]
                edges.append(Edge(from_node=dep_agent, to_node=agent_map[st.subtask_id]))
            else:
                # 多依赖 → 需要 JoinNode
                join = JoinNode(name=f"join_{st.subtask_id}")
                for dep_id in st.depends_on:
                    edges.append(Edge(from_node=agent_map[dep_id], to_node=join))
                edges.append(Edge(from_node=join, to_node=agent_map[st.subtask_id]))

        # 3. 处理最终的汇聚节点（如果有多个终端节点，加 JoinNode 聚合）
        terminal_ids = [
            st.subtask_id for st in plan.subtasks
            if st.subtask_id not in dependent_nodes
        ]
        if len(terminal_ids) > 1:
            final_join = JoinNode(name="final_join")
            for tid in terminal_ids:
                edges.append(Edge(from_node=agent_map[tid], to_node=final_join))

        return Workflow(
            name="orchestrator_plan",
            edges=edges,
            max_concurrency=min(len(agent_map), 3),
        )
```

#### 3.3.2 效果示例

输入 plan：
```json
{
  "subtasks": [
    {"subtaskId": "s1", "instruction": "查询天气", "dependsOn": []},
    {"subtaskId": "s2", "instruction": "查询航班", "dependsOn": []},
    {"subtaskId": "s3", "instruction": "推荐行程", "dependsOn": ["s1", "s2"]}
  ]
}
```

生成的图：
```
    START
    /    \
   ▼      ▼
  s1     s2          ← 并行
   \     /
    ▼   ▼
   join_s3            ← JoinNode 等待两者完成
     │
     ▼
    s3                ← 依赖满足后才执行
```

---

### Phase 4: Coordinator 模式实现（2-3 天）

**目标**: 引入 Collaborative Workflow 作为主执行模式

#### 4.3.1 新增 CoordinatorBuilder

```python
# services/adk/coordinator_builder.py (新文件)

from google.adk.agents import LlmAgent, Agent
from app.models.agent import Agent as AgentModel

class CoordinatorBuilder:
    """构建以 Coordinator 为中心的协作工作流"""

    def build(
        self,
        agent_models: list[AgentModel],
        user_message: str,
    ) -> Agent:
        # 构建子 Agent 列表
        sub_agents = []
        for am in agent_models:
            sub = Agent(
                name=am.name,
                description=am.description or f"Handles {am.name} tasks",
                model=get_anthropic_llm(),
                instruction=am.system_prompt or "You are a helpful assistant.",
                mode="task",  # 默认 task 模式：可向用户澄清，自动返回
                tools=self._load_tools(am.tool_config),
            )
            sub_agents.append(sub)

        # 构建 Coordinator
        coordinator = LlmAgent(
            name="orchestrator",
            model=get_anthropic_llm(),
            instruction=self._build_coordinator_instruction(agent_models),
            description="Main orchestrator that coordinates sub-agents",
            sub_agents=sub_agents,
        )
        return coordinator

    def _build_coordinator_instruction(self, agents: list[AgentModel]) -> str:
        agent_descriptions = "\n".join(
            f"- {a.name}: {a.description or 'No description'}"
            for a in agents
        )
        return (
            "You are an intelligent orchestrator. Your job is to understand the "
            "user's request and coordinate the appropriate specialists to complete it.\n\n"
            "Guidelines:\n"
            "1. Analyze the user's intent carefully\n"
            "2. Break complex tasks into steps and execute them in the right order\n"
            "3. Use the available specialists by calling request_task_<agent_name>\n"
            "4. Wait for each specialist to complete before using their results\n"
            "5. If a specialist's output is unclear, ask the user for clarification\n"
            "6. Combine results from multiple specialists into a coherent response\n"
            "7. If you discover you need information you don't have, ask the user\n\n"
            f"Available specialists:\n{agent_descriptions}\n\n"
            "Remember: you are the conductor. Don't try to do specialists' work yourself."
        )

    def _load_tools(self, tool_config: dict | None) -> list:
        # 从 tool_config 加载工具
        # TODO: 实现工具加载逻辑
        return []
```

#### 4.3.2 修改执行入口

```python
# api/v1/conversations.py — stream 端点改造

MODE_COORDINATOR = "auto_orchestrate"        # Coordinator 模式
MODE_STATIC_DAG = "auto_orchestrate_dag"     # Static DAG 模式（保留旧行为）
MODE_SINGLE = "chat"                         # 单 Agent 模式

async def stream_conversation(conv_id, mode, ...):
    if mode == MODE_COORDINATOR:
        # 新：Coordinator 模式
        coordinator = CoordinatorBuilder().build(agents, user_message)
        runner = AgentHubRunner(agent=coordinator, app_name="agenthub")
        async for event in runner.stream_single_chat(...):
            yield translate_to_sse(event)

    elif mode == MODE_STATIC_DAG:
        # 保留：Static DAG 模式
        plan = await OrchestratorPlanner().plan(db, user_message, agent_ids, conv_id)
        workflow = WorkflowBuilder().build(plan.plan)
        # ... 执行 ...

    else:
        # 单 Agent 模式，不变
```

---

### Phase 5: 用户自定义 Agent 支持（1-2 天）

**目标**: 用户注册的 Agent 自动纳入编排

#### 5.4.1 Agent 注册增强

```python
# models/agent.py — 确保这些字段存在

class Agent(Base, UUIDMixin, TimestampMixin):
    # ... 现有字段 ...
    description: Mapped[str]     # LLM routing 依赖的关键字段
    capabilities: Mapped[list]   # 能力标签: ["coding", "writing", "analysis"]
    mode: Mapped[str]            # 建议的协作模式: chat/task/single_turn
    tool_config: Mapped[dict]    # 工具配置 JSON
```

#### 5.4.2 动态注册到 Coordinator

Coordinator 的 `sub_agents` 从 DB 动态加载：

```python
async def build_coordinator_for_conversation(db, conv_id) -> Agent:
    # 查询该会话中 @mention 的 Agent
    agent_models = await get_mentioned_agents(db, conv_id)

    # 动态构建 Coordinator
    return CoordinatorBuilder().build(agent_models)
```

用户只需在 UI 中 @mention 一个 Agent，它就会被注册到 Coordinator 的 sub_agents 中，LLM 根据 `description` 自动路由。

---

## 4. 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `schemas/orchestrator.py` | **修改** | SubTaskPlan 加 depends_on/mode/output_key |
| `models/orchestrator_subtask.py` | **修改** | 加 depends_on/mode/execution_order 列 |
| `services/adk/planner.py` | **修改** | Prompt 升级，要求输出依赖 DAG |
| `services/adk/workflow_builder.py` | **重写** | 星型 → DAG，支持 JoinNode |
| `services/adk/coordinator_builder.py` | **新增** | Coordinator 模式构建器 |
| `api/v1/messages.py` | **修改** | confirm_plan 适配新 schema |
| `api/v1/conversations.py` | **修改** | stream 端点支持 mode 选择 |
| `models/agent.py` | **确认** | 确保 description/capabilities/mode 字段存在 |
| 数据库迁移脚本 | **新增** | ALTER TABLE 加列 |

---

## 5. 风险与缓解

| 风险 | 概率 | 缓解 |
|------|------|------|
| Coordinator LLM 路由不准确 | 中 | Agent description 写清楚职责；支持用户手动指定 Agent |
| JoinNode 阻塞（某节点无输出） | 中 | 子任务设 timeout，超时写错误信息到 state |
| Coordinator 上下文过长 | 中 | 启用 ADK context compaction；子 Agent 用 single_turn 减少事件量 |
| 旧 DAG 模式兼容性 | 低 | Phase 4 保留 `auto_orchestrate_dag` mode，渐进迁移 |
| 用户自定义 Agent instruction 质量差 | 高 | Agent 注册时做验证；Coordinator prompt 引导 LLM 容错 |

---

## 6. 对比总结

| 维度 | 当前（星型并行） | 改进后（DAG + Coordinator） |
|------|:---:|:---:|
| 任务顺序保证 | ❌ 全并行 | ✅ depends_on 控制 |
| 执行期动态协调 | ❌ Planner 退出 | ✅ Coordinator 全程在线 |
| 结果聚合 | ❌ 无 | ✅ Coordinator 汇总 / JoinNode 汇聚 |
| 工作流嵌套 | ❌ 不支持 | ✅ 嵌套 Workflow + Coordinator 调用 |
| 用户自定义 Agent | ❌ 需改 Planner | ✅ 注册后自动纳入 |
| 中间向用户澄清 | ❌ 不支持 | ✅ task mode 支持 |
| 错误恢复 | ❌ 全或无 | ✅ Coordinator 可按需重试 |
| 实现复杂度 | 低 | 中（核心改动 ~5 个文件） |
