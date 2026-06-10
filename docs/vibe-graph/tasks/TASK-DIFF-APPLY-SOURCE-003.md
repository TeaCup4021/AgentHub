---
id: TASK-DIFF-APPLY-SOURCE-003
type: task
title: 增强选区改写指令
status: implemented
owner: Backend B
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-DIFF-APPLY-SOURCE-001
specs:
  - SPEC-DIFF-APPLY-SOURCE-001
source_assets:
  - docs/ai-collab/decisions/2026-06-05-diff-apply-to-source.md
depends_on:
  - TASK-DIFF-APPLY-SOURCE-001
relates_to: []
implements:
  - backend/app/services/artifact_format.py
traces:
  - TRACE-DIFF-APPLY-SOURCE-001
blocked_by: []
acceptance:
  - 选区改写指令要求 diff 带 file 属性。
  - before 段要求逐字复制原片段。
  - 指令增强不破坏现有 artifact sentinel 检测。
---

# 增强选区改写指令

## 目标

提高 Agent 输出 diff 被前端成功匹配源代码卡的概率。

## 前置条件

- 选区改写已有系统指令。
- DiffCard 匹配依赖 fileName 和 oldCode 片段。

## 预期触达路径

- `backend/app/services/artifact_format.py`

## 执行步骤

1. 在选区改写指令中要求输出 `file="<源文件名>"`。
2. 要求 before 段逐字复制原片段。
3. 保持 artifact 格式兼容。

## 验收标准

- [ ] Agent 更可能输出可匹配 diff。
- [ ] 后端 artifact 格式测试不回归。

## 实施记录

见 `TRACE-DIFF-APPLY-SOURCE-001`。

## Obsidian 双链

Related:

- [[SPEC-DIFF-APPLY-SOURCE-001]]
- [[PLAN-DIFF-APPLY-SOURCE-001]]
- [[TASK-DIFF-APPLY-SOURCE-001]]
- [[TRACE-DIFF-APPLY-SOURCE-001]]
