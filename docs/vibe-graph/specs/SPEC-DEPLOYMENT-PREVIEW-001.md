---
id: SPEC-DEPLOYMENT-PREVIEW-001
type: spec
title: 轻量级部署预览
status: implemented
owner: Backend B
created: 2026-06-10
updated: 2026-06-10
source_assets:
  - vibeCodingSummary/deployment-feature-2026-06-07.md
  - vibeCodingSummary/cli-deploy-card-fix-2026-06-07.md
  - vibeCodingSummary/cli-deploy-existing-file-link-fix-2026-06-07.md
depends_on:
  - SPEC-ARTIFACT-RICH-CARD-001
relates_to:
  - SPEC-PREVIEW-PPT-INLINE-001
plans:
  - PLAN-DEPLOYMENT-PREVIEW-001
acceptance:
  - Agent 可通过 deploy_status artifact 触发静态网页部署。
  - 后端能为会话创建、查询、停止和清理轻量 HTTP server 部署。
  - 部署端口在 8000-9000 范围内自动分配或按请求尝试。
  - DeployStatusCard 能展示部署状态、URL、运行时间和停止操作。
  - CLI Agent 生成静态文件但未显式输出 XML artifact 时，有 fallback 创建部署产物。
non_goals:
  - 支持后端 API 或全栈应用部署。
  - 提供生产级容器隔离和公网域名。
  - 部署在 AgentHub 进程重启后仍保持运行。
contracts:
  - docs/AgentHub 响应格式与前后端对齐约定.md
---

# 轻量级部署预览

## 背景

AgentHub 需要让用户通过自然语言快速生成并预览静态网页。轻量部署方案选择用本地 HTTP server 进程提供快速预览，不做完整容器化和公网发布，适合原型演示。

## 目标

- 用户通过 Agent 生成 HTML/CSS/JS 后可一键或自动部署到本地端口。
- 部署状态以 DeployStatusCard 在聊天中展示。
- 后端提供部署生命周期 API。
- CLI Agent 真实生成文件时，即使没有 XML artifact，也能 fallback 生成部署卡。

## 范围

- 后端 deployments API、deployment service、deployment source/command。
- deployments 数据模型和 migration。
- artifact_detector 对 deploy_status 的解析。
- CLI Adapter 部署提示和 fallback 扫描。
- 前端 DeployStatusCard、CardRenderer、MessageList、ChatArea。
- 后端部署相关测试和前端构建验证。

## 非目标

- 不支持 Node/Python 后端服务托管。
- 不提供 Docker 容器隔离。
- 不提供外网分享链接和访问统计。
- 不保证进程重启后部署仍可访问。

## 输入

- Agent 输出的 `<artifact type="deploy_status" ...>`。
- CLI workspace 中生成的静态文件。
- 用户指定或未指定的目标端口。
- 前端自动部署请求。

## 输出

- 部署记录。
- 本地 HTTP server 进程。
- 可访问 URL，例如 `http://localhost:{port}`。
- DeployStatusCard 状态。
- 停止和清理操作结果。

## 关键约束

- 端口范围默认 8000-9000。
- 启动进程需要记录 PID 并能检测存活状态。
- 前端 Axios base URL 已包含 `/api/v1`，卡片 API 路径不能重复拼接。
- CLI fallback 扫描必须限制在 workspace 边界内。
- 部署仅面向静态文件快速预览。

## 验收标准

- [ ] `POST /deployments/conversations/{conv_id}` 能创建部署。
- [ ] `GET /deployments/{deployment_id}` 能返回实时状态。
- [ ] `POST /deployments/{deployment_id}/stop` 能停止部署。
- [ ] DeployStatusCard 能自动触发 `DEPLOY_REQUEST`。
- [ ] CLI fallback 能在缺失 XML artifact 时发出持久化 deploy_status artifact。
- [ ] 后端和前端关键验证通过。

## 追溯

- Plan: `PLAN-DEPLOYMENT-PREVIEW-001`
- Tasks: `TASK-DEPLOYMENT-PREVIEW-001` 至 `TASK-DEPLOYMENT-PREVIEW-005`
- Trace: `TRACE-DEPLOYMENT-PREVIEW-001`

## Obsidian 双链

Related:

- [[PLAN-DEPLOYMENT-PREVIEW-001]]
- [[TASK-DEPLOYMENT-PREVIEW-001]]
- [[TASK-DEPLOYMENT-PREVIEW-002]]
- [[TASK-DEPLOYMENT-PREVIEW-003]]
- [[TASK-DEPLOYMENT-PREVIEW-004]]
- [[TASK-DEPLOYMENT-PREVIEW-005]]
- [[TRACE-DEPLOYMENT-PREVIEW-001]]
- [[SPEC-ARTIFACT-RICH-CARD-001]]
