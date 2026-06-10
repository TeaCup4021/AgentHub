---
id: TRACE-PREVIEW-PPT-INLINE-001
type: trace
title: PPT 内联浏览历史实施追踪
status: partial
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
tasks:
  - TASK-PREVIEW-PPT-INLINE-001
  - TASK-PREVIEW-PPT-INLINE-002
  - TASK-PREVIEW-PPT-INLINE-003
  - TASK-PREVIEW-PPT-INLINE-004
  - TASK-PREVIEW-PPT-INLINE-005
  - TASK-PREVIEW-PPT-INLINE-006
source_assets:
  - vibeCodingPlan/AgentHub-PPT内联浏览-实施计划.md
  - vibeCodingPlan/AgentHub-PPT内联浏览-实施计划-v2.md
  - vibeCodingSummary/PPT内联浏览-实施总结-2026-06-06.md
  - vibeCodingSummary/PPT内联浏览-计划vs实际实施对比-2026-06-06.md
depends_on: []
relates_to:
  - TRACE-AICOLLAB-VIBE-GRAPH-001
implements:
  - backend/docker-compose.yml
  - backend/app/core/config.py
  - backend/app/services/converter.py
  - backend/app/services/artifact_detector.py
  - backend/app/api/v1/files.py
  - backend/app/services/adapters/cli_adapter.py
  - backend/.env
  - backend/requirements.txt
  - backend/app/schemas/file.py
  - agenthub-web/src/components/cards/DocumentCard.tsx
  - agenthub-web/src/types/api.ts
summaries:
  - vibeCodingSummary/PPT内联浏览-实施总结-2026-06-06.md
  - vibeCodingSummary/PPT内联浏览-计划vs实际实施对比-2026-06-06.md
  - vibeCodingSummary/vibe-graph-ppt-inline-backfill-2026-06-10.md
verification:
  - command: historical manual integration
    result: passed
    notes: 历史 summary 记录已完成联调，修复 Gotenberg 502/400、inline 下载和 uvicorn reload 问题。
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 本次补录后图谱校验通过。
  - command: end-to-end PPT upload conversion
    result: not_run
    notes: 本次仅做历史补录，未重新启动 Gotenberg 和前后端服务做端到端验证。
deviations:
  - plan_item: Plan v1 建议使用 Office Web Viewer 作为前端 iframe 预览方案。
    actual: 实际完全未采用，改用 Gotenberg 后端转换为 PDF。
    reason: 本地 MinIO 文件 URL 不公网可达，Office Web Viewer 无法访问。
  - plan_item: Plan v2 只覆盖上传转换、convert_bytes_sync 提取、DocumentCard 分支和类型同步。
    actual: 实际还补充了 Gotenberg 配置、artifact_detector 内部文件解析、CLI 文件扫描、download inline、HEAD/preview 端点和依赖更新。
    reason: 联调过程中发现多条实际 PPTX 来源和阻塞性预览 bug。
followups:
  - 后续可把 PPT 内联浏览与更大的产物预览编辑能力拆出上游 SPEC。
  - 后续可将 Gotenberg 可用性加入环境健康检查或端到端测试。
  - 后续可环境化治理 backend/.env 中的 CLI workspace 路径。
---

# PPT 内联浏览历史实施追踪

## 对应任务

- `TASK-PREVIEW-PPT-INLINE-001`
- `TASK-PREVIEW-PPT-INLINE-002`
- `TASK-PREVIEW-PPT-INLINE-003`
- `TASK-PREVIEW-PPT-INLINE-004`
- `TASK-PREVIEW-PPT-INLINE-005`
- `TASK-PREVIEW-PPT-INLINE-006`

## 实际触达路径

- `backend/docker-compose.yml`
- `backend/app/core/config.py`
- `backend/app/services/converter.py`
- `backend/app/services/artifact_detector.py`
- `backend/app/api/v1/files.py`
- `backend/app/services/adapters/cli_adapter.py`
- `backend/.env`
- `backend/requirements.txt`
- `backend/app/schemas/file.py`
- `agenthub-web/src/components/cards/DocumentCard.tsx`
- `agenthub-web/src/types/api.ts`

## 实施摘要

历史实现将 PPT/PPTX 内联浏览落在后端转换为 PDF 的方案上：用户上传、Agent 回复 URL、内部文件链接和 CLI Agent 本地生成文件都可以进入转换管线。转换后的 PDF 存入 MinIO，通过 document artifact 和 DocumentCard iframe 渲染。文件下载端点补充 inline header，解决转换成功后仍弹下载框的问题。

## 验证结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `historical manual integration` | `passed` | 历史 summary 记录联调完成，并修复 Gotenberg 502/400、inline 下载和 reload 问题。 |
| `python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph` | `passed` | 本次补录后图谱校验通过。 |
| `end-to-end PPT upload conversion` | `not_run` | 本次只补录图谱，未重新启动 Gotenberg 和前后端服务。 |

## 与计划的偏差

| 计划项 | 当前观察 | 原因 |
| --- | --- | --- |
| Plan v1 使用 Office Web Viewer | 实际未采用，改为 Gotenberg 转 PDF | 本地 MinIO 文件无法被 Office Web Viewer 访问。 |
| Plan v2 四步实现 | 四步完成，但实际包含更多转换来源和 bug 修复 | 联调发现 CLI 生成文件、内部文件 URL、inline header、代理和 reload 问题。 |
| 转换失败处理 | 实际强调降级下载 | 转换服务是外部依赖，不能阻塞主流程。 |

## 后续事项

- 把 PPT 内联浏览纳入更完整的 `ARTIFACT` 或 `PREVIEW` 能力图谱。
- 增加 Gotenberg 健康检查和可选端到端测试。
- 复核 `.env` 中 CLI workspace 的环境化配置方式。

## Summary 链接

- `vibeCodingSummary/PPT内联浏览-实施总结-2026-06-06.md`
- `vibeCodingSummary/PPT内联浏览-计划vs实际实施对比-2026-06-06.md`
- `vibeCodingSummary/vibe-graph-ppt-inline-backfill-2026-06-10.md`

## Obsidian 双链

Related:

- [[SPEC-PREVIEW-PPT-INLINE-001]]
- [[PLAN-PREVIEW-PPT-INLINE-001]]
- [[TASK-PREVIEW-PPT-INLINE-001]]
- [[TASK-PREVIEW-PPT-INLINE-002]]
- [[TASK-PREVIEW-PPT-INLINE-003]]
- [[TASK-PREVIEW-PPT-INLINE-004]]
- [[TASK-PREVIEW-PPT-INLINE-005]]
- [[TASK-PREVIEW-PPT-INLINE-006]]
