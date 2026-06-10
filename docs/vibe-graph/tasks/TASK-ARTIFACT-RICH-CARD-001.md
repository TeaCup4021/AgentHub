---
id: TASK-ARTIFACT-RICH-CARD-001
type: task
title: 建立文件存储与文件 API
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-ARTIFACT-RICH-CARD-001
specs:
  - SPEC-ARTIFACT-RICH-CARD-001
source_assets:
  - archive/development/summaries/AgentHub-富媒体卡片升级-文件预览Diff-实施总结.md
depends_on: []
relates_to: []
implements:
  - backend/app/services/storage.py
  - backend/app/api/v1/files.py
  - backend/app/schemas/file.py
  - backend/app/api/router.py
traces:
  - TRACE-ARTIFACT-RICH-CARD-001
blocked_by: []
acceptance:
  - 文件上传、下载、content 更新、apply-diff 和 preview 发布端点存在。
  - 文件内容存储通过 MinIO service 封装。
---

# 建立文件存储与文件 API

## 目标

为 FileCard、DiffCard 保存、PreviewCard 发布和后续文档预览提供统一文件基础设施。

## 前置条件

- MinIO 或兼容对象存储可用。
- FastAPI 路由可注册文件 API。

## 预期触达路径

- `backend/app/services/storage.py`
- `backend/app/api/v1/files.py`
- `backend/app/schemas/file.py`
- `backend/app/api/router.py`

## 执行步骤

1. 封装 MinIO 上传、读取、删除和 bucket 初始化。
2. 新增文件 API schema。
3. 提供上传、下载、内容更新、apply-diff 和 preview 发布端点。
4. 注册 files router。

## 验收标准

- [ ] FileCard 可通过 download URL 下载。
- [ ] DiffCard 可另存为文件。
- [ ] PreviewCard 可发布 HTML 预览。

## 实施记录

见 `TRACE-ARTIFACT-RICH-CARD-001`。

## Obsidian 双链

Related:

- [[SPEC-ARTIFACT-RICH-CARD-001]]
- [[PLAN-ARTIFACT-RICH-CARD-001]]
- [[TRACE-ARTIFACT-RICH-CARD-001]]

