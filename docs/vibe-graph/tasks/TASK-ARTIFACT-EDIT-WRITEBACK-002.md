---
id: TASK-ARTIFACT-EDIT-WRITEBACK-002
type: task
title: 暴露 artifact update API
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
  - backend/app/api/v1/messages.py
  - backend/app/schemas/message.py
traces:
  - TRACE-ARTIFACT-EDIT-WRITEBACK-001
blocked_by: []
acceptance:
  - PATCH /messages/artifacts/{artifact_id} 存在。
  - 请求体为 content dict。
  - artifact 不存在时返回 404。
  - 成功时返回 ArtifactBrief。
---

# 暴露 artifact update API

## 目标

为前端 CodeCard 提供编辑保存入口。

## 前置条件

- `ArtifactService.update_content` 已实现。

## 预期触达路径

- `backend/app/api/v1/messages.py`
- `backend/app/schemas/message.py`

## 执行步骤

1. 定义 `ArtifactUpdate` schema。
2. 新增 PATCH 路由。
3. 调用 ArtifactService 并格式化为 ArtifactBrief。
4. 处理不存在 artifact 的 404。

## 验收标准

- [ ] PATCH 路由注册成功。
- [ ] 前端可通过 API 保存 CodeCard。

## 实施记录

见 `TRACE-ARTIFACT-EDIT-WRITEBACK-001`。

## Obsidian 双链

Related:

- [[SPEC-ARTIFACT-EDIT-WRITEBACK-001]]
- [[PLAN-ARTIFACT-EDIT-WRITEBACK-001]]
- [[TASK-ARTIFACT-EDIT-WRITEBACK-001]]
- [[TRACE-ARTIFACT-EDIT-WRITEBACK-001]]
