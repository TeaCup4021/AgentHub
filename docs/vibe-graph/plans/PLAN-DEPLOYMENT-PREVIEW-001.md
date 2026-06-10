---
id: PLAN-DEPLOYMENT-PREVIEW-001
type: plan
title: 轻量级部署预览历史实施计划映射
status: implemented
owner: Backend B
created: 2026-06-10
updated: 2026-06-10
specs:
  - SPEC-DEPLOYMENT-PREVIEW-001
source_assets:
  - archive/development/summaries/deployment-feature-2026-06-07.md
  - archive/development/summaries/cli-deploy-card-fix-2026-06-07.md
depends_on:
  - PLAN-ARTIFACT-RICH-CARD-001
relates_to: []
tasks:
  - TASK-DEPLOYMENT-PREVIEW-001
  - TASK-DEPLOYMENT-PREVIEW-002
  - TASK-DEPLOYMENT-PREVIEW-003
  - TASK-DEPLOYMENT-PREVIEW-004
  - TASK-DEPLOYMENT-PREVIEW-005
review:
  required: true
  confirmed_by: historical-summary
  confirmed_at: 2026-06-07
risks:
  - 本地 HTTP server 进程隔离有限。
  - AgentHub 进程重启后部署生命周期不持久。
  - 静态文件扫描需要严格路径边界，避免泄露 workspace 外文件。
verification:
  - command: backend startup
    result: passed
    notes: 历史 summary 记录后端启动成功，无 import 错误。
  - command: database migration
    result: passed
    notes: 历史 summary 记录 migration 成功。
  - command: pytest backend/tests/services/test_artifact_detector.py backend/tests/services/test_artifact_service.py
    result: passed
    notes: CLI deploy card fix summary 记录 10 passed。
  - command: py_compile artifact_detector cli_adapter deployment
    result: passed
    notes: CLI deploy card fix summary 记录通过。
  - command: npm.cmd run build
    result: passed
    notes: CLI deploy card fix summary 记录通过，存在既有 bundle warning。
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 本次补录后运行。
---

# 轻量级部署预览历史实施计划映射

## 来源 Spec

- `SPEC-DEPLOYMENT-PREVIEW-001`: 静态网页轻量部署、状态卡和 CLI fallback。

## 实施目标

将轻量部署功能和后续 deploy card 修复沉淀为图谱节点，明确部署生命周期、前后端交互、artifact 检测和验证结果。

## 实施范围

- `backend/app/models/deployment.py`
- `backend/app/services/deployment.py`
- `backend/app/services/deployment_source.py`
- `backend/app/services/deployment_command.py`
- `backend/app/api/v1/deployments.py`
- `backend/app/schemas/deployment.py`
- `backend/app/services/artifact_detector.py`
- `backend/app/services/adapters/cli_adapter.py`
- `agenthub-web/src/components/cards/DeployStatusCard.tsx`
- `CardRenderer`、`MessageList`、`ChatArea`

## 方案

1. 建立 deployment 数据模型、schema、migration 和 API。
2. 实现 DeploymentService，负责端口分配、进程启动、状态检测、停止和清理。
3. 扩展 artifact_detector 支持 deploy_status。
4. 前端 DeployStatusCard 自动触发部署和轮询状态。
5. 修复 CLI artifact 解析和 fallback 文件扫描。

## Task 拆分

| Task ID | 标题 | 预期触达路径 | 验收点 |
| --- | --- | --- | --- |
| `TASK-DEPLOYMENT-PREVIEW-001` | 建立部署模型和 API | `models/deployment.py`, `api/v1/deployments.py`, `schemas/deployment.py` | 创建、查询、停止、列表、清理端点。 |
| `TASK-DEPLOYMENT-PREVIEW-002` | 实现部署服务与端口管理 | `services/deployment.py`, `deployment_source.py`, `deployment_command.py` | 端口分配、进程管理、路径边界。 |
| `TASK-DEPLOYMENT-PREVIEW-003` | 解析 deploy_status artifact | `artifact_detector.py`, `cli_adapter.py` | XML 属性顺序兼容和 CLI fallback。 |
| `TASK-DEPLOYMENT-PREVIEW-004` | 前端 DeployStatusCard | `DeployStatusCard.tsx`, `CardRenderer.tsx`, `MessageList.tsx`, `ChatArea.tsx` | 自动部署、轮询、停止。 |
| `TASK-DEPLOYMENT-PREVIEW-005` | 验证与回归修复 | tests 和 build | 后端测试、py_compile、前端 build。 |

## 契约与兼容性

- 继续通过 artifact 卡片表达部署请求和状态。
- 部署 API 使用统一 `/api/v1/deployments` 前缀。
- DeployStatusCard 优先使用 artifact 已提供的 deployment 数据；只有 `DEPLOY_REQUEST` 才主动调用部署 API。

## 风险

- 本地进程部署不适合作为生产托管。
- 清理僵尸部署依赖进程状态检测。
- 端到端测试需要真实浏览器和本地端口。

## 验证计划

- [ ] 后端启动和 migration。
- [ ] 创建部署、查询状态、停止部署。
- [ ] CLI 生成静态文件 fallback。
- [ ] 前端 build。
- [ ] Vibe Graph 校验。

## Review

该节点为历史补录，review 信息来自 2026-06-07 summary。

## Obsidian 双链

Related:

- [[SPEC-DEPLOYMENT-PREVIEW-001]]
- [[TASK-DEPLOYMENT-PREVIEW-001]]
- [[TASK-DEPLOYMENT-PREVIEW-002]]
- [[TASK-DEPLOYMENT-PREVIEW-003]]
- [[TASK-DEPLOYMENT-PREVIEW-004]]
- [[TASK-DEPLOYMENT-PREVIEW-005]]
- [[TRACE-DEPLOYMENT-PREVIEW-001]]

