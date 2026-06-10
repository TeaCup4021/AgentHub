---
id: SPEC-ARTIFACT-RICH-CARD-001
type: spec
title: 富媒体产物卡片
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
source_assets:
  - archive/development/plans/AgentHub-前后端-富媒体卡片升级方案-文件预览Diff.md
  - archive/development/summaries/AgentHub-富媒体卡片升级-文件预览Diff-实施总结.md
  - docs/ai-collab/decisions/artifact-preview/2026-06-04-web-preview-fix.md
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-artifact-edit-writeback.md
depends_on: []
relates_to:
  - SPEC-PREVIEW-PPT-INLINE-001
  - SPEC-DIFF-APPLY-SOURCE-001
plans:
  - PLAN-ARTIFACT-RICH-CARD-001
acceptance:
  - Agent 输出中的 diff、file、preview、link 能被检测为结构化 artifact。
  - 后端 artifact_detector 作为主路径，前端 MessageList 提供文本兜底检测。
  - FileCard、PreviewCard、LinkPreviewCard 和 DiffCard 能通过 CardRenderer 渲染。
  - 文件和预览内容通过 MinIO、文件 API 或预览服务持久化。
  - 预览 iframe 与 OG 抓取具备基础安全约束。
non_goals:
  - 覆盖所有文档预览格式。
  - 定义 Diff 应用到源文件的回写算法。
  - 定义轻量部署生命周期。
contracts:
  - docs/AgentHub 响应格式与前后端对齐约定.md
  - docs/ai-collab/contracts/sse-protocol.md
---

# 富媒体产物卡片

## 背景

AgentHub 早期聊天输出主要是文本和代码块。为了让 Agent 产出的文件、网页、链接和代码变更在聊天中直接可操作，需要一套结构化 artifact 检测、持久化、流式推送和前端卡片渲染机制。

## 目标

- 从 Agent 文本、工具结果和 URL 中识别富媒体产物。
- 将产物通过 SSE artifact 事件推送到前端。
- 将产物持久化，支撑产物工作台、刷新恢复和后续编辑。
- 提供 DiffCard、FileCard、PreviewCard、LinkPreviewCard 四类核心卡片。
- 在后端检测漏掉时，前端可进行有限兜底解析。

## 范围

- 后端 `artifact_detector` 的 diff、file、preview、link_preview 检测。
- MinIO `StorageService` 和文件 API。
- 预览服务与 CSP/sandbox 安全模型。
- OG 抓取和 SSRF 防护。
- 前端 CardRenderer 和四类卡片组件。
- 前端兜底检测和 Blob 下载。

## 非目标

- 不定义 PPT/PDF 等具体文档转换能力，见 `SPEC-PREVIEW-PPT-INLINE-001`。
- 不定义 Diff 写回源卡算法，见 `SPEC-DIFF-APPLY-SOURCE-001`。
- 不定义部署服务的进程生命周期，见 `SPEC-DEPLOYMENT-PREVIEW-001`。

## 输入

- Agent 回复文本中的 Markdown 代码块、diff 块、URL。
- ADK FunctionTool 返回的 create_file 或 preview_publish JSON。
- 后端 artifact 检测输出。
- 前端消息文本和 artifact 列表。

## 输出

- SSE artifact 事件。
- PostgreSQL 中持久化的 artifact 记录。
- MinIO 中的文件或 HTML 预览内容。
- 前端富媒体卡片和下载、预览、保存等交互。

## 关键约束

- 后端 artifact_detector 是主路径，前端兜底只负责渲染临时卡片。
- 预览 iframe 需要独立 Origin 或 sandbox/CSP 约束。
- OG fetcher 必须避免 SSRF，禁止 localhost、私有 IP 和云元数据地址。
- 文件下载应走带鉴权的 fetch+Blob 或后端代理下载，避免裸 `<a>` 丢 token。
- artifact 去重应使用稳定 mergeKey 或内容哈希。

## 验收标准

- [ ] diff 块能渲染 DiffCard。
- [ ] create_file 工具结果能渲染 FileCard。
- [ ] preview_publish 工具结果能渲染 PreviewCard。
- [ ] 普通 URL 能渲染 LinkPreviewCard 或降级链接卡。
- [ ] 前端缺少 SSE artifact 时仍能兜底展示 diff 或 URL。
- [ ] 预览与 OG 抓取满足基础安全约束。

## 追溯

- Plan: `PLAN-ARTIFACT-RICH-CARD-001`
- Tasks: `TASK-ARTIFACT-RICH-CARD-001` 至 `TASK-ARTIFACT-RICH-CARD-006`
- Trace: `TRACE-ARTIFACT-RICH-CARD-001`

## Obsidian 双链

Related:

- [[PLAN-ARTIFACT-RICH-CARD-001]]
- [[TASK-ARTIFACT-RICH-CARD-001]]
- [[TASK-ARTIFACT-RICH-CARD-002]]
- [[TASK-ARTIFACT-RICH-CARD-003]]
- [[TASK-ARTIFACT-RICH-CARD-004]]
- [[TASK-ARTIFACT-RICH-CARD-005]]
- [[TASK-ARTIFACT-RICH-CARD-006]]
- [[TRACE-ARTIFACT-RICH-CARD-001]]
- [[SPEC-PREVIEW-PPT-INLINE-001]]
- [[SPEC-DIFF-APPLY-SOURCE-001]]

