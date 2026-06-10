---
id: TASK-ARTIFACT-RICH-CARD-004
type: task
title: 实现前端富媒体卡片
status: implemented
owner: Frontend
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-ARTIFACT-RICH-CARD-001
specs:
  - SPEC-ARTIFACT-RICH-CARD-001
source_assets:
  - archive/development/summaries/AgentHub-富媒体卡片升级-文件预览Diff-实施总结.md
depends_on:
  - TASK-ARTIFACT-RICH-CARD-003
relates_to: []
implements:
  - agenthub-web/src/components/cards/DiffCard.tsx
  - agenthub-web/src/components/cards/FileCard.tsx
  - agenthub-web/src/components/cards/PreviewCard.tsx
  - agenthub-web/src/components/cards/LinkPreviewCard.tsx
  - agenthub-web/src/components/cards/CardRenderer.tsx
  - agenthub-web/src/components/cards/index.ts
  - agenthub-web/src/types/chat.ts
traces:
  - TRACE-ARTIFACT-RICH-CARD-001
blocked_by: []
acceptance:
  - CardRenderer 注册 diff、file、preview 和 link_preview。
  - DiffCard、FileCard、PreviewCard、LinkPreviewCard 可按类型渲染。
  - types/chat.ts 定义对应 content 类型。
---

# 实现前端富媒体卡片

## 目标

让前端能把后端 SSE artifact 渲染成可读、可操作的富媒体卡片。

## 前置条件

- 后端会推送结构化 artifact。
- 前端已有消息列表和 CardRenderer 入口。

## 预期触达路径

- `agenthub-web/src/components/cards/DiffCard.tsx`
- `agenthub-web/src/components/cards/FileCard.tsx`
- `agenthub-web/src/components/cards/PreviewCard.tsx`
- `agenthub-web/src/components/cards/LinkPreviewCard.tsx`
- `agenthub-web/src/components/cards/CardRenderer.tsx`
- `agenthub-web/src/components/cards/index.ts`
- `agenthub-web/src/types/chat.ts`

## 执行步骤

1. 重写 DiffCard，使用 Monaco DiffEditor。
2. 升级 FileCard，支持类型图标、图片缩略图和空状态。
3. 修复 PreviewCard iframe 和全屏体验。
4. 新增 LinkPreviewCard。
5. 更新 CardRenderer 和类型定义。

## 验收标准

- [ ] 四类 artifact 都能进入对应卡片。
- [ ] 卡片具备合理的加载、错误和降级状态。

## 实施记录

见 `TRACE-ARTIFACT-RICH-CARD-001`。

## Obsidian 双链

Related:

- [[SPEC-ARTIFACT-RICH-CARD-001]]
- [[PLAN-ARTIFACT-RICH-CARD-001]]
- [[TASK-ARTIFACT-RICH-CARD-003]]
- [[TRACE-ARTIFACT-RICH-CARD-001]]

