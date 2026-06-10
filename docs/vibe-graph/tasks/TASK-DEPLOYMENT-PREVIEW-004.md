---
id: TASK-DEPLOYMENT-PREVIEW-004
type: task
title: 前端 DeployStatusCard
status: implemented
owner: Frontend
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
  - TASK-DEPLOYMENT-PREVIEW-003
relates_to: []
implements:
  - agenthub-web/src/components/cards/DeployStatusCard.tsx
  - agenthub-web/src/components/cards/CardRenderer.tsx
  - agenthub-web/src/components/chat/MessageList.tsx
  - agenthub-web/src/components/layout/ChatArea.tsx
traces:
  - TRACE-DEPLOYMENT-PREVIEW-001
blocked_by: []
acceptance:
  - DeployStatusCard 能处理 DEPLOY_REQUEST 自动部署。
  - 卡片可显示 URL、状态、运行时间和停止按钮。
  - CardRenderer 能传递 conversationId。
  - 前端 API 路径不会重复 `/api/v1`。
---

# 前端 DeployStatusCard

## 目标

让部署请求和部署结果在聊天中以状态卡呈现，并提供自动部署和停止操作。

## 前置条件

- 后端 deployments API 可用。
- deploy_status artifact 可被检测并传到前端。

## 预期触达路径

- `agenthub-web/src/components/cards/DeployStatusCard.tsx`
- `agenthub-web/src/components/cards/CardRenderer.tsx`
- `agenthub-web/src/components/chat/MessageList.tsx`
- `agenthub-web/src/components/layout/ChatArea.tsx`

## 执行步骤

1. 实现 DeployStatusCard 状态 UI。
2. 对 `url="DEPLOY_REQUEST"` 自动触发部署。
3. 从 artifact 直接使用 deployment 数据。
4. 轮询状态并提供停止按钮。
5. 修正 API base URL 拼接。

## 验收标准

- [ ] 部署请求卡能自动创建部署。
- [ ] 已有部署 artifact 不重复创建部署。
- [ ] 停止按钮可停止运行中的部署。

## 实施记录

见 `TRACE-DEPLOYMENT-PREVIEW-001`。

## Obsidian 双链

Related:

- [[SPEC-DEPLOYMENT-PREVIEW-001]]
- [[PLAN-DEPLOYMENT-PREVIEW-001]]
- [[TASK-DEPLOYMENT-PREVIEW-001]]
- [[TASK-DEPLOYMENT-PREVIEW-003]]
- [[TRACE-DEPLOYMENT-PREVIEW-001]]

