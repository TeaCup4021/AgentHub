---
id: TRACE-DEPLOYMENT-PREVIEW-001
type: trace
title: 轻量级部署预览历史实施追踪
status: partial
owner: Backend B
created: 2026-06-10
updated: 2026-06-10
tasks:
  - TASK-DEPLOYMENT-PREVIEW-001
  - TASK-DEPLOYMENT-PREVIEW-002
  - TASK-DEPLOYMENT-PREVIEW-003
  - TASK-DEPLOYMENT-PREVIEW-004
  - TASK-DEPLOYMENT-PREVIEW-005
source_assets:
  - vibeCodingSummary/deployment-feature-2026-06-07.md
  - vibeCodingSummary/cli-deploy-card-fix-2026-06-07.md
  - vibeCodingSummary/cli-deploy-existing-file-link-fix-2026-06-07.md
depends_on:
  - TRACE-ARTIFACT-RICH-CARD-001
relates_to: []
implements:
  - backend/app/models/deployment.py
  - backend/app/services/deployment.py
  - backend/app/services/deployment_source.py
  - backend/app/services/deployment_command.py
  - backend/app/api/v1/deployments.py
  - backend/app/schemas/deployment.py
  - backend/alembic/versions/2cb4272008eb_add_deployment_table.py
  - backend/app/api/router.py
  - backend/app/services/artifact_detector.py
  - backend/app/services/adapters/cli_adapter.py
  - agenthub-web/src/components/cards/DeployStatusCard.tsx
  - agenthub-web/src/components/cards/CardRenderer.tsx
  - agenthub-web/src/components/chat/MessageList.tsx
  - agenthub-web/src/components/layout/ChatArea.tsx
  - backend/tests/services/test_artifact_detector.py
  - backend/tests/services/test_artifact_service.py
  - backend/tests/services/adapters/test_cli_adapter_deployment.py
  - backend/tests/services/test_deployment_service_phase2.py
  - backend/tests/services/test_deployment_source.py
  - backend/tests/services/test_deployment_command.py
summaries:
  - vibeCodingSummary/deployment-feature-2026-06-07.md
  - vibeCodingSummary/cli-deploy-card-fix-2026-06-07.md
  - vibeCodingSummary/vibe-graph-artifact-diff-deployment-backfill-2026-06-10.md
verification:
  - command: backend startup
    result: passed
    notes: deployment-feature summary 记录后端启动成功，无 import 错误。
  - command: database migration
    result: passed
    notes: deployment-feature summary 记录数据库迁移成功。
  - command: pytest backend/tests/services/test_artifact_detector.py backend/tests/services/test_artifact_service.py
    result: passed
    notes: cli-deploy-card-fix summary 记录 10 passed。
  - command: py_compile artifact_detector cli_adapter deployment
    result: passed
    notes: cli-deploy-card-fix summary 记录通过。
  - command: npm.cmd run build
    result: passed
    notes: cli-deploy-card-fix summary 记录通过，有既有 lottie-web 和 chunk size warnings。
  - command: end-to-end deployment
    result: not_run
    notes: deployment-feature summary 标注待用户验证。
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 本次补录后运行通过。
deviations:
  - plan_item: Agent 明确输出 deploy_status XML artifact。
    actual: 后续修复增加 CLI fallback，扫描真实生成的静态文件并直接创建部署 artifact。
    reason: Claude Code CLI 测试中只创建了文件但未稳定输出 XML artifact。
  - plan_item: DeployStatusCard 对 DEPLOY_REQUEST 调 API。
    actual: 卡片优先使用 artifact 中已有 deployment 数据，只有 DEPLOY_REQUEST 才调用 API。
    reason: 避免 fallback 已部署场景重复创建部署。
followups:
  - 真实端到端部署仍需用户环境验证。
  - 后续可演进到 MinIO + nginx 静态托管或 Docker 容器化部署。
---

# 轻量级部署预览历史实施追踪

## 对应任务

- `TASK-DEPLOYMENT-PREVIEW-001`
- `TASK-DEPLOYMENT-PREVIEW-002`
- `TASK-DEPLOYMENT-PREVIEW-003`
- `TASK-DEPLOYMENT-PREVIEW-004`
- `TASK-DEPLOYMENT-PREVIEW-005`

## 实际触达路径

见 frontmatter `implements`。

## 实施摘要

历史实现提供了本地静态网页轻量部署能力。后端维护部署记录、分配端口并启动 HTTP server 进程，前端 DeployStatusCard 自动触发部署并轮询状态。后续修复增强了 deploy_status artifact 解析、CLI fallback、路径边界检查和前端 API 路径。

## 验证结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `backend startup` | `passed` | 历史 summary 记录后端启动成功。 |
| `database migration` | `passed` | 历史 summary 记录 migration 成功。 |
| `pytest backend/tests/services/test_artifact_detector.py backend/tests/services/test_artifact_service.py` | `passed` | 历史 summary 记录 10 passed。 |
| `py_compile artifact_detector cli_adapter deployment` | `passed` | 历史 summary 记录通过。 |
| `npm.cmd run build` | `passed` | 历史 summary 记录通过，有既有 warning。 |
| `end-to-end deployment` | `not_run` | 历史 summary 标注待用户验证；本次未重新运行。 |
| `python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph` | `passed` | 本次补录后运行通过。 |

## 与计划的偏差

| 计划项 | 当前观察 | 原因 |
| --- | --- | --- |
| 依赖 Agent 输出 XML deploy_status | 增加 CLI fallback 扫描静态文件并发出 artifact | CLI 真实生成文件时不一定输出 XML。 |
| 前端总是调用部署 API | 已有 deployment 数据时直接渲染 | 避免重复创建部署。 |

## 后续事项

- 做一次真实端到端部署验证。
- 评估持久化静态站点托管或容器化部署后续方案。

## Summary 链接

- `vibeCodingSummary/deployment-feature-2026-06-07.md`
- `vibeCodingSummary/cli-deploy-card-fix-2026-06-07.md`
- `vibeCodingSummary/vibe-graph-artifact-diff-deployment-backfill-2026-06-10.md`

## Obsidian 双链

Related:

- [[SPEC-DEPLOYMENT-PREVIEW-001]]
- [[PLAN-DEPLOYMENT-PREVIEW-001]]
- [[TASK-DEPLOYMENT-PREVIEW-001]]
- [[TASK-DEPLOYMENT-PREVIEW-002]]
- [[TASK-DEPLOYMENT-PREVIEW-003]]
- [[TASK-DEPLOYMENT-PREVIEW-004]]
- [[TASK-DEPLOYMENT-PREVIEW-005]]
- [[TRACE-ARTIFACT-RICH-CARD-001]]
