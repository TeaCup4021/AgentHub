---
id: TASK-ARTIFACT-RICH-CARD-002
type: task
title: 建立预览服务与 preview_publish
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-ARTIFACT-RICH-CARD-001
specs:
  - SPEC-ARTIFACT-RICH-CARD-001
source_assets:
  - vibeCodingPlan/AgentHub-前后端-富媒体卡片升级方案-文件预览Diff.md
  - docs/ai-collab/decisions/2026-06-04-web-preview-fix.md
depends_on:
  - TASK-ARTIFACT-RICH-CARD-001
relates_to: []
implements:
  - backend/app/services/preview_server.py
  - backend/app/services/adk/cli_tools.py
  - backend/app/core/config.py
  - backend/app/main.py
traces:
  - TRACE-ARTIFACT-RICH-CARD-001
blocked_by: []
acceptance:
  - preview_publish 工具可发布 HTML。
  - 预览服务可返回 HTML 并设置 CSP/sandbox 相关响应头。
  - 预览上传不会阻塞 SSE 事件循环。
---

# 建立预览服务与 preview_publish

## 目标

让 Agent 能生成可交互 HTML 预览，并通过安全隔离的 iframe 呈现。

## 前置条件

- 文件存储和 preview 发布端点可用。
- 后端配置中有 preview 服务 URL 或端口。

## 预期触达路径

- `backend/app/services/preview_server.py`
- `backend/app/services/adk/cli_tools.py`
- `backend/app/core/config.py`
- `backend/app/main.py`

## 执行步骤

1. 实现 Starlette 预览服务。
2. 配置预览服务 URL 和端口。
3. 实现 `preview_publish` 工具。
4. 修复路由挂载和异步上传问题。

## 验收标准

- [ ] 预览 URL 可被 iframe 加载。
- [ ] 预览服务路由不重复包含挂载前缀。
- [ ] MinIO 上传不会阻塞主事件循环。

## 实施记录

见 `TRACE-ARTIFACT-RICH-CARD-001`。

## Obsidian 双链

Related:

- [[SPEC-ARTIFACT-RICH-CARD-001]]
- [[PLAN-ARTIFACT-RICH-CARD-001]]
- [[TASK-ARTIFACT-RICH-CARD-001]]
- [[TRACE-ARTIFACT-RICH-CARD-001]]
