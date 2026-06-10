---
id: PLAN-DIFF-APPLY-SOURCE-001
type: plan
title: Diff 应用到源产物历史实施计划映射
status: implemented
owner: Frontend
created: 2026-06-10
updated: 2026-06-10
specs:
  - SPEC-DIFF-APPLY-SOURCE-001
source_assets:
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-diff-apply-to-source.md
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-artifact-edit-writeback.md
depends_on:
  - PLAN-ARTIFACT-RICH-CARD-001
relates_to: []
tasks:
  - TASK-DIFF-APPLY-SOURCE-001
  - TASK-DIFF-APPLY-SOURCE-002
  - TASK-DIFF-APPLY-SOURCE-003
  - TASK-DIFF-APPLY-SOURCE-004
review:
  required: true
  confirmed_by: historical-decision
  confirmed_at: 2026-06-05
risks:
  - 启发式匹配存在误匹配或无匹配风险。
  - filename-full 分支可能在 Agent 只返回片段时覆盖整卡。
  - fallback 卡无法写回后端。
verification:
  - command: npm test -- diffApply
    result: passed
    notes: 历史 ADR 记录 diffApply.ts 单测 11 用例全绿。
  - command: tsc -b
    result: passed
    notes: 历史 ADR 记录前端类型检查 0 错误。
  - command: vitest run
    result: passed
    notes: 历史 ADR 记录前端全量 104 用例通过。
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 本次补录后运行。
---

# Diff 应用到源产物历史实施计划映射

## 来源 Spec

- `SPEC-DIFF-APPLY-SOURCE-001`: DiffCard 将 Agent 产出的 diff 回写到会话中的源代码卡。

## 实施目标

补齐选区改写闭环的最后一步，让用户能在 DiffCard 上一键接受改动，并让结果持久化在源代码卡版本链中。

## 实施范围

- `agenthub-web/src/lib/diffApply.ts`
- `agenthub-web/src/components/cards/DiffCard.tsx`
- `agenthub-web/src/lib/__tests__/diffApply.test.ts`
- `backend/app/services/artifact_format.py`
- `agenthub-web/src/components/cards/__tests__/CardRenderer.test.tsx`

## 方案

1. 将匹配和 splice 逻辑抽成纯函数。
2. DiffCard 从 React Query 消息缓存收集代码卡候选。
3. 优先用 `oldCode` 内容片段定位源卡，文件名作为收窄或退化线索。
4. 匹配成功后复用 artifact update_content API。
5. 后端增强选区改写指令，提高 Agent 输出可匹配性。
6. 用单元测试覆盖匹配分支。

## Task 拆分

| Task ID | 标题 | 预期触达路径 | 验收点 |
| --- | --- | --- | --- |
| `TASK-DIFF-APPLY-SOURCE-001` | 实现 diffApply 纯函数匹配 | `agenthub-web/src/lib/diffApply.ts` | 内容匹配、文件名收窄、整文件替换和无匹配分支。 |
| `TASK-DIFF-APPLY-SOURCE-002` | DiffCard 应用到源文件 | `agenthub-web/src/components/cards/DiffCard.tsx` | 收集候选、调用 API、刷新消息。 |
| `TASK-DIFF-APPLY-SOURCE-003` | 增强选区改写指令 | `backend/app/services/artifact_format.py` | Agent 更可能输出 file 和逐字 before。 |
| `TASK-DIFF-APPLY-SOURCE-004` | 增加测试和断言更新 | `diffApply.test.ts`, `CardRenderer.test.tsx` | 关键分支单测通过。 |

## 契约与兼容性

- 复用既有 `PATCH /messages/artifacts/{artifact_id}`。
- 不要求 Diff artifact 携带源 artifact id。
- 保留 DiffCard “另存为文件”路径，语义不同于应用到源文件。

## 风险

- 同一会话中多张相似代码卡可能导致误匹配。
- Agent 输出 before 段不完整时匹配失败。
- 端到端仍需真实 UI 联调确认。

## 验证计划

- [ ] `diffApply.ts` 单元测试。
- [ ] 前端类型检查。
- [ ] CardRenderer 断言更新。
- [ ] 端到端选区改写联调。
- [ ] Vibe Graph 校验。

## Review

该节点为历史补录，review 信息来自 2026-06-05 ADR。

## Obsidian 双链

Related:

- [[SPEC-DIFF-APPLY-SOURCE-001]]
- [[TASK-DIFF-APPLY-SOURCE-001]]
- [[TASK-DIFF-APPLY-SOURCE-002]]
- [[TASK-DIFF-APPLY-SOURCE-003]]
- [[TASK-DIFF-APPLY-SOURCE-004]]
- [[TRACE-DIFF-APPLY-SOURCE-001]]

