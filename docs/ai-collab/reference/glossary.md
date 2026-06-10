# AgentHub 术语表

| 术语 | 英文 | 含义 |
|------|------|------|
| Agent | Agent | 可配置的 AI 工作者，绑定了一个 LLM 模型（Claude/GPT/DeepSeek）或 CLI 工具（Claude Code/Codex） |
| 适配器 | Adapter | 统一各类 LLM/CLI 提供商的接口，通过 `AdapterRegistry` 注册 |
| 对话 | Conversation | 用户与 Agent(s) 的聊天会话，支持 `single`（单聊）和 `group`（群聊）两种类型 |
| @提及 | Mention | 在消息中 `@` 指定要参与的 Agent（群聊中使用） |
| 钉选 | Pin | 将重要消息固定到上下文顶部，每次 Agent 调用时自动注入 |
| 产物 | Artifact | Agent 产出的结构化内容（代码、diff、HTML 预览、文件链接等） |
| 产物检测 | Artifact Detector | 从 Agent 文本回复中自动识别并提取产物的模块（支持 XML 标签、代码块、URL） |
| SSE | Server-Sent Events | 后端推送协议，用于流式传输 Agent 的实时响应 |
| ADK | Agent Development Kit | Google ADK 2.0，项目的 Agent 引擎层 |
| Runner | Runner | ADK Runner 的封装，负责执行 Agent 并返回事件流 |
| 编排 | Orchestration | 群聊模式下，将用户需求自动拆解为子任务并协调多 Agent 执行的过程 |
| 规划器 | Planner | 负责任务拆解的 LLM Agent，将复杂需求分解为有序 Subtask |
| 协调者 | Coordinator | 动态分派子任务的协调 Agent（ADK Collaborative Workflow 模式） |
| 工作流 | Workflow | 按 DAG 依赖图静态执行子任务（ADK Workflow Graph 模式） |
| 执行追踪器 | Execution Tracer | 记录每个 Agent 的执行时长和状态，生成 DAG 可视化数据 |
| 合并汇总器 | Merge Aggregator | 多 Agent 执行完毕后，汇总各子任务结果并生成摘要 |
| 上下文组装器 | Context Assembler | 将 Agent 提示、Spec 规则、钉选消息、聊天历史按优先级组装为 LLM 上下文 |
| 顺序化输出 | Stream Sequentializer | 群聊模式下确保各 Agent 的输出按计划顺序依次到达前端 |
| Spec 管理器 | Spec Manager | 动态加载和管理项目规范/规则 |
| DAG | Directed Acyclic Graph | 有向无环图，用于可视化子任务的依赖关系和执行状态 |
