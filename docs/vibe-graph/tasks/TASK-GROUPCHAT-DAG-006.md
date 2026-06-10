---
id: TASK-GROUPCHAT-DAG-006
type: task
title: Orchestrator LLM 总结
status: implemented
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
plan: PLAN-GROUPCHAT-DAG-001
specs:
  - SPEC-GROUPCHAT-DAG-001
source_assets:
  - archive/development/plans/群聊DAG执行与Orchestrator总结重构.md
  - archive/development/summaries/群聊DAG执行与Orchestrator总结重构-summary.md
depends_on:
  - TASK-GROUPCHAT-DAG-004
relates_to: []
implements:
  - backend/app/services/adk/merge_aggregator.py
  - backend/app/api/v1/conversations.py
traces:
  - TRACE-GROUPCHAT-DAG-001
blocked_by: []
acceptance:
  - MergeAggregator 调 Orchestrator 模型生成自然语言总结。
  - LLM 总结失败时回退模板，不阻断流程。
  - 结构化 sub_summaries 继续保留为 artifact 或 result_summary。
---

# Orchestrator LLM 总结

## 目标

将执行完成后的静态拼表总结升级为 Orchestrator 模型读取各 Agent 输出后的自然语言总结。

## 前置条件

- subtask metrics 能找到每个 Agent 的 output_message_id。
- MergeAggregator 能读取 OrchestratorTask 和 Agent 输出。

## 预期触达路径

- `backend/app/services/adk/merge_aggregator.py`
- `backend/app/api/v1/conversations.py`

## 执行步骤

1. 保留 `aggregate` 生成结构化 sub_summaries。
2. 增加 `summarize_with_llm`。
3. 根据 planner_agent_id 解析 Orchestrator 模型，否则使用默认 DeepSeek。
4. 生成自然语言总结并作为 orchestrator 消息输出。
5. 失败时回退模板文本。

## 验收标准

- [ ] 最终 Orchestrator 消息是自然语言段落。
- [ ] 结构化指标未丢失。
- [ ] LLM 失败不阻断主流程。

## 实施记录

见 `TRACE-GROUPCHAT-DAG-001`。

## Obsidian 双链

Related:

- [[SPEC-GROUPCHAT-DAG-001]]
- [[PLAN-GROUPCHAT-DAG-001]]
- [[TASK-GROUPCHAT-DAG-004]]
- [[TRACE-GROUPCHAT-DAG-001]]

