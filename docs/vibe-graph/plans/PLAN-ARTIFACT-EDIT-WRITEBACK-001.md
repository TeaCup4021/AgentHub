---
id: PLAN-ARTIFACT-EDIT-WRITEBACK-001
type: plan
title: 代码产物编辑回写历史实施计划映射
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
specs:
  - SPEC-ARTIFACT-EDIT-WRITEBACK-001
source_assets:
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-artifact-edit-writeback.md
depends_on:
  - PLAN-ARTIFACT-RICH-CARD-001
relates_to:
  - PLAN-DIFF-APPLY-SOURCE-001
tasks:
  - TASK-ARTIFACT-EDIT-WRITEBACK-001
  - TASK-ARTIFACT-EDIT-WRITEBACK-002
  - TASK-ARTIFACT-EDIT-WRITEBACK-003
  - TASK-ARTIFACT-EDIT-WRITEBACK-004
review:
  required: true
  confirmed_by: historical-decision
  confirmed_at: 2026-06-05
risks:
  - artifact 表行数会随编辑次数增长。
  - queryClient 单例是全局可变状态，需保持单根 React 应用假设。
  - 端到端编辑保存仍需真实 UI 联调确认。
verification:
  - command: backend app.main import and route registration
    result: passed
    notes: 历史 ADR 记录后端启动和 PATCH 路由注册通过。
  - command: update_content unit tests
    result: passed
    notes: 历史 ADR 记录版本递增、字段合并、merge_key 复用通过。
  - command: tsc
    result: passed
    notes: 历史 ADR 记录前端类型检查 0 错误。
  - command: CardRenderer tests
    result: passed
    notes: 历史 ADR 记录通过。
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 本次补录后运行。
---

# 代码产物编辑回写历史实施计划映射

## 来源 Spec

- `SPEC-ARTIFACT-EDIT-WRITEBACK-001`: CodeCard 编辑保存后持久化到 artifact 版本链。

## 实施目标

让代码卡保存变成真正的后端持久化，并与已有 artifact 版本链和消息读取逻辑对齐。

## 实施范围

- `backend/app/services/artifact.py`
- `backend/app/api/v1/messages.py`
- `backend/app/schemas/message.py`
- `backend/app/services/message.py`
- `agenthub-web/src/components/cards/CodeCard.tsx`
- `agenthub-web/src/lib/queryClient.ts`
- `agenthub-web/src/lib/api.ts`
- `agenthub-web/src/App.tsx`

## 方案

1. 后端新增 `ArtifactService.update_content`。
2. 新增 artifact update schema 和 PATCH 路由。
3. 消息读取侧按 `(message_id, _mergeKey or id)` 折叠版本链。
4. 前端 CodeCard 保存时调用 update API 并刷新消息缓存。
5. fallback CodeCard 降级下载。

## Task 拆分

| Task ID | 标题 | 预期触达路径 | 验收点 |
| --- | --- | --- | --- |
| `TASK-ARTIFACT-EDIT-WRITEBACK-001` | 后端追加 artifact 新版本 | `artifact.py` | update_content 追加版本并合并字段。 |
| `TASK-ARTIFACT-EDIT-WRITEBACK-002` | 暴露 artifact update API | `messages.py`, `schemas/message.py` | PATCH 路由返回 ArtifactBrief。 |
| `TASK-ARTIFACT-EDIT-WRITEBACK-003` | 消息读取折叠版本链 | `message.py` | 同一 mergeKey 只渲染最新版本。 |
| `TASK-ARTIFACT-EDIT-WRITEBACK-004` | CodeCard 保存回写与缓存刷新 | `CodeCard.tsx`, `queryClient.ts`, `api.ts`, `App.tsx` | 保存后刷新，fallback 下载。 |

## 契约与兼容性

- 复用现有 artifact content 结构。
- 不改变消息列表 API 的总体响应结构。
- 新增 PATCH 路由只面向 artifact 内容更新。

## 风险

- 长期版本行增长需要后续归档策略。
- 版本历史 UI 尚未实现，用户只能看到最新版。
- 端到端保存刷新仍需真实联调。

## 验证计划

- [ ] update_content 单测。
- [ ] 后端路由注册。
- [ ] 前端类型检查。
- [ ] CardRenderer 测试。
- [ ] 端到端保存刷新联调。

## Review

该节点为历史补录，review 信息来自 2026-06-05 ADR。

## Obsidian 双链

Related:

- [[SPEC-ARTIFACT-EDIT-WRITEBACK-001]]
- [[TASK-ARTIFACT-EDIT-WRITEBACK-001]]
- [[TASK-ARTIFACT-EDIT-WRITEBACK-002]]
- [[TASK-ARTIFACT-EDIT-WRITEBACK-003]]
- [[TASK-ARTIFACT-EDIT-WRITEBACK-004]]
- [[TRACE-ARTIFACT-EDIT-WRITEBACK-001]]
