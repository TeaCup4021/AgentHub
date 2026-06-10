# AI 协作上下文路由索引整理总结

## 1. 背景

用户指出 Vibecoding 建立 SPEC 前需要读取 `docs/ai-collab/`，但不能一次性加载过多上下文。因此本次对 `ai-collab` 内容进行逻辑分类整理，目标是让后续 AI 能按场景读取最小必要文档。

## 2. 完成内容

- 新增 `docs/ai-collab/reference/context-index.md`。
- 更新 `docs/ai-collab/README.md`，加入上下文控制入口和分类速查。
- 更新 `docs/ai-collab/decisions/README.md`，加入 ADR 场景分类和读取规则。
- 新增 Vibe Graph 链路：
  - `SPEC-AICOLLAB-CONTEXT-ROUTING-001`
  - `PLAN-AICOLLAB-CONTEXT-ROUTING-001`
  - `TASK-AICOLLAB-CONTEXT-ROUTING-001`
  - `TRACE-AICOLLAB-CONTEXT-ROUTING-001`

## 3. 分类结果

`ai-collab` 文档被整理为以下类型：

- 入口索引：`README.md`, `context-index.md`
- 核心契约：`api-conventions.md`, `sse-protocol.md`, `frontend-conventions.md`, `database-schema.md`
- 架构机制：`agent-adapter.md`, `orchestration-flow.md`
- 术语与验证：`glossary.md`, `verify-local.md`
- 调试手册：`debug-*.md`
- 决策记录：`decisions/*.md`

## 4. 关键取舍

本次没有移动或重命名现有文件，而是通过 `context-index.md` 进行逻辑分类。这样可以保留历史链接、Vibe Graph `source_assets` 和已有文档引用。

## 5. 验证

已运行：

```text
python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
```

结果：通过，0 errors，0 warnings。

## 6. 后续维护

- 新增 `docs/ai-collab/*.md` 时，需要同步更新 `context-index.md`。
- 新增 ADR 时，需要补充读取触发条件。
- 新增 debug playbook 时，需要补充症状索引。
