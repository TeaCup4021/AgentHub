# Architecture Decision Records

ADR 记录历史架构取舍、修复原则和后果。建立 SPEC 前不要批量读取全部 ADR，只进入相关子目录。

| 目录 | 读取触发条件 |
| --- | --- |
| `orchestration/` | Planner/Coordinator、群聊 DAG、多 Agent 编排。 |
| `cli-agent/` | Workflow instruction、CLI Agent 指令提取、语言输出和执行。 |
| `artifact-preview/` | 网页预览、PPTX/PDF 预览、产物托管。 |
| `artifact-edit-diff/` | CodeCard 编辑回写、Diff 应用到源文件。 |
| `frontend-state/` | Pin 状态、前端多视图一致性。 |
| `merge/` | 历史合并冲突背景。 |
