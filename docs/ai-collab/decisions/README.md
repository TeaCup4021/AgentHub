# Architecture Decision Records

每个 ADR 记录一个关键的架构决策，包括上下文、决策和后果。

| # | 标题 | 日期 |
|---|------|------|
| 001 | Planner/Coordinator Prompt 中 Agent 分配策略 | 2026-06-04 |
| 002 | [群聊确认后走 DAG 执行 + 多 Agent 依次/并行回复](002-group-chat-dag-execution.md) | 2026-06-06 |
| 003 | [多 Agent 编排修复汇总（越权/空气泡/刷新丢失/CLI mode/超时）](003-multi-agent-orchestration-fixes.md) | 2026-06-06 |
| 004 | [Workflow 中 Agent instruction 传播修复](004-workflow-instruction-propagation-fix.md) | 2026-06-07 |
| 005 | [CLI Agent instruction 提取修复（从 llm_request.contents 改为闭包 agent.instruction）](005-cli-agent-instruction-extraction-fix.md) | 2026-06-07 |
| 006 | [CLI Agent 语言输出和任务执行修复（闭包访问 LlmAgent + 移除硬编码英文）](006-cli-agent-language-and-execution-fix.md) | 2026-06-07 |
| - | [合并冲突解决](2026-06-04-merge-conflict-resolution.md) | 2026-06-04 |
| - | [网页预览功能修复](2026-06-04-web-preview-fix.md) | 2026-06-04 |
| - | [Pin 状态前端单一数据源原则](2026-06-05-pin-state-single-source.md) | 2026-06-05 |
| - | [产物代码编辑回写后端（编辑=追加新版本）](2026-06-05-artifact-edit-writeback.md) | 2026-06-05 |
| - | [Diff 卡按内容/文件名启发式回写源代码卡](2026-06-05-diff-apply-to-source.md) | 2026-06-05 |
