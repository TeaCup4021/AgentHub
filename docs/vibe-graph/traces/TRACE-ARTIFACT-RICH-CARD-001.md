---
id: TRACE-ARTIFACT-RICH-CARD-001
type: trace
title: 富媒体产物卡片历史实施追踪
status: partial
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
tasks:
  - TASK-ARTIFACT-RICH-CARD-001
  - TASK-ARTIFACT-RICH-CARD-002
  - TASK-ARTIFACT-RICH-CARD-003
  - TASK-ARTIFACT-RICH-CARD-004
  - TASK-ARTIFACT-RICH-CARD-005
  - TASK-ARTIFACT-RICH-CARD-006
source_assets:
  - archive/development/plans/AgentHub-前后端-富媒体卡片升级方案-文件预览Diff.md
  - archive/development/summaries/AgentHub-富媒体卡片升级-文件预览Diff-实施总结.md
  - docs/ai-collab/decisions/artifact-preview/2026-06-04-web-preview-fix.md
depends_on: []
relates_to:
  - TRACE-PREVIEW-PPT-INLINE-001
  - TRACE-DIFF-APPLY-SOURCE-001
implements:
  - backend/app/services/storage.py
  - backend/app/services/og_fetcher.py
  - backend/app/services/preview_server.py
  - backend/app/api/v1/files.py
  - backend/app/schemas/file.py
  - backend/app/api/router.py
  - backend/app/core/config.py
  - backend/app/main.py
  - backend/app/services/adk/cli_tools.py
  - backend/app/services/artifact_detector.py
  - backend/app/services/artifact.py
  - agenthub-web/src/hooks/useBlobDownload.ts
  - agenthub-web/src/components/cards/DiffCard.tsx
  - agenthub-web/src/components/cards/FileCard.tsx
  - agenthub-web/src/components/cards/PreviewCard.tsx
  - agenthub-web/src/components/cards/LinkPreviewCard.tsx
  - agenthub-web/src/components/cards/CardRenderer.tsx
  - agenthub-web/src/components/cards/index.ts
  - agenthub-web/src/components/chat/MessageList.tsx
  - agenthub-web/src/lib/api.ts
  - agenthub-web/src/types/chat.ts
  - agenthub-web/vite.config.ts
summaries:
  - archive/development/summaries/AgentHub-富媒体卡片升级-文件预览Diff-实施总结.md
  - archive/development/summaries/vibe-graph-artifact-diff-deployment-backfill-2026-06-10.md
verification:
  - command: npx tsc -b --noEmit
    result: passed
    notes: 历史计划列为验证标准；本次补录未重新运行。
  - command: npx vitest run
    result: not_run
    notes: 历史 summary 未明确记录全量前端测试输出，本次只做图谱补录。
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 本次补录后运行通过。
deviations:
  - plan_item: 后端 artifact_detector 主力加前端兜底。
    actual: 已按该结构记录，前端 MessageList 兜底用于 diff 和 URL。
    reason: 正则检测 Agent 文本存在漏检风险。
followups:
  - 可将 CodeCard 编辑回写从本 spec 中拆出独立 `ARTIFACT-EDIT-WRITEBACK` spec。
  - 可补充更严格的 OG fetcher 单元测试和预览服务安全测试。
---

# 富媒体产物卡片历史实施追踪

## 对应任务

- `TASK-ARTIFACT-RICH-CARD-001`
- `TASK-ARTIFACT-RICH-CARD-002`
- `TASK-ARTIFACT-RICH-CARD-003`
- `TASK-ARTIFACT-RICH-CARD-004`
- `TASK-ARTIFACT-RICH-CARD-005`
- `TASK-ARTIFACT-RICH-CARD-006`

## 实际触达路径

见 frontmatter `implements`。

## 实施摘要

历史实现建立了从 Agent 文本或工具结果到结构化富媒体卡片的完整链路。后端通过 artifact_detector 识别 diff、file、preview、link_preview，文件内容进入 MinIO，预览 HTML 通过 preview_server 提供，OG 元数据通过 og_fetcher 获取。前端通过 CardRenderer 分发到 DiffCard、FileCard、PreviewCard 和 LinkPreviewCard，并在 MessageList 中提供文本兜底检测。

## 验证结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `npx tsc -b --noEmit` | `passed` | 历史计划列为验证标准；本次未重新运行。 |
| `npx vitest run` | `not_run` | 历史 summary 未明确记录全量测试输出。 |
| `python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph` | `passed` | 本次补录后运行通过。 |

## 与计划的偏差

| 计划项 | 当前观察 | 原因 |
| --- | --- | --- |
| 四类卡片按方案实现 | 当前仓库存在对应组件、服务和 API | 与历史 summary 一致。 |
| 前端兜底检测 | 当前仓库存在 MessageList 兜底路径 | 用于应对后端正则漏检。 |

## 后续事项

- 将 CodeCard 编辑回写独立补录。
- 对 preview_server 和 og_fetcher 补更细测试。

## Summary 链接

- `archive/development/summaries/AgentHub-富媒体卡片升级-文件预览Diff-实施总结.md`
- `archive/development/summaries/vibe-graph-artifact-diff-deployment-backfill-2026-06-10.md`

## Obsidian 双链

Related:

- [[SPEC-ARTIFACT-RICH-CARD-001]]
- [[PLAN-ARTIFACT-RICH-CARD-001]]
- [[TASK-ARTIFACT-RICH-CARD-001]]
- [[TASK-ARTIFACT-RICH-CARD-002]]
- [[TASK-ARTIFACT-RICH-CARD-003]]
- [[TASK-ARTIFACT-RICH-CARD-004]]
- [[TASK-ARTIFACT-RICH-CARD-005]]
- [[TASK-ARTIFACT-RICH-CARD-006]]

