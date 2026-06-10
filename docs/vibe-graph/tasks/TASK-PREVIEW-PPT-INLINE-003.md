---
id: TASK-PREVIEW-PPT-INLINE-003
type: task
title: artifact 检测链路转换 PPTX
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-PREVIEW-PPT-INLINE-001
specs:
  - SPEC-PREVIEW-PPT-INLINE-001
source_assets:
  - vibeCodingSummary/PPT内联浏览-实施总结-2026-06-06.md
depends_on:
  - TASK-PREVIEW-PPT-INLINE-001
relates_to:
  - TASK-PREVIEW-PPT-INLINE-002
implements:
  - backend/app/services/artifact_detector.py
traces:
  - TRACE-PREVIEW-PPT-INLINE-001
blocked_by: []
acceptance:
  - artifact_detector 能识别 PPT/PPTX URL 和内部文件 URL。
  - PPT/PPTX artifact 能转换为 PDF document artifact。
  - 文件名扩展名缺失时能补齐转换所需扩展名。
---

# artifact 检测链路转换 PPTX

## 目标

让 Agent 回复或内部文件链接中的 PPT/PPTX 自动进入转换管线，生成可预览 document artifact。

## 前置条件

- converter 可用。
- storage 能读取内部文件和上传转换结果。

## 预期触达路径

- `backend/app/services/artifact_detector.py`

## 执行步骤

1. 扩展文档扩展名和 MIME 映射。
2. 将 URL 检测改为支持 document artifact。
3. 解析内部文件 URL 并读取 MinIO 文件。
4. 调用 `_maybe_convert_pptx` 生成 PDF artifact。

## 验收标准

- [ ] Agent 回复中 PPTX URL 可生成 document artifact。
- [ ] 内部文件 URL 可被解析并转换。
- [ ] 转换失败时保留原始 PPTX artifact 或下载路径。

## 实施记录

见 `TRACE-PREVIEW-PPT-INLINE-001`。

## Obsidian 双链

Related:

- [[SPEC-PREVIEW-PPT-INLINE-001]]
- [[PLAN-PREVIEW-PPT-INLINE-001]]
- [[TASK-PREVIEW-PPT-INLINE-001]]
- [[TASK-PREVIEW-PPT-INLINE-002]]
- [[TRACE-PREVIEW-PPT-INLINE-001]]
