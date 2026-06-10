# Debug Playbooks

调试手册只在排障时读取。新需求建 SPEC 时不要默认读取本目录。

| 文件 | 读取触发条件 |
| --- | --- |
| `agent-failure.md` | Agent 对话失败、模型调用异常、URL 或模型名可能错误。 |
| `artifact-cards.md` | 产物卡片不出现、类型错误、预览/编辑/Diff 联调异常。 |
| `disambiguate-planner.md` | 多 @ 消歧错误、Planner 选择错误、executor_pool 异常。 |
| `group-chat-orchestration.md` | 群聊 DAG 状态异常、Agent 顺序/并行/状态事件异常。 |
