---
id: TASK-DIFF-APPLY-SOURCE-001
type: task
title: 实现 diffApply 纯函数匹配
status: implemented
owner: Frontend
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-DIFF-APPLY-SOURCE-001
specs:
  - SPEC-DIFF-APPLY-SOURCE-001
source_assets:
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-diff-apply-to-source.md
depends_on: []
relates_to: []
implements:
  - agenthub-web/src/lib/diffApply.ts
traces:
  - TRACE-DIFF-APPLY-SOURCE-001
blocked_by: []
acceptance:
  - 支持精确子串匹配。
  - 支持空白容忍逐行匹配。
  - 支持文件名收窄和 filename-full 退化。
  - 无候选或无匹配时返回失败结果。
---

# 实现 diffApply 纯函数匹配

## 目标

将 Diff 应用目标匹配和代码替换逻辑从组件中抽离，便于测试和复用。

## 前置条件

- Diff artifact 包含 `oldCode` 和 `newCode`。
- 会话中存在候选 code artifact。

## 预期触达路径

- `agenthub-web/src/lib/diffApply.ts`

## 执行步骤

1. 定义 `CodeCandidate` 和匹配结果类型。
2. 实现 `applySnippet`。
3. 实现 `findApplyTarget`。
4. 返回清晰的 matchType 或 error。

## 验收标准

- [ ] 纯函数不依赖 React、queryClient 或组件状态。
- [ ] 匹配失败不产生写回结果。

## 实施记录

见 `TRACE-DIFF-APPLY-SOURCE-001`。

## Obsidian 双链

Related:

- [[SPEC-DIFF-APPLY-SOURCE-001]]
- [[PLAN-DIFF-APPLY-SOURCE-001]]
- [[TRACE-DIFF-APPLY-SOURCE-001]]

