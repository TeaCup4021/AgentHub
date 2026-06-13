# Runtime

运行机制文档。只有需求触达 Agent 执行、模型适配、用户对话流或群聊编排链路时读取。

| 文件 | 读取时机 |
| --- | --- |
| `conversation-ai-flow.md` | 用户消息发送、AI 回复流式传输、ADK Runner、SSE 转换、消息与 Artifact 持久化链路相关变更。 |
| `agent-adapter.md` | Agent Adapter、模型调用、CLI Agent 或注册机制相关变更。 |
| `orchestration-flow.md` | 群聊、Planner、Coordinator、DAG 和 Orchestrator 执行链路相关变更。 |
