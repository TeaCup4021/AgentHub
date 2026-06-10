---
id: SPEC-DIFF-APPLY-SOURCE-001
type: spec
title: Diff 应用到源产物
status: implemented
owner: Frontend
created: 2026-06-10
updated: 2026-06-10
source_assets:
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-diff-apply-to-source.md
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-artifact-edit-writeback.md
  - archive/development/summaries/对话式局部修改-选区级改写-summary.md
depends_on:
  - SPEC-ARTIFACT-RICH-CARD-001
relates_to:
  - SPEC-AICOLLAB-VIBE-GRAPH-001
plans:
  - PLAN-DIFF-APPLY-SOURCE-001
acceptance:
  - DiffCard 能从会话消息缓存收集候选源代码卡。
  - 匹配优先使用 diff oldCode 片段内容，文件名只作为次要线索。
  - 匹配成功后通过 artifact update_content 版本链追加源卡新版本。
  - 匹配失败、fallback 卡或不确定场景有明确降级提示，不静默写错。
  - 匹配算法具备纯函数单元测试覆盖。
non_goals:
  - 保证任意 Agent 输出 diff 都 100% 匹配源卡。
  - 将 Diff 另存为文件和应用到源文件统一为一个语义。
  - 为所有 artifact 类型建立显式外键回链。
contracts:
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-artifact-edit-writeback.md
---

# Diff 应用到源产物

## 背景

选区级改写落地后，Agent 可以返回 DiffCard，但用户仍需要手动把 diff 内容复制回源代码卡。由于 Agent 不知道后端 artifact id，diff 卡无法携带显式源卡外键，只能通过会话缓存里的代码卡内容和文件名进行启发式回链。

## 目标

- 在 DiffCard 中提供“应用到源文件”能力。
- 用 diff 的 `oldCode` 片段定位源代码卡。
- 将 `newCode` splice 回源卡全文，并复用 artifact 版本链保存。
- 将匹配算法做成纯函数并用单元测试覆盖。
- 失败时明确提示用户手动复制。

## 范围

- 前端 `diffApply.ts` 纯函数匹配和 splice。
- 前端 DiffCard 收集候选、调用匹配、调用 update artifact API。
- 后端选区改写指令增强，鼓励 Agent 输出 `file=` 和逐字 before 段。
- 前端测试覆盖匹配分支。

## 非目标

- 不新增后端专用 Diff 回写端点。
- 不假设 Agent 能看到我方 artifact id。
- 不处理跨多个不连续片段的复杂 patch。
- 不保证同名高度相似代码卡永远匹配正确。

## 输入

- DiffCard 中的 `fileName`、`oldCode`、`newCode`。
- React Query `["messages", convId]` 缓存中的代码 artifact 候选。
- 后端 artifact update API。

## 输出

- 源代码卡的新版本。
- 刷新后仍保留的新代码内容。
- 匹配成功、整文件替换、无匹配或 fallback 降级的 UI 反馈。

## 关键约束

- 内容匹配优先于文件名匹配。
- React Query 消息缓存是最新在前，收集候选时不能再反向取旧卡。
- fallback 卡没有 DB 行，不能写回。
- 写回复用 `PATCH /messages/artifacts/{artifact_id}` 版本链语义。

## 验收标准

- [ ] 精确子串匹配可把 diff 应用到源代码全文。
- [ ] 空白容忍逐行匹配可处理选区缩进差异。
- [ ] 文件名匹配但片段定位失败时有明确整文件替换策略。
- [ ] 无匹配时提示用户手动复制。
- [ ] 单元测试覆盖成功、降级和失败分支。

## 追溯

- Plan: `PLAN-DIFF-APPLY-SOURCE-001`
- Tasks: `TASK-DIFF-APPLY-SOURCE-001` 至 `TASK-DIFF-APPLY-SOURCE-004`
- Trace: `TRACE-DIFF-APPLY-SOURCE-001`

## Obsidian 双链

Related:

- [[PLAN-DIFF-APPLY-SOURCE-001]]
- [[TASK-DIFF-APPLY-SOURCE-001]]
- [[TASK-DIFF-APPLY-SOURCE-002]]
- [[TASK-DIFF-APPLY-SOURCE-003]]
- [[TASK-DIFF-APPLY-SOURCE-004]]
- [[TRACE-DIFF-APPLY-SOURCE-001]]
- [[SPEC-ARTIFACT-RICH-CARD-001]]

