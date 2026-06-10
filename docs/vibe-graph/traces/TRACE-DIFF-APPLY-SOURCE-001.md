---
id: TRACE-DIFF-APPLY-SOURCE-001
type: trace
title: Diff 应用到源产物历史实施追踪
status: partial
owner: Frontend
created: 2026-06-10
updated: 2026-06-10
tasks:
  - TASK-DIFF-APPLY-SOURCE-001
  - TASK-DIFF-APPLY-SOURCE-002
  - TASK-DIFF-APPLY-SOURCE-003
  - TASK-DIFF-APPLY-SOURCE-004
source_assets:
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-diff-apply-to-source.md
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-artifact-edit-writeback.md
depends_on:
  - TRACE-ARTIFACT-RICH-CARD-001
relates_to: []
implements:
  - agenthub-web/src/lib/diffApply.ts
  - agenthub-web/src/components/cards/DiffCard.tsx
  - agenthub-web/src/lib/queryClient.ts
  - agenthub-web/src/lib/api.ts
  - backend/app/services/artifact_format.py
  - agenthub-web/src/lib/__tests__/diffApply.test.ts
  - agenthub-web/src/components/cards/__tests__/CardRenderer.test.tsx
summaries:
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-diff-apply-to-source.md
  - archive/development/summaries/vibe-graph-artifact-diff-deployment-backfill-2026-06-10.md
verification:
  - command: diffApply.ts unit tests
    result: passed
    notes: 历史 ADR 记录 11 个用例全绿。
  - command: tsc -b
    result: passed
    notes: 历史 ADR 记录前端类型检查 0 错误。
  - command: vitest run
    result: passed
    notes: 历史 ADR 记录前端全量 104 用例通过。
  - command: backend artifact_format tests
    result: passed
    notes: 历史 ADR 记录后端 test_artifact_format.py 通过。
  - command: end-to-end selection edit apply
    result: not_run
    notes: 历史 ADR 标注端到端待用户联调确认；本次补录未重新运行。
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 本次补录后运行通过。
deviations:
  - plan_item: DiffCard 原有“保存文件”写入 MinIO 新文件。
    actual: 新增“应用到源文件”，原保存路径更名为“另存为文件”并保留。
    reason: 写回源代码卡和另存新文件是两种不同语义。
followups:
  - 可在 UI 中增加用户手动选择源卡的 fallback，降低启发式误匹配风险。
  - 可为 filename-full 分支增加更严格的完整文件判断。
---

# Diff 应用到源产物历史实施追踪

## 对应任务

- `TASK-DIFF-APPLY-SOURCE-001`
- `TASK-DIFF-APPLY-SOURCE-002`
- `TASK-DIFF-APPLY-SOURCE-003`
- `TASK-DIFF-APPLY-SOURCE-004`

## 实际触达路径

见 frontmatter `implements`。

## 实施摘要

历史实现为 DiffCard 增加“应用到源文件”能力。前端通过 `diffApply.ts` 纯函数使用内容片段和文件名启发式匹配源代码卡，匹配成功后复用 artifact 编辑回写 API 追加新版本。后端选区改写指令同步增强，以提高 Agent 输出 diff 的可匹配性。

## 验证结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `diffApply.ts unit tests` | `passed` | 历史 ADR 记录 11 个用例全绿。 |
| `tsc -b` | `passed` | 历史 ADR 记录前端类型检查 0 错误。 |
| `vitest run` | `passed` | 历史 ADR 记录前端全量 104 用例通过。 |
| `backend artifact_format tests` | `passed` | 历史 ADR 记录通过。 |
| `end-to-end selection edit apply` | `not_run` | 历史 ADR 标注待用户联调确认。 |
| `python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph` | `passed` | 本次补录后运行通过。 |

## 与计划的偏差

| 计划项 | 当前观察 | 原因 |
| --- | --- | --- |
| 通过 DiffCard 保存文件 | 实际新增应用到源文件，同时保留另存为文件 | 两者语义不同，不能合并。 |
| 隐式匹配源卡 | 实际采用内容优先、文件名次要的启发式匹配 | Agent 不知道我方 artifact id。 |

## 后续事项

- 增加手动选择源卡的 UI 兜底。
- 对整文件替换分支增加更多保护。

## Summary 链接

- `docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-diff-apply-to-source.md`
- `archive/development/summaries/vibe-graph-artifact-diff-deployment-backfill-2026-06-10.md`

## Obsidian 双链

Related:

- [[SPEC-DIFF-APPLY-SOURCE-001]]
- [[PLAN-DIFF-APPLY-SOURCE-001]]
- [[TASK-DIFF-APPLY-SOURCE-001]]
- [[TASK-DIFF-APPLY-SOURCE-002]]
- [[TASK-DIFF-APPLY-SOURCE-003]]
- [[TASK-DIFF-APPLY-SOURCE-004]]
- [[TRACE-ARTIFACT-RICH-CARD-001]]

