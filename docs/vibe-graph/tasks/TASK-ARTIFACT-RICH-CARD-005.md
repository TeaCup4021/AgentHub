---
id: TASK-ARTIFACT-RICH-CARD-005
type: task
title: 实现前端兜底与下载
status: implemented
owner: Frontend
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-ARTIFACT-RICH-CARD-001
specs:
  - SPEC-ARTIFACT-RICH-CARD-001
source_assets:
  - vibeCodingPlan/AgentHub-前后端-富媒体卡片升级方案-文件预览Diff.md
depends_on:
  - TASK-ARTIFACT-RICH-CARD-004
relates_to: []
implements:
  - agenthub-web/src/components/chat/MessageList.tsx
  - agenthub-web/src/hooks/useBlobDownload.ts
  - agenthub-web/src/lib/api.ts
traces:
  - TRACE-ARTIFACT-RICH-CARD-001
blocked_by: []
acceptance:
  - MessageList 可从消息文本兜底解析 diff 和 URL。
  - 下载使用 fetch+Blob，避免裸链接丢 token。
  - applyDiff API 签名与后端文件 API 对齐。
---

# 实现前端兜底与下载

## 目标

提高卡片渲染鲁棒性，并让下载动作兼容鉴权和 Blob 生命周期。

## 前置条件

- 富媒体卡片组件已经存在。
- 后端 artifact 检测可能漏检某些文本。

## 预期触达路径

- `agenthub-web/src/components/chat/MessageList.tsx`
- `agenthub-web/src/hooks/useBlobDownload.ts`
- `agenthub-web/src/lib/api.ts`

## 执行步骤

1. 在 MessageList 中增加兜底 diff 和 URL 检测。
2. 新增 useBlobDownload hook。
3. 修正 applyDiff API 调用参数。

## 验收标准

- [ ] 后端未发 artifact 时，消息中的 diff 或 URL 仍可有临时卡片。
- [ ] 下载动作可携带 token 并释放 Blob URL。

## 实施记录

见 `TRACE-ARTIFACT-RICH-CARD-001`。

## Obsidian 双链

Related:

- [[SPEC-ARTIFACT-RICH-CARD-001]]
- [[PLAN-ARTIFACT-RICH-CARD-001]]
- [[TASK-ARTIFACT-RICH-CARD-004]]
- [[TRACE-ARTIFACT-RICH-CARD-001]]
