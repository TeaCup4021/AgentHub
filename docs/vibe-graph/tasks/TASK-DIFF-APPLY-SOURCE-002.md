---
id: TASK-DIFF-APPLY-SOURCE-002
type: task
title: DiffCard 应用到源文件
status: implemented
owner: Frontend
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-DIFF-APPLY-SOURCE-001
specs:
  - SPEC-DIFF-APPLY-SOURCE-001
source_assets:
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-diff-apply-to-source.md
depends_on:
  - TASK-DIFF-APPLY-SOURCE-001
relates_to:
  - TASK-ARTIFACT-RICH-CARD-004
implements:
  - agenthub-web/src/components/cards/DiffCard.tsx
  - agenthub-web/src/lib/queryClient.ts
  - agenthub-web/src/lib/api.ts
traces:
  - TRACE-DIFF-APPLY-SOURCE-001
blocked_by: []
acceptance:
  - DiffCard 能从消息缓存收集代码候选。
  - 匹配成功后调用 artifact update API。
  - 保存成功后失效 messages 查询。
  - fallback 或无匹配时降级提示。
---

# DiffCard 应用到源文件

## 目标

在 DiffCard UI 中提供“应用到源文件”按钮，把 diff 写回源代码卡的新版本。

## 前置条件

- `diffApply.ts` 纯函数已实现。
- artifact 编辑回写 API 可用。
- queryClient 单例可读取消息缓存。

## 预期触达路径

- `agenthub-web/src/components/cards/DiffCard.tsx`
- `agenthub-web/src/lib/queryClient.ts`
- `agenthub-web/src/lib/api.ts`

## 执行步骤

1. 从 `["messages", convId]` 缓存收集 code artifact 候选。
2. 调用 `findApplyTarget`。
3. 匹配成功后调用 `messageApi.updateArtifact`。
4. 失效 messages 查询刷新 UI。
5. 保留另存为文件路径。

## 验收标准

- [ ] 最近代码卡优先被选为候选。
- [ ] 成功写回后刷新消息仍显示新版本。
- [ ] 无法匹配时不写错目标。

## 实施记录

见 `TRACE-DIFF-APPLY-SOURCE-001`。

## Obsidian 双链

Related:

- [[SPEC-DIFF-APPLY-SOURCE-001]]
- [[PLAN-DIFF-APPLY-SOURCE-001]]
- [[TASK-DIFF-APPLY-SOURCE-001]]
- [[TRACE-DIFF-APPLY-SOURCE-001]]

