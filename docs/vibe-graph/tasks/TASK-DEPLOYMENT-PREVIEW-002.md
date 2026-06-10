---
id: TASK-DEPLOYMENT-PREVIEW-002
type: task
title: 实现部署服务与端口管理
status: implemented
owner: Backend B
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-DEPLOYMENT-PREVIEW-001
specs:
  - SPEC-DEPLOYMENT-PREVIEW-001
source_assets:
  - archive/development/summaries/deployment-feature-2026-06-07.md
  - archive/development/summaries/cli-deploy-card-fix-2026-06-07.md
depends_on:
  - TASK-DEPLOYMENT-PREVIEW-001
relates_to: []
implements:
  - backend/app/services/deployment.py
  - backend/app/services/deployment_source.py
  - backend/app/services/deployment_command.py
traces:
  - TRACE-DEPLOYMENT-PREVIEW-001
blocked_by: []
acceptance:
  - 能在 8000-9000 范围内分配可用端口。
  - 能启动和停止静态 HTTP server 进程。
  - 能检测进程存活和清理僵尸部署。
  - 文件路径保持在部署目录边界内。
---

# 实现部署服务与端口管理

## 目标

实现轻量部署的核心服务逻辑，包括文件落地、端口选择、进程管理和状态检查。

## 前置条件

- 部署 API 和模型存在。
- 本地环境允许启动 HTTP server 子进程。

## 预期触达路径

- `backend/app/services/deployment.py`
- `backend/app/services/deployment_source.py`
- `backend/app/services/deployment_command.py`

## 执行步骤

1. 实现端口可用性检查。
2. 将部署文件写入安全目录。
3. 启动 HTTP server 进程并记录 PID。
4. 查询和停止进程。
5. 支持 cleanup stale deployments。

## 验收标准

- [ ] 指定端口占用时可回退到其他端口。
- [ ] 停止部署后状态更新。
- [ ] 嵌套目录和路径边界检查有效。

## 实施记录

见 `TRACE-DEPLOYMENT-PREVIEW-001`。

## Obsidian 双链

Related:

- [[SPEC-DEPLOYMENT-PREVIEW-001]]
- [[PLAN-DEPLOYMENT-PREVIEW-001]]
- [[TASK-DEPLOYMENT-PREVIEW-001]]
- [[TRACE-DEPLOYMENT-PREVIEW-001]]

