---
id: TASK-DEPLOYMENT-PREVIEW-001
type: task
title: 建立部署模型和 API
status: implemented
owner: Backend B
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-DEPLOYMENT-PREVIEW-001
specs:
  - SPEC-DEPLOYMENT-PREVIEW-001
source_assets:
  - archive/development/summaries/deployment-feature-2026-06-07.md
depends_on: []
relates_to: []
implements:
  - backend/app/models/deployment.py
  - backend/app/api/v1/deployments.py
  - backend/app/schemas/deployment.py
  - backend/alembic/versions/2cb4272008eb_add_deployment_table.py
  - backend/app/api/router.py
traces:
  - TRACE-DEPLOYMENT-PREVIEW-001
blocked_by: []
acceptance:
  - deployments 表和 schema 存在。
  - 创建、查询、停止、列表、清理端点存在。
  - router 注册 deployments API。
---

# 建立部署模型和 API

## 目标

为轻量部署建立持久化记录和 REST 生命周期接口。

## 前置条件

- 会话和用户身份体系可用。
- Alembic migration 可执行。

## 预期触达路径

- `backend/app/models/deployment.py`
- `backend/app/api/v1/deployments.py`
- `backend/app/schemas/deployment.py`
- `backend/alembic/versions/2cb4272008eb_add_deployment_table.py`
- `backend/app/api/router.py`

## 执行步骤

1. 新增 deployment ORM 模型。
2. 新增 Pydantic schema。
3. 新增 REST API。
4. 新增 migration。
5. 注册路由。

## 验收标准

- [ ] API 能创建部署记录。
- [ ] API 能查询、停止和清理部署。

## 实施记录

见 `TRACE-DEPLOYMENT-PREVIEW-001`。

## Obsidian 双链

Related:

- [[SPEC-DEPLOYMENT-PREVIEW-001]]
- [[PLAN-DEPLOYMENT-PREVIEW-001]]
- [[TRACE-DEPLOYMENT-PREVIEW-001]]

