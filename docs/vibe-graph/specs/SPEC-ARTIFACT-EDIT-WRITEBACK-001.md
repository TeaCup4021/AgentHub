---
id: SPEC-ARTIFACT-EDIT-WRITEBACK-001
type: spec
title: 代码产物编辑回写
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
source_assets:
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-artifact-edit-writeback.md
depends_on:
  - SPEC-ARTIFACT-RICH-CARD-001
relates_to:
  - SPEC-DIFF-APPLY-SOURCE-001
plans:
  - PLAN-ARTIFACT-EDIT-WRITEBACK-001
acceptance:
  - CodeCard 保存后通过后端 artifact 版本链持久化，刷新页面不丢失。
  - 编辑保存追加新版本，不覆盖旧 artifact 行。
  - 消息读取时同一版本链只返回最新版本，避免同一张卡重复渲染。
  - CodeCard 保存成功后能刷新消息缓存。
  - fallback 代码卡没有 DB 行时降级为本地下载，不调用回写 API。
non_goals:
  - 实现版本历史 UI。
  - 统一 DiffCard 另存文件与 CodeCard 回写语义。
  - 为所有 artifact 类型都开放编辑回写。
contracts:
  - docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-artifact-edit-writeback.md
---

# 代码产物编辑回写

## 背景

CodeCard 曾经允许用户在 Monaco 编辑器中修改代码，但“保存”只会触发浏览器下载，刷新页面后仍回到 Agent 原始内容。为了让保存符合用户直觉，需要把编辑内容回写到后端，并保留版本历史。

## 目标

- CodeCard 编辑保存后持久化到后端。
- 使用 artifact 版本链追加新版本，不覆盖旧记录。
- 消息读取时按 `_mergeKey` 折叠为最新版。
- 保存成功后刷新消息 query。
- fallback 卡无后端记录时降级下载。

## 范围

- `ArtifactService.update_content`。
- `PATCH /messages/artifacts/{artifact_id}`。
- `ArtifactUpdate` schema。
- `MessageService.list_messages` 版本链折叠。
- 前端 CodeCard 保存逻辑和 queryClient 缓存刷新。

## 非目标

- 不实现版本选择器 UI。
- 不新增专用代码文件存储服务。
- 不改变 DiffCard 的“另存为文件”路径。

## 输入

- 用户在 CodeCard 中编辑后的代码内容。
- 目标 artifact id。
- 原 artifact content 中的语言、文件名和 `_mergeKey`。

## 输出

- 新增 artifact 版本行。
- 刷新后的消息列表中只显示最新版本。
- 保存成功或 fallback 下载提示。

## 关键约束

- 不能直接 UPDATE 原 artifact 行。
- 新版本需要复用旧 `_mergeKey`。
- 内部 `_eventId` 需要刷新，避免事件去重拦截。
- fallback artifact id 以 `fallback-` 开头时不能调用后端回写。

## 验收标准

- [ ] `update_content` 能追加版本并保留字段。
- [ ] `list_messages` 只渲染版本链最新行。
- [ ] CodeCard 保存后消息缓存失效。
- [ ] fallback CodeCard 保存降级下载。
- [ ] 后端单测、前端类型检查和 CardRenderer 测试历史记录通过。

## 追溯

- Plan: `PLAN-ARTIFACT-EDIT-WRITEBACK-001`
- Tasks: `TASK-ARTIFACT-EDIT-WRITEBACK-001` 至 `TASK-ARTIFACT-EDIT-WRITEBACK-004`
- Trace: `TRACE-ARTIFACT-EDIT-WRITEBACK-001`

## Obsidian 双链

Related:

- [[PLAN-ARTIFACT-EDIT-WRITEBACK-001]]
- [[TASK-ARTIFACT-EDIT-WRITEBACK-001]]
- [[TASK-ARTIFACT-EDIT-WRITEBACK-002]]
- [[TASK-ARTIFACT-EDIT-WRITEBACK-003]]
- [[TASK-ARTIFACT-EDIT-WRITEBACK-004]]
- [[TRACE-ARTIFACT-EDIT-WRITEBACK-001]]
- [[SPEC-ARTIFACT-RICH-CARD-001]]
- [[SPEC-DIFF-APPLY-SOURCE-001]]
