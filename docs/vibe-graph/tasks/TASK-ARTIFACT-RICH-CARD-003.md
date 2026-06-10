---
id: TASK-ARTIFACT-RICH-CARD-003
type: task
title: 扩展 artifact 检测与持久化
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-ARTIFACT-RICH-CARD-001
specs:
  - SPEC-ARTIFACT-RICH-CARD-001
source_assets:
  - archive/development/summaries/AgentHub-富媒体卡片升级-文件预览Diff-实施总结.md
depends_on:
  - TASK-ARTIFACT-RICH-CARD-001
  - TASK-ARTIFACT-RICH-CARD-002
relates_to: []
implements:
  - backend/app/services/artifact_detector.py
  - backend/app/services/artifact.py
  - backend/app/services/og_fetcher.py
  - backend/app/services/adk/cli_tools.py
traces:
  - TRACE-ARTIFACT-RICH-CARD-001
blocked_by: []
acceptance:
  - artifact_detector 能检测 file、preview、link_preview 和 diff。
  - artifact 去重使用稳定 mergeKey 或内容哈希。
  - OG 抓取失败时可以降级。
---

# 扩展 artifact 检测与持久化

## 目标

把 Agent 文本和工具结果转成可持久化、可流式推送的结构化 artifact。

## 前置条件

- 文件 API 和预览服务可用。
- SSE translator 能发出 artifact 事件。

## 预期触达路径

- `backend/app/services/artifact_detector.py`
- `backend/app/services/artifact.py`
- `backend/app/services/og_fetcher.py`
- `backend/app/services/adk/cli_tools.py`

## 执行步骤

1. 扩展 diff、file、preview 和 link_preview 检测。
2. 接入 OG fetcher。
3. 从工具结果 JSON 提取 file 和 preview artifact。
4. 为 artifact 生成稳定去重键。

## 验收标准

- [ ] 四类 artifact 可以从文本或工具结果中被检测。
- [ ] 同一内容不会重复渲染多张卡。
- [ ] OG 抓取失败时前端仍有简化链接卡。

## 实施记录

见 `TRACE-ARTIFACT-RICH-CARD-001`。

## Obsidian 双链

Related:

- [[SPEC-ARTIFACT-RICH-CARD-001]]
- [[PLAN-ARTIFACT-RICH-CARD-001]]
- [[TASK-ARTIFACT-RICH-CARD-001]]
- [[TASK-ARTIFACT-RICH-CARD-002]]
- [[TRACE-ARTIFACT-RICH-CARD-001]]

