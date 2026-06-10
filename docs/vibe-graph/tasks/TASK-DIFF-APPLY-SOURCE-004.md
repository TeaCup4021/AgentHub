---
id: TASK-DIFF-APPLY-SOURCE-004
type: task
title: 增加测试和断言更新
status: verified
owner: Frontend
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-DIFF-APPLY-SOURCE-001
specs:
  - SPEC-DIFF-APPLY-SOURCE-001
source_assets:
  - docs/ai-collab/decisions/2026-06-05-diff-apply-to-source.md
depends_on:
  - TASK-DIFF-APPLY-SOURCE-001
  - TASK-DIFF-APPLY-SOURCE-002
  - TASK-DIFF-APPLY-SOURCE-003
relates_to: []
implements:
  - agenthub-web/src/lib/__tests__/diffApply.test.ts
  - agenthub-web/src/components/cards/__tests__/CardRenderer.test.tsx
traces:
  - TRACE-DIFF-APPLY-SOURCE-001
blocked_by: []
acceptance:
  - diffApply 单测覆盖主要匹配和失败分支。
  - CardRenderer 测试断言跟随按钮文案更新。
---

# 增加测试和断言更新

## 目标

用单元测试保护启发式匹配算法，避免后续 UI 或文案调整破坏 DiffCard 行为。

## 前置条件

- `diffApply.ts` 和 DiffCard 修改已完成。

## 预期触达路径

- `agenthub-web/src/lib/__tests__/diffApply.test.ts`
- `agenthub-web/src/components/cards/__tests__/CardRenderer.test.tsx`

## 执行步骤

1. 覆盖精确匹配、空白容忍、文件名收窄、整文件替换、无候选和无匹配分支。
2. 更新 DiffCard 按钮文案相关测试。
3. 运行前端测试和类型检查。

## 验收标准

- [ ] 历史记录中 `diffApply.ts` 11 个用例全绿。
- [ ] 前端全量 vitest 历史记录通过。

## 实施记录

见 `TRACE-DIFF-APPLY-SOURCE-001`。

## Obsidian 双链

Related:

- [[SPEC-DIFF-APPLY-SOURCE-001]]
- [[PLAN-DIFF-APPLY-SOURCE-001]]
- [[TASK-DIFF-APPLY-SOURCE-001]]
- [[TASK-DIFF-APPLY-SOURCE-002]]
- [[TASK-DIFF-APPLY-SOURCE-003]]
- [[TRACE-DIFF-APPLY-SOURCE-001]]
