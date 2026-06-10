---
id: TASK-PREVIEW-PPT-INLINE-002
type: task
title: 上传端点即时转换并返回 preview
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-PREVIEW-PPT-INLINE-001
specs:
  - SPEC-PREVIEW-PPT-INLINE-001
source_assets:
  - vibeCodingPlan/AgentHub-PPT内联浏览-实施计划-v2.md
  - vibeCodingSummary/PPT内联浏览-实施总结-2026-06-06.md
depends_on:
  - TASK-PREVIEW-PPT-INLINE-001
relates_to: []
implements:
  - backend/app/api/v1/files.py
  - backend/app/schemas/file.py
  - agenthub-web/src/types/api.ts
traces:
  - TRACE-PREVIEW-PPT-INLINE-001
blocked_by: []
acceptance:
  - upload_file 能识别 PPT/PPTX 并尝试转换。
  - FileUploadResponse 包含 previewUrl 和 previewFileId。
  - 转换失败时上传仍成功返回。
---

# 上传端点即时转换并返回 preview

## 目标

让用户上传 PPT/PPTX 文件时立即生成 PDF 预览，并把预览地址返回给前端。

## 前置条件

- `convert_bytes_sync` 可用。
- storage 能上传原文件和转换后 PDF。

## 预期触达路径

- `backend/app/api/v1/files.py`
- `backend/app/schemas/file.py`
- `agenthub-web/src/types/api.ts`

## 执行步骤

1. 在 upload 端点判断 presentation 文件类型。
2. 调用转换函数生成 PDF。
3. 将 PDF 存入 conversions 前缀。
4. 在响应 schema 和前端类型中补充 preview 字段。

## 验收标准

- [ ] 上传 PPTX 后 response 可包含 PDF preview URL。
- [ ] 非 PPTX 文件上传行为不变。
- [ ] Gotenberg 异常不会导致 upload 500。

## 实施记录

见 `TRACE-PREVIEW-PPT-INLINE-001`。

## Obsidian 双链

Related:

- [[SPEC-PREVIEW-PPT-INLINE-001]]
- [[PLAN-PREVIEW-PPT-INLINE-001]]
- [[TASK-PREVIEW-PPT-INLINE-001]]
- [[TRACE-PREVIEW-PPT-INLINE-001]]
