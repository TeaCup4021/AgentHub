---
id: PLAN-PREVIEW-PPT-INLINE-001
type: plan
title: PPT 内联浏览历史实施计划映射
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
specs:
  - SPEC-PREVIEW-PPT-INLINE-001
source_assets:
  - archive/development/plans/AgentHub-PPT内联浏览-实施计划-v2.md
  - archive/development/summaries/PPT内联浏览-实施总结-2026-06-06.md
  - archive/development/summaries/PPT内联浏览-计划vs实际实施对比-2026-06-06.md
depends_on: []
relates_to:
  - PLAN-AICOLLAB-VIBE-GRAPH-001
tasks:
  - TASK-PREVIEW-PPT-INLINE-001
  - TASK-PREVIEW-PPT-INLINE-002
  - TASK-PREVIEW-PPT-INLINE-003
  - TASK-PREVIEW-PPT-INLINE-004
  - TASK-PREVIEW-PPT-INLINE-005
  - TASK-PREVIEW-PPT-INLINE-006
review:
  required: true
  confirmed_by: historical-summary
  confirmed_at: 2026-06-06
risks:
  - 转换服务依赖 Gotenberg/LibreOffice，开发环境可能未启动容器。
  - 历史 summary 记录了实际实施超出 plan v2 的 CLI Agent 文件扫描能力。
  - 本次为历史补录，未重新运行端到端 PPT 转换验证。
verification:
  - command: historical manual integration
    result: passed
    notes: 历史 summary 记录联调完成，修复 Gotenberg 502/400、inline 下载和 CLI reload 问题。
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 本次补录后运行通过。
---

# PPT 内联浏览历史实施计划映射

## 来源 Spec

- `SPEC-PREVIEW-PPT-INLINE-001`: PPT/PPTX 文件转换为 PDF 并在聊天中内联预览。

## 实施目标

将 PPT 内联浏览历史实现映射为稳定图谱节点，并保留 plan v1、plan v2 与实际实施之间的差异。

## 实施范围

- 后端 Gotenberg 转换客户端和配置。
- 文件上传、download、preview 端点。
- artifact_detector 的 PPTX 检测和转换。
- CLI Agent 本地生成文件扫描和 artifact 持久化。
- 前端 DocumentCard 和 API 类型。

不在本次补录范围：

- 修改现有 PPT 预览业务代码。
- 重新启动 Gotenberg 做端到端转换。
- 补录整个产物预览与编辑系统。

## 方案

1. 将 plan v2 的四个步骤映射为上传转换、转换函数提取、DocumentCard 渲染和类型同步任务。
2. 将实际实施中超出 plan 的 Gotenberg 配置、artifact_detector、CLI 扫描、inline 下载和 preview 端点合并到可独立验收 task。
3. 在 trace 中记录 plan v1 未采用 Office Web Viewer、plan v2 已完成，以及额外 bug 修复。
4. 通过 Vibe Graph 校验脚本验证节点关系。

## Task 拆分

| Task ID | 标题 | 预期触达路径 | 验收点 |
| --- | --- | --- | --- |
| `TASK-PREVIEW-PPT-INLINE-001` | 建立 Gotenberg 转换服务与客户端 | `backend/docker-compose.yml`, `backend/app/core/config.py`, `backend/app/services/converter.py` | PPTX 字节可转换为 PDF。 |
| `TASK-PREVIEW-PPT-INLINE-002` | 上传端点即时转换并返回 preview | `backend/app/api/v1/files.py`, `backend/app/schemas/file.py`, `agenthub-web/src/types/api.ts` | 上传 PPTX 后返回 previewUrl/previewFileId。 |
| `TASK-PREVIEW-PPT-INLINE-003` | artifact 检测链路转换 PPTX | `backend/app/services/artifact_detector.py` | Agent URL 或内部文件可生成 PDF document artifact。 |
| `TASK-PREVIEW-PPT-INLINE-004` | CLI Agent 生成文件自动预览 | `backend/app/services/adapters/cli_adapter.py`, `backend/.env` | CLI 生成 PPTX 后发出 document artifact。 |
| `TASK-PREVIEW-PPT-INLINE-005` | 前端 DocumentCard 内联渲染 | `agenthub-web/src/components/cards/DocumentCard.tsx` | PDF/PPTX 走 iframe，失败可降级。 |
| `TASK-PREVIEW-PPT-INLINE-006` | 下载与预览降级修复 | `backend/app/api/v1/files.py`, `backend/requirements.txt` | PDF inline，Gotenberg 失败不破坏主流程。 |

## 契约与兼容性

- `FileUploadResponse` 新增 `previewUrl` 和 `previewFileId`，不破坏原字段。
- document artifact 继续复用现有卡片协议。
- 文件下载端点保持原始文件下载能力，PDF/图片使用 inline 展示。
- Gotenberg 不可用时保留原始文件路径。

## 风险

- 转换能力依赖外部容器，CI 或本地环境不一定具备。
- 浏览器 iframe 能否完整显示取决于 PDF response header。
- 历史 `.env` 中 workspace 路径可能是本地开发机路径，后续需要环境化治理。

## 验证计划

- [ ] 上传 `.pptx`，检查 upload response。
- [ ] 下载转换后 PDF，检查 content type 和 inline header。
- [ ] Agent 回复或 CLI 生成 PPTX，检查 document artifact。
- [ ] 关闭 Gotenberg 后验证降级不 500。
- [ ] 运行 Vibe Graph 校验脚本。

## Review

该节点为历史补录，review 信息来自 2026-06-06 历史 summary，不代表当前用户在本次补录中重新确认业务实现。

## Obsidian 双链

Related:

- [[SPEC-PREVIEW-PPT-INLINE-001]]
- [[TASK-PREVIEW-PPT-INLINE-001]]
- [[TASK-PREVIEW-PPT-INLINE-002]]
- [[TASK-PREVIEW-PPT-INLINE-003]]
- [[TASK-PREVIEW-PPT-INLINE-004]]
- [[TASK-PREVIEW-PPT-INLINE-005]]
- [[TASK-PREVIEW-PPT-INLINE-006]]
- [[TRACE-PREVIEW-PPT-INLINE-001]]

