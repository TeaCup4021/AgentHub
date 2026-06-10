---
id: TASK-PREVIEW-PPT-INLINE-006
type: task
title: 下载与预览降级修复
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-PREVIEW-PPT-INLINE-001
specs:
  - SPEC-PREVIEW-PPT-INLINE-001
source_assets:
  - vibeCodingSummary/PPT内联浏览-实施总结-2026-06-06.md
  - vibeCodingSummary/PPT内联浏览-计划vs实际实施对比-2026-06-06.md
depends_on:
  - TASK-PREVIEW-PPT-INLINE-001
  - TASK-PREVIEW-PPT-INLINE-005
relates_to:
  - TASK-PREVIEW-PPT-INLINE-002
implements:
  - backend/app/api/v1/files.py
  - backend/requirements.txt
traces:
  - TRACE-PREVIEW-PPT-INLINE-001
blocked_by: []
acceptance:
  - PDF 和图片下载响应使用 inline Content-Disposition。
  - 提供 HEAD /download 和 GET /preview 兼容预览探测。
  - Gotenberg 失败时保留原文件下载，不让主流程失败。
---

# 下载与预览降级修复

## 目标

修复转换成功却被浏览器当附件下载、预览探测 405、Gotenberg 失败导致体验不稳定等问题。

## 前置条件

- 上传、artifact 或 CLI 链路能生成文件 URL。
- 前端通过 iframe 或预览探测访问后端文件端点。

## 预期触达路径

- `backend/app/api/v1/files.py`
- `backend/requirements.txt`

## 执行步骤

1. 根据 MinIO stat 推断真实 Content-Type。
2. 对 PDF 和图片设置 inline disposition。
3. 增加 HEAD download 支持。
4. 增加 preview 端点并在可行时按需转换 PPTX。
5. 补充后端依赖。

## 验收标准

- [ ] PDF 在 iframe 中打开而不是弹下载。
- [ ] 预览探测不会因为 HEAD 缺失返回 405。
- [ ] 转换失败时返回原始文件或下载降级。

## 实施记录

见 `TRACE-PREVIEW-PPT-INLINE-001`。

## Obsidian 双链

Related:

- [[SPEC-PREVIEW-PPT-INLINE-001]]
- [[PLAN-PREVIEW-PPT-INLINE-001]]
- [[TASK-PREVIEW-PPT-INLINE-001]]
- [[TASK-PREVIEW-PPT-INLINE-005]]
- [[TRACE-PREVIEW-PPT-INLINE-001]]
