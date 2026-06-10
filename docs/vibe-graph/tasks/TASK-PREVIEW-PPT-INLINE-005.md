---
id: TASK-PREVIEW-PPT-INLINE-005
type: task
title: 前端 DocumentCard 内联渲染
status: implemented
owner: Frontend
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-PREVIEW-PPT-INLINE-001
specs:
  - SPEC-PREVIEW-PPT-INLINE-001
source_assets:
  - vibeCodingPlan/AgentHub-PPT内联浏览-实施计划-v2.md
  - vibeCodingSummary/PPT内联浏览-实施总结-2026-06-06.md
depends_on:
  - TASK-PREVIEW-PPT-INLINE-002
  - TASK-PREVIEW-PPT-INLINE-003
relates_to: []
implements:
  - agenthub-web/src/components/cards/DocumentCard.tsx
traces:
  - TRACE-PREVIEW-PPT-INLINE-001
blocked_by: []
acceptance:
  - DocumentCard 对 pdf 和 pptx 走 iframe 渲染。
  - iframe 加载失败时能显示预览不可用并保留下载。
---

# 前端 DocumentCard 内联渲染

## 目标

前端不引入 PPTX 解析器，直接复用 PDF iframe 渲染转换结果。

## 前置条件

- 后端能返回 PDF fileUrl 或 previewUrl。
- DocumentCard 已有 PDF 渲染能力。

## 预期触达路径

- `agenthub-web/src/components/cards/DocumentCard.tsx`

## 执行步骤

1. 保留 PPTX 跳过 mammoth/XLSX 加载逻辑。
2. 将 iframe 分支从仅 PDF 扩展为 PDF 或 PPTX。
3. 添加 onError 降级。

## 验收标准

- [ ] `fileType=pdf` 正常 iframe 渲染。
- [ ] `fileType=pptx` 尝试 iframe 渲染，失败后显示降级状态。

## 实施记录

见 `TRACE-PREVIEW-PPT-INLINE-001`。

## Obsidian 双链

Related:

- [[SPEC-PREVIEW-PPT-INLINE-001]]
- [[PLAN-PREVIEW-PPT-INLINE-001]]
- [[TASK-PREVIEW-PPT-INLINE-002]]
- [[TASK-PREVIEW-PPT-INLINE-003]]
- [[TRACE-PREVIEW-PPT-INLINE-001]]
