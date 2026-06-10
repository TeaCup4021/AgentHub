---
id: TASK-ARTIFACT-EDIT-WRITEBACK-003
type: task
title: 消息读取折叠版本链
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-ARTIFACT-EDIT-WRITEBACK-001
specs:
  - SPEC-ARTIFACT-EDIT-WRITEBACK-001
source_assets:
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-artifact-edit-writeback.md
depends_on:
  - TASK-ARTIFACT-EDIT-WRITEBACK-001
relates_to: []
implements:
  - backend/app/services/message.py
traces:
  - TRACE-ARTIFACT-EDIT-WRITEBACK-001
blocked_by: []
acceptance:
  - 同一 message_id 和 mergeKey 的 artifact 只保留 version 最大行。
  - 无 mergeKey 的 artifact 以自身 id 独立保留。
  - 不只服务编辑场景，也适用于重流式版本链。
---

# 消息读取折叠版本链

## 目标

避免 CodeCard 编辑后同一消息渲染多个版本的重复卡片。

## 前置条件

- artifact 查询能拿到当前页消息的所有 artifact 行。

## 预期触达路径

- `backend/app/services/message.py`

## 执行步骤

1. 按 `(message_id, _mergeKey or id)` 分组 artifact。
2. 每组保留 version 最大行。
3. 格式化为消息内联 artifact。

## 验收标准

- [ ] 编辑保存后刷新只显示最新代码卡。

## 实施记录

见 `TRACE-ARTIFACT-EDIT-WRITEBACK-001`。

## Obsidian 双链

Related:

- [[SPEC-ARTIFACT-EDIT-WRITEBACK-001]]
- [[PLAN-ARTIFACT-EDIT-WRITEBACK-001]]
- [[TASK-ARTIFACT-EDIT-WRITEBACK-001]]
- [[TRACE-ARTIFACT-EDIT-WRITEBACK-001]]
