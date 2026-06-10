---
id: TASK-ARTIFACT-EDIT-WRITEBACK-001
type: task
title: 后端追加 artifact 新版本
status: verified
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-ARTIFACT-EDIT-WRITEBACK-001
specs:
  - SPEC-ARTIFACT-EDIT-WRITEBACK-001
source_assets:
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-artifact-edit-writeback.md
depends_on: []
relates_to:
  - TASK-ARTIFACT-RICH-CARD-003
implements:
  - backend/app/services/artifact.py
traces:
  - TRACE-ARTIFACT-EDIT-WRITEBACK-001
blocked_by: []
acceptance:
  - update_content 读取旧 artifact 并复用 mergeKey。
  - 新内容与旧 content 合并，未编辑字段保留。
  - 新版本号为同链最大 version + 1。
---

# 后端追加 artifact 新版本

## 目标

实现编辑保存即追加 artifact 新版本，而不是覆盖旧记录。

## 前置条件

- artifact 表已有 version 和 content 字段。
- append_version 语义已存在。

## 预期触达路径

- `backend/app/services/artifact.py`

## 执行步骤

1. 加载旧 artifact。
2. 复用或生成 `_mergeKey`。
3. 合并 content 字段并刷新 `_eventId`。
4. 查询当前最大版本并插入新行。

## 验收标准

- [ ] 历史单测覆盖版本递增、字段合并和 mergeKey 复用。

## 实施记录

见 `TRACE-ARTIFACT-EDIT-WRITEBACK-001`。

## Obsidian 双链

Related:

- [[SPEC-ARTIFACT-EDIT-WRITEBACK-001]]
- [[PLAN-ARTIFACT-EDIT-WRITEBACK-001]]
- [[TRACE-ARTIFACT-EDIT-WRITEBACK-001]]
