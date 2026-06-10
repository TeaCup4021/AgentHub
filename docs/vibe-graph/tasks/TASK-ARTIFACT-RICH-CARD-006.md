---
id: TASK-ARTIFACT-RICH-CARD-006
type: task
title: 安全和稳定性修复
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-ARTIFACT-RICH-CARD-001
specs:
  - SPEC-ARTIFACT-RICH-CARD-001
source_assets:
  - docs/ai-collab/decisions/2026-06-04-web-preview-fix.md
  - vibeCodingPlan/AgentHub-前后端-富媒体卡片升级方案-文件预览Diff.md
depends_on:
  - TASK-ARTIFACT-RICH-CARD-002
  - TASK-ARTIFACT-RICH-CARD-003
  - TASK-ARTIFACT-RICH-CARD-004
relates_to: []
implements:
  - backend/app/services/og_fetcher.py
  - backend/app/services/preview_server.py
  - backend/app/services/artifact_detector.py
  - agenthub-web/src/components/cards/PreviewCard.tsx
  - agenthub-web/vite.config.ts
traces:
  - TRACE-ARTIFACT-RICH-CARD-001
blocked_by: []
acceptance:
  - OG 抓取禁止 SSRF 高风险地址。
  - 预览上传不阻塞 SSE 主事件循环。
  - iframe sandbox 权限与预览需求匹配。
  - 前端代理和后端端口配置一致。
---

# 安全和稳定性修复

## 目标

补齐富媒体卡片涉及的安全和稳定性边界，尤其是网页预览和链接抓取。

## 前置条件

- PreviewCard、preview_server、og_fetcher 已实现。

## 预期触达路径

- `backend/app/services/og_fetcher.py`
- `backend/app/services/preview_server.py`
- `backend/app/services/artifact_detector.py`
- `agenthub-web/src/components/cards/PreviewCard.tsx`
- `agenthub-web/vite.config.ts`

## 执行步骤

1. 为 OG fetcher 增加 SSRF 白名单/黑名单。
2. 修复 preview 路由挂载和端口代理。
3. 将长时间 I/O 放入线程池，避免阻塞事件循环。
4. 调整 iframe sandbox 权限。

## 验收标准

- [ ] 预览卡片能正常加载。
- [ ] localhost、私有 IP 和云元数据地址不会被 OG fetcher 抓取。
- [ ] SSE 流中上传预览不会阻塞 iframe 请求。

## 实施记录

见 `TRACE-ARTIFACT-RICH-CARD-001`。

## Obsidian 双链

Related:

- [[SPEC-ARTIFACT-RICH-CARD-001]]
- [[PLAN-ARTIFACT-RICH-CARD-001]]
- [[TASK-ARTIFACT-RICH-CARD-002]]
- [[TASK-ARTIFACT-RICH-CARD-003]]
- [[TASK-ARTIFACT-RICH-CARD-004]]
- [[TRACE-ARTIFACT-RICH-CARD-001]]
