---
id: TASK-AICOLLAB-VIBE-GRAPH-002
type: task
title: 整理 Skill、模板和固定口令
status: implemented
owner: AI Collaboration
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-AICOLLAB-VIBE-GRAPH-001
specs:
  - SPEC-AICOLLAB-VIBE-GRAPH-001
source_assets:
  - docs/vibe-graph/SKILL.md
  - docs/vibe-graph/prompts.md
  - docs/vibe-graph/templates/README.md
depends_on:
  - TASK-AICOLLAB-VIBE-GRAPH-001
relates_to: []
implements:
  - docs/vibe-graph/SKILL.md
  - docs/vibe-graph/prompts.md
  - docs/vibe-graph/agents/openai.yaml
traces:
  - TRACE-AICOLLAB-VIBE-GRAPH-001
blocked_by: []
acceptance:
  - Skill 能指导后续 AI 创建、补录、实施和校验图谱节点。
  - 固定口令覆盖新需求、计划任务、实施追踪、历史补录和负责人交付。
---

# 整理 Skill、模板和固定口令

## 目标

把 Vibe Graph 从“项目里的文档目录”整理为后续 Codex 可以稳定触发和执行的仓库内 Skill 与协作口令。

## 前置条件

- 已有 `docs/vibe-graph/SKILL.md`。
- 已有 `docs/vibe-graph/prompts.md`。
- 已有 `docs/vibe-graph/templates/`。

## 预期触达路径

- `docs/vibe-graph/SKILL.md`
- `docs/vibe-graph/prompts.md`
- `docs/vibe-graph/agents/openai.yaml`

## 执行步骤

1. 精简并强化 Skill 的触发描述和执行步骤。
2. 明确何时读取 rules、schema、migration guide 和模板。
3. 补充负责人交付场景的固定口令。
4. 更新 Skill UI metadata。

## 验收标准

- [ ] Skill 说明能覆盖新需求和历史补录两类主要场景。
- [ ] Skill 明确事实约束，不会鼓励补齐式臆造。
- [ ] prompts.md 可直接复制给后续 AI 使用。

## 实施记录

见 `TRACE-AICOLLAB-VIBE-GRAPH-001`。

## Obsidian 双链

Related:

- [[SPEC-AICOLLAB-VIBE-GRAPH-001]]
- [[PLAN-AICOLLAB-VIBE-GRAPH-001]]
- [[TASK-AICOLLAB-VIBE-GRAPH-001]]
- [[TRACE-AICOLLAB-VIBE-GRAPH-001]]
