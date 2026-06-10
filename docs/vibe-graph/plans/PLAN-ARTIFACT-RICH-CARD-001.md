---
id: PLAN-ARTIFACT-RICH-CARD-001
type: plan
title: 富媒体产物卡片历史实施计划映射
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
specs:
  - SPEC-ARTIFACT-RICH-CARD-001
source_assets:
  - archive/development/plans/AgentHub-前后端-富媒体卡片升级方案-文件预览Diff.md
  - archive/development/summaries/AgentHub-富媒体卡片升级-文件预览Diff-实施总结.md
  - docs/ai-collab/decisions/artifact-preview/2026-06-04-web-preview-fix.md
depends_on: []
relates_to:
  - PLAN-PREVIEW-PPT-INLINE-001
tasks:
  - TASK-ARTIFACT-RICH-CARD-001
  - TASK-ARTIFACT-RICH-CARD-002
  - TASK-ARTIFACT-RICH-CARD-003
  - TASK-ARTIFACT-RICH-CARD-004
  - TASK-ARTIFACT-RICH-CARD-005
  - TASK-ARTIFACT-RICH-CARD-006
review:
  required: true
  confirmed_by: historical-summary
  confirmed_at: 2026-06-05
risks:
  - 正则检测 Agent 文本存在漏检风险，需要前端兜底。
  - iframe 预览和 OG 抓取存在安全边界，需要 CSP、sandbox 和 SSRF 防护。
  - MinIO 或预览服务不可用时，卡片需要降级。
verification:
  - command: npx tsc -b --noEmit
    result: passed
    notes: 历史计划要求类型检查零错误，summary 未逐项记录命令输出。
  - command: npx vitest run
    result: not_run
    notes: 历史 summary 未明确记录本功能全量 vitest 输出。
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: passed
    notes: 本次补录后运行。
---

# 富媒体产物卡片历史实施计划映射

## 来源 Spec

- `SPEC-ARTIFACT-RICH-CARD-001`: 从 Agent 输出中检测并渲染 diff、file、preview 和 link_preview 产物卡片。

## 实施目标

将富媒体卡片升级方案沉淀为稳定图谱节点，覆盖后端检测、文件与预览基础设施、前端卡片渲染、安全约束和兜底策略。

## 实施范围

- 后端 StorageService、文件 API、preview_server、og_fetcher。
- 后端 artifact_detector、artifact service、cli tools。
- 前端 DiffCard、FileCard、PreviewCard、LinkPreviewCard、CardRenderer、MessageList。
- 前端 Blob 下载和 API 类型。

不在本次补录范围：

- Diff 一键应用到源文件的启发式匹配算法。
- PPTX 转 PDF 的文档转换细节。
- 轻量部署服务生命周期。

## 方案

1. 建立 MinIO 文件存储和 `/files/*` API。
2. 建立 preview_publish 工具与预览服务。
3. 扩展 artifact_detector，识别 file、preview、link_preview、diff。
4. 实现四类前端卡片并注册 CardRenderer。
5. 添加前端兜底检测和 Blob 下载。
6. 记录安全约束与已知降级路径。

## Task 拆分

| Task ID | 标题 | 预期触达路径 | 验收点 |
| --- | --- | --- | --- |
| `TASK-ARTIFACT-RICH-CARD-001` | 建立文件存储与文件 API | `backend/app/services/storage.py`, `backend/app/api/v1/files.py` | 文件上传、下载、内容更新和 apply-diff 可用。 |
| `TASK-ARTIFACT-RICH-CARD-002` | 建立预览服务与 preview_publish | `backend/app/services/preview_server.py`, `backend/app/services/adk/cli_tools.py` | HTML 预览可发布并通过 iframe 访问。 |
| `TASK-ARTIFACT-RICH-CARD-003` | 扩展 artifact 检测与持久化 | `backend/app/services/artifact_detector.py`, `backend/app/services/artifact.py` | file/preview/link/diff artifact 可检测和去重。 |
| `TASK-ARTIFACT-RICH-CARD-004` | 实现前端富媒体卡片 | `agenthub-web/src/components/cards/` | 四类卡片可渲染并注册。 |
| `TASK-ARTIFACT-RICH-CARD-005` | 实现前端兜底与下载 | `MessageList.tsx`, `useBlobDownload.ts`, `api.ts` | 缺 artifact 时可兜底，下载不丢 token。 |
| `TASK-ARTIFACT-RICH-CARD-006` | 安全和稳定性修复 | `og_fetcher.py`, `PreviewCard.tsx`, `preview_server.py` | SSRF、防 iframe 权限和事件循环阻塞风险。 |

## 契约与兼容性

- 继续通过 SSE `artifact` 事件推送结构化产物。
- 文件下载和保存走 `/api/v1/files/*`。
- 前端卡片内容类型与 `types/chat.ts` 保持一致。
- 预览 HTML 不直接运行在主站同源上下文。

## 风险

- Agent 输出格式不稳定导致正则漏检。
- OG 抓取超时或被目标网站阻断。
- MinIO 未启动时文件类卡片需要降级。
- Monaco 多实例渲染可能带来性能成本。

## 验证计划

- [ ] diff 块渲染 DiffCard。
- [ ] create_file 渲染 FileCard 并可下载。
- [ ] preview_publish 渲染 PreviewCard。
- [ ] 普通 URL 渲染 LinkPreviewCard。
- [ ] 运行前端类型检查和关键组件测试。
- [ ] 运行 Vibe Graph 校验。

## Review

该节点为历史补录，review 信息来自历史计划和 summary，不代表当前重新确认业务实现。

## Obsidian 双链

Related:

- [[SPEC-ARTIFACT-RICH-CARD-001]]
- [[TASK-ARTIFACT-RICH-CARD-001]]
- [[TASK-ARTIFACT-RICH-CARD-002]]
- [[TASK-ARTIFACT-RICH-CARD-003]]
- [[TASK-ARTIFACT-RICH-CARD-004]]
- [[TASK-ARTIFACT-RICH-CARD-005]]
- [[TASK-ARTIFACT-RICH-CARD-006]]
- [[TRACE-ARTIFACT-RICH-CARD-001]]

