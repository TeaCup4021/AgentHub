---
id: TASK-ARTIFACT-EDIT-WRITEBACK-004
type: task
title: CodeCard 保存回写与缓存刷新
status: implemented
owner: Frontend
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-ARTIFACT-EDIT-WRITEBACK-001
specs:
  - SPEC-ARTIFACT-EDIT-WRITEBACK-001
source_assets:
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-artifact-edit-writeback.md
depends_on:
  - TASK-ARTIFACT-EDIT-WRITEBACK-002
  - TASK-ARTIFACT-EDIT-WRITEBACK-003
relates_to: []
implements:
  - agenthub-web/src/components/cards/CodeCard.tsx
  - agenthub-web/src/lib/queryClient.ts
  - agenthub-web/src/lib/api.ts
  - agenthub-web/src/App.tsx
traces:
  - TRACE-ARTIFACT-EDIT-WRITEBACK-001
blocked_by: []
acceptance:
  - 持久化 CodeCard 调 updateArtifact。
  - 保存后失效 messages 查询。
  - fallback CodeCard 降级为本地下载。
---

# CodeCard 保存回写与缓存刷新

## 目标

让前端 CodeCard 的保存按钮真正写回后端，并刷新消息视图。

## 前置条件

- Artifact update API 可用。
- 消息读取已折叠版本链。

## 预期触达路径

- `agenthub-web/src/components/cards/CodeCard.tsx`
- `agenthub-web/src/lib/queryClient.ts`
- `agenthub-web/src/lib/api.ts`
- `agenthub-web/src/App.tsx`

## 执行步骤

1. 抽出或使用 queryClient 缓存刷新能力。
2. CodeCard 保存时判断 artifact 是否可持久化。
3. 可持久化时调用 updateArtifact。
4. fallback 时走 Blob 下载。

## 验收标准

- [ ] 持久化卡保存后刷新消息。
- [ ] fallback 卡不会调用不存在的 artifact id。

## 实施记录

见 `TRACE-ARTIFACT-EDIT-WRITEBACK-001`。

## Obsidian 双链

Related:

- [[SPEC-ARTIFACT-EDIT-WRITEBACK-001]]
- [[PLAN-ARTIFACT-EDIT-WRITEBACK-001]]
- [[TASK-ARTIFACT-EDIT-WRITEBACK-002]]
- [[TASK-ARTIFACT-EDIT-WRITEBACK-003]]
- [[TRACE-ARTIFACT-EDIT-WRITEBACK-001]]
