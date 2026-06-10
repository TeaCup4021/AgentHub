---
id: PLAN-AICOLLAB-CONTEXT-ROUTING-001
type: plan
title: AI 协作上下文路由索引实施计划
status: implemented
owner: AI Collaboration
created: 2026-06-10
updated: 2026-06-10
specs:
  - SPEC-AICOLLAB-CONTEXT-ROUTING-001
source_assets:
  - docs/ai-collab/README.md
  - docs/ai-collab/decisions/README.md
  - docs/vibe-graph/rules.md
depends_on:
  - PLAN-AICOLLAB-VIBE-GRAPH-001
relates_to: []
tasks:
  - TASK-AICOLLAB-CONTEXT-ROUTING-001
review:
  required: true
  confirmed_by: user
  confirmed_at: 2026-06-10
risks:
  - 如果索引过长，会变成新的上下文负担。
  - 如果只按文件名分类，后续 AI 仍不知道读取触发条件。
  - 如果移动现有文件，可能破坏历史链接和 Vibe Graph source_assets。
verification:
  - command: python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
    result: not_run
    notes: 创建初始计划时尚未运行，结果以 TRACE 为准。
---

# AI 协作上下文路由索引实施计划

## 来源 Spec

- `SPEC-AICOLLAB-CONTEXT-ROUTING-001`: 控制 Vibecoding 建立 SPEC 前读取 `ai-collab` 的上下文长度。

## 实施目标

把 `docs/ai-collab/` 从普通文件清单整理为按场景选择的最小上下文索引。

## 实施范围

- 新增 `docs/ai-collab/reference/context-index.md`。
- 更新 `docs/ai-collab/README.md`，加入上下文控制入口和分类速查。
- 更新 `docs/ai-collab/decisions/README.md`，加入 ADR 场景分类。
- 新增本次文档整理的 Vibe Graph 链路和 summary。

不在本次计划内：

- 移动或重命名 `ai-collab` 既有文件。
- 修改业务源码。
- 重写主题文档和 ADR 正文。

## 方案

1. 保留原目录结构，避免破坏历史链接。
2. 新增 `context-index.md` 作为 AI 上下文路由入口。
3. 按文档类型建立分类：入口索引、核心契约、架构机制、术语统一、验证手册、调试手册、决策记录。
4. 按常见需求场景建立读取矩阵，区分 `Must read` 和 `Read if needed`。
5. 为 ADR 和 debug 文档补充读取触发条件。
6. 回写 Vibe Graph TRACE 和 archive summary。

## Task 拆分

| Task ID | 标题 | 预期触达路径 | 验收点 |
| --- | --- | --- | --- |
| `TASK-AICOLLAB-CONTEXT-ROUTING-001` | 整理 ai-collab 最小上下文读取索引 | `docs/ai-collab/reference/context-index.md`, `docs/ai-collab/README.md`, `docs/ai-collab/decisions/README.md` | AI 可按场景读取最小文档集合。 |

## 契约与兼容性

- 不涉及 API 响应格式变更。
- 不涉及数据库、SSE 或前端实现变更。
- 兼容现有 Vibe Graph source assets，因为不移动历史文件。

## 风险

- 索引如果过细，维护成本会上升。
- 场景分类可能无法覆盖所有未来需求，因此保留“缺口说明后再查源码或 archive”的兜底规则。

## 验证计划

- [ ] 确认 `context-index.md` 包含读取原则、文档类型、场景矩阵、ADR 索引和 debug 索引。
- [ ] 确认 README 指向 `context-index.md`。
- [ ] 运行 `python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph`。

## Review

用户在 2026-06-10 明确要求按上下文长度控制标准重新分类整理 `ai-collab` 内容，因此本次仅实施文档与图谱整理。

## Obsidian 双链

Related:

- [[SPEC-AICOLLAB-CONTEXT-ROUTING-001]]
- [[TASK-AICOLLAB-CONTEXT-ROUTING-001]]
- [[TRACE-AICOLLAB-CONTEXT-ROUTING-001]]
