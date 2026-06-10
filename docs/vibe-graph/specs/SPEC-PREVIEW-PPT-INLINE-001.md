---
id: SPEC-PREVIEW-PPT-INLINE-001
type: spec
title: PPT 内联浏览
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
source_assets:
  - vibeCodingPlan/AgentHub-PPT内联浏览-实施计划-v2.md
  - vibeCodingSummary/PPT内联浏览-实施总结-2026-06-06.md
  - vibeCodingSummary/PPT内联浏览-计划vs实际实施对比-2026-06-06.md
depends_on: []
relates_to:
  - SPEC-AICOLLAB-VIBE-GRAPH-001
plans:
  - PLAN-PREVIEW-PPT-INLINE-001
acceptance:
  - 用户上传 PPT/PPTX 后，后端可转换为 PDF 并返回可预览地址。
  - Agent 回复、内部文件链接和 CLI Agent 生成文件中的 PPT/PPTX 可被 artifact 检测并转换为 PDF。
  - 前端 DocumentCard 复用 PDF iframe 内联预览转换结果。
  - PDF 下载端点返回 inline Content-Disposition，避免转换成功后仍被强制下载。
  - Gotenberg 不可用或转换失败时保留原文件下载路径，不导致主流程 500。
non_goals:
  - 使用 Microsoft Office Web Viewer 预览本地 MinIO 私有文件。
  - 在前端直接解析 PPTX 幻灯片内容。
  - 为所有文档类型实现统一在线编辑。
contracts:
  - docs/AgentHub 响应格式与前后端对齐约定.md
---

# PPT 内联浏览

## 背景

历史需求来自产物预览与编辑补全计划：Agent 回复或用户上传 PPTX 后，希望在聊天内直接预览幻灯片，而不是只能下载文件。早期 plan v1 考虑过 Office Web Viewer，但本地 MinIO 文件无法提供公网可达 URL，实际采用 Gotenberg/LibreOffice 后端转换为 PDF，再复用前端 PDF iframe 预览。

## 目标

- 将 PPT/PPTX 文件转换为浏览器可内联预览的 PDF。
- 覆盖用户上传、Agent 回复 URL、内部文件链接和 CLI Agent 本地生成文件。
- 转换失败时降级为下载，不破坏原始文件访问。
- 让前端保持简单，复用已有 DocumentCard PDF 渲染。

## 范围

- 后端 Gotenberg 服务配置和 converter 客户端。
- 文件上传端点的即时转换与 preview 字段。
- artifact detector 的文档 URL、内部文件和 PPTX 转换。
- CLI Agent 完成后扫描生成文档并发出 artifact。
- 文件下载和 preview 端点的 inline 响应。
- 前端 DocumentCard 的 PDF/PPTX iframe 渲染和降级。

## 非目标

- 不实现前端 PPTX 原生渲染器。
- 不要求转换服务永远可用。
- 不把 Office Web Viewer 作为默认预览方案。
- 不在本节点处理代码编辑器、Diff 应用或其他产物编辑能力。

## 输入

- 用户上传的 `.ppt` 或 `.pptx` 文件。
- Agent 回复中包含的 PPT/PPTX URL。
- CLI Agent workspace 中新生成的 PPT/PPTX 文件。
- MinIO 中已存在的内部文件 URL。

## 输出

- MinIO 中的转换后 PDF 文件。
- `FileUploadResponse.previewUrl` 和 `previewFileId`。
- SSE artifact 事件中的 `artifactType=document` 与 `fileType=pdf`。
- 浏览器可内联渲染的 PDF response。
- 转换失败时的原始文件下载入口。

## 关键约束

- Gotenberg HTTP 客户端需要禁用系统代理，避免 localhost 转换请求被代理劫持。
- LibreOffice 转换需要有正确文件扩展名。
- `/download` 对 PDF 和图片需要返回 `Content-Disposition: inline`。
- 上传、artifact 检测和 CLI 扫描不能因为转换失败中断主流程。
- 前端不新增复杂 PPT 渲染逻辑，优先复用 PDF iframe。

## 验收标准

- [ ] 上传 `.pptx` 返回 `previewUrl` 或在转换失败时返回成功但 preview 为空。
- [ ] 访问转换后的 PDF URL 返回 `application/pdf` 且 inline。
- [ ] Agent 回复或 CLI 生成 PPTX 后，聊天中出现可预览 document artifact。
- [ ] DocumentCard 对 `fileType=pdf` 或 `fileType=pptx` 不白屏。
- [ ] Gotenberg 不可用时主流程降级为下载。

## 追溯

- Plan: `PLAN-PREVIEW-PPT-INLINE-001`
- Tasks: `TASK-PREVIEW-PPT-INLINE-001` 至 `TASK-PREVIEW-PPT-INLINE-006`
- Trace: `TRACE-PREVIEW-PPT-INLINE-001`

## Obsidian 双链

Related:

- [[PLAN-PREVIEW-PPT-INLINE-001]]
- [[TASK-PREVIEW-PPT-INLINE-001]]
- [[TASK-PREVIEW-PPT-INLINE-002]]
- [[TASK-PREVIEW-PPT-INLINE-003]]
- [[TASK-PREVIEW-PPT-INLINE-004]]
- [[TASK-PREVIEW-PPT-INLINE-005]]
- [[TASK-PREVIEW-PPT-INLINE-006]]
- [[TRACE-PREVIEW-PPT-INLINE-001]]
- [[SPEC-AICOLLAB-VIBE-GRAPH-001]]
