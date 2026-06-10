---
id: TASK-DEPLOYMENT-PREVIEW-003
type: task
title: 解析 deploy_status artifact
status: implemented
owner: Backend B
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-DEPLOYMENT-PREVIEW-001
specs:
  - SPEC-DEPLOYMENT-PREVIEW-001
source_assets:
  - archive/development/summaries/cli-deploy-card-fix-2026-06-07.md
depends_on:
  - TASK-DEPLOYMENT-PREVIEW-002
relates_to:
  - TASK-ARTIFACT-RICH-CARD-003
implements:
  - backend/app/services/artifact_detector.py
  - backend/app/services/adapters/cli_adapter.py
  - backend/tests/services/test_artifact_detector.py
  - backend/tests/services/test_artifact_service.py
traces:
  - TRACE-DEPLOYMENT-PREVIEW-001
blocked_by: []
acceptance:
  - artifact_detector 支持 deploy_status。
  - 自闭合 artifact 支持任意属性顺序和单双引号。
  - CLI 未输出 XML artifact 时可扫描生成文件并 emit deploy_status。
  - artifact XML 被剥离后不会重复生成 link card。
---

# 解析 deploy_status artifact

## 目标

让 Agent 或 CLI 生成部署请求时，后端能稳定识别为 deploy_status artifact，并在必要时 fallback。

## 前置条件

- artifact_detector 已有通用 XML 和文本检测能力。
- DeploymentService 可创建部署。

## 预期触达路径

- `backend/app/services/artifact_detector.py`
- `backend/app/services/adapters/cli_adapter.py`
- `backend/tests/services/test_artifact_detector.py`
- `backend/tests/services/test_artifact_service.py`

## 执行步骤

1. 扩展 XML 解析支持 deploy_status。
2. 修复属性顺序和单双引号兼容。
3. 剥离 artifact XML 避免 URL 兜底重复。
4. CLI stream 结束时扫描静态文件并创建部署 artifact。
5. 增加回归测试。

## 验收标准

- [ ] CLI 部署请求出现 DeployStatusCard。
- [ ] artifact 中 URL 属性不会再被重复解析为 LinkPreviewCard。
- [ ] 回归测试通过。

## 实施记录

见 `TRACE-DEPLOYMENT-PREVIEW-001`。

## Obsidian 双链

Related:

- [[SPEC-DEPLOYMENT-PREVIEW-001]]
- [[PLAN-DEPLOYMENT-PREVIEW-001]]
- [[TASK-DEPLOYMENT-PREVIEW-002]]
- [[TRACE-DEPLOYMENT-PREVIEW-001]]

