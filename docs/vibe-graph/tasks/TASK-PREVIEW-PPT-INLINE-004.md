---
id: TASK-PREVIEW-PPT-INLINE-004
type: task
title: CLI Agent 生成文件自动预览
status: implemented
owner: Backend B
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-PREVIEW-PPT-INLINE-001
specs:
  - SPEC-PREVIEW-PPT-INLINE-001
source_assets:
  - vibeCodingSummary/PPT内联浏览-实施总结-2026-06-06.md
  - vibeCodingSummary/PPT内联浏览-计划vs实际实施对比-2026-06-06.md
depends_on:
  - TASK-PREVIEW-PPT-INLINE-003
relates_to: []
implements:
  - backend/app/services/adapters/cli_adapter.py
  - backend/.env
traces:
  - TRACE-PREVIEW-PPT-INLINE-001
blocked_by: []
acceptance:
  - CLI Agent 完成后扫描 workspace 中新生成的文档。
  - 生成 PPTX 能上传 MinIO、转换 PDF 并发出 artifact。
  - CLI workspace 不在 backend reload 监听范围内。
---

# CLI Agent 生成文件自动预览

## 目标

支持 Claude Code CLI 等 Agent 在本地 workspace 生成 PPTX 后，自动把文件转成可预览 artifact。

## 前置条件

- CLI Adapter 能感知任务结束。
- artifact 检测和转换管线可复用。

## 预期触达路径

- `backend/app/services/adapters/cli_adapter.py`
- `backend/.env`

## 执行步骤

1. 在 CLI stream 完成前扫描 workspace 新文件。
2. 上传生成的文档到 MinIO。
3. 调用 PPTX 转 PDF 管线。
4. 发出 SSE artifact 事件并持久化。
5. 将 CLI workspace 移出 backend 目录，避免 reload 打断执行。

## 验收标准

- [ ] CLI 生成 PPTX 后聊天中出现 document artifact。
- [ ] workspace 文件变更不反复触发 uvicorn reload。

## 实施记录

见 `TRACE-PREVIEW-PPT-INLINE-001`。

## Obsidian 双链

Related:

- [[SPEC-PREVIEW-PPT-INLINE-001]]
- [[PLAN-PREVIEW-PPT-INLINE-001]]
- [[TASK-PREVIEW-PPT-INLINE-003]]
- [[TRACE-PREVIEW-PPT-INLINE-001]]
