# Vibe Graph 协作规范交付说明

本文档是交付给项目负责人的入口，用于说明 AgentHub 在 Vibecoding 过程中沉淀出的 AI 协作规范包。

## 一句话说明

Vibe Graph 把一次 AI 协作从“聊天里的计划和代码修改”沉淀成可追溯图谱：

```text
SPEC -> PLAN -> TASK -> IMPLEMENTS -> TRACE -> SUMMARY
```

其中 `SPEC` 定义能力和契约，`PLAN` 定义实施路径，`TASK` 拆出可执行单元，`IMPLEMENTS` 记录真实触达文件，`TRACE` 记录验证、偏差和后续事项，`SUMMARY` 作为阶段性收口。

## 交付内容

| 资产 | 路径 | 作用 |
| --- | --- | --- |
| 协作规范入口 | `docs/vibe-graph/index.md` | 图谱总入口、当前状态和样例列表。 |
| 协作规则 | `docs/vibe-graph/rules.md` | 节点、状态、流程、事实约束和 AI 操作边界。 |
| 仓库内 Skill | `docs/vibe-graph/SKILL.md` | 后续 Codex 执行图谱任务时的操作指南。 |
| 固定口令 | `docs/vibe-graph/prompts.md` | 可复制给 AI 的新需求、补录、实施、交付口令。 |
| 节点模板 | `docs/vibe-graph/templates/` | `SPEC`、`PLAN`、`TASK`、`TRACE` 创建模板。 |
| Schema 参考 | `docs/vibe-graph/references/node-schema.md` | frontmatter 字段、状态和关系规则。 |
| 历史补录指南 | `docs/vibe-graph/references/migration-guide.md` | 将历史 plan/summary/decision 补录进图谱的方法。 |
| 校验脚本 | `docs/vibe-graph/scripts/validate-vibe-graph.py` | 校验 ID、路径、关系和基础语义。 |
| Obsidian 入口 | `docs/vibe-graph/obsidian.md` | 双链图谱和 Mermaid 总览。 |

## 已完成样例

| 样例 | 说明 | 链路 |
| --- | --- | --- |
| AI 协作规范自身 | 规范包本身也按 Vibe Graph 沉淀，证明方法自洽。 | `SPEC-AICOLLAB-VIBE-GRAPH-001` -> `PLAN-AICOLLAB-VIBE-GRAPH-001` -> `TASK-AICOLLAB-VIBE-GRAPH-*` -> `TRACE-AICOLLAB-VIBE-GRAPH-001` |
| 群聊 DAG 执行 | 历史业务功能补录样例，覆盖后端 DAG、SSE、多 Agent 消息和前端归属。 | `SPEC-GROUPCHAT-DAG-001` -> `PLAN-GROUPCHAT-DAG-001` -> `TASK-GROUPCHAT-DAG-*` -> `TRACE-GROUPCHAT-DAG-001` |
| PPT 内联浏览 | 第二个历史补录样例，覆盖上传、转换、artifact、CLI 和前端预览链路。 | `SPEC-PREVIEW-PPT-INLINE-001` -> `PLAN-PREVIEW-PPT-INLINE-001` -> `TASK-PREVIEW-PPT-INLINE-*` -> `TRACE-PREVIEW-PPT-INLINE-001` |
| 富媒体产物卡片 | 覆盖 DiffCard、FileCard、PreviewCard、LinkPreviewCard、文件 API、预览服务和前端兜底。 | `SPEC-ARTIFACT-RICH-CARD-001` -> `PLAN-ARTIFACT-RICH-CARD-001` -> `TASK-ARTIFACT-RICH-CARD-*` -> `TRACE-ARTIFACT-RICH-CARD-001` |
| Diff 应用到源产物 | 覆盖 DiffCard 一键写回源代码卡、启发式匹配和版本链回写。 | `SPEC-DIFF-APPLY-SOURCE-001` -> `PLAN-DIFF-APPLY-SOURCE-001` -> `TASK-DIFF-APPLY-SOURCE-*` -> `TRACE-DIFF-APPLY-SOURCE-001` |
| 轻量级部署预览 | 覆盖 deploy_status artifact、部署 API、DeployStatusCard 和 CLI fallback。 | `SPEC-DEPLOYMENT-PREVIEW-001` -> `PLAN-DEPLOYMENT-PREVIEW-001` -> `TASK-DEPLOYMENT-PREVIEW-*` -> `TRACE-DEPLOYMENT-PREVIEW-001` |
| CodeCard 编辑回写 | 覆盖 CodeCard 保存、artifact 版本链追加、消息读取折叠和前端缓存刷新。 | `SPEC-ARTIFACT-EDIT-WRITEBACK-001` -> `PLAN-ARTIFACT-EDIT-WRITEBACK-001` -> `TASK-ARTIFACT-EDIT-WRITEBACK-*` -> `TRACE-ARTIFACT-EDIT-WRITEBACK-001` |
| Agent 管理与模型配置 | 覆盖 Agent CRUD、模型验证、apiKey/baseUrl、ADK 模型解析、工具配置和前端管理 UI。 | `SPEC-AGENT-MANAGEMENT-001` -> `PLAN-AGENT-MANAGEMENT-001` -> `TASK-AGENT-MANAGEMENT-*` -> `TRACE-AGENT-MANAGEMENT-001` |
| 会话消息与 PinSpec | 覆盖会话 CRUD、消息游标分页、内联 artifacts、Pin/Unpin、PinSpec 注入和前端 Pin 状态一致性。 | `SPEC-CONVERSATION-MESSAGE-PIN-001` -> `PLAN-CONVERSATION-MESSAGE-PIN-001` -> `TASK-CONVERSATION-MESSAGE-PIN-*` -> `TRACE-CONVERSATION-MESSAGE-PIN-001` |

## 与现有流程的关系

`archive/development/vibe-coding-templates/workflow.md` 仍然保留原有闭环：

```text
Plan -> Review -> Implement -> Summarize
```

Vibe Graph 是增强层：

```text
SPEC -> Plan -> Review -> Task -> Implement -> Trace -> Summarize
```

也就是说，`.vibe-coding` 负责“当天如何推进”，`docs/vibe-graph` 负责“这个能力长期如何被理解、追溯和复现”。

## 使用方式

### 新需求

1. 先检查是否已有可复用 `SPEC`。
2. 没有则创建新的 `SPEC-*`。
3. 基于 `SPEC` 创建 `PLAN-*`。
4. 用户确认 plan 后拆 `TASK-*` 并实施。
5. 实施后回写 `TRACE-*` 和 `SUMMARY`。

可复制 `docs/vibe-graph/prompts.md` 中“新需求：只生成 SPEC”和“审完 SPEC 后：生成 PLAN 和 TASK”的口令。

### 历史补录

1. 选择有 plan、summary、decision 和代码路径的历史功能。
2. 只新增图谱节点，不修改业务代码。
3. 所有事实必须能从历史文档、仓库路径或测试输出确认。
4. 不确定内容写 `unknown` 或“待确认”。
5. 最后运行校验脚本。

### 实施追踪

1. 实施指定 `TASK-*` 前读取父 `PLAN` 和相关 `SPEC`。
2. 只改 task 范围内的代码或文档。
3. 记录真实 `implements` 路径。
4. 验证结果必须真实；未运行就写 `not_run` 和原因。
5. 如果实现偏离 plan，在 `TRACE.deviations` 中记录。

## 验收清单

负责人可以用以下清单判断规范包是否合格：

- [ ] 是否存在清晰的规则入口：`docs/vibe-graph/rules.md`。
- [ ] 是否存在可复用 Skill：`docs/vibe-graph/SKILL.md`。
- [ ] 是否有模板：`docs/vibe-graph/templates/`。
- [ ] 是否有固定口令：`docs/vibe-graph/prompts.md`。
- [ ] 是否有校验脚本且运行通过。
- [ ] 是否至少有两个真实样例，而不是只有空模板。
- [ ] 样例是否能从 `SPEC` 追到 `SUMMARY`。
- [ ] `TRACE` 是否记录实际文件、验证结果、偏差和后续事项。
- [ ] 历史补录是否避免伪造测试结果和用户确认。

## 当前校验

运行命令：

```powershell
python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
```

当前交付版本校验结果：

```text
Validation passed: 0 errors, 0 warning(s).
```

## 后续路线

推荐后续按以下顺序继续沉淀：

1. 将仓库内 `docs/vibe-graph/SKILL.md` 安装为个人 Codex Skill，便于跨线程复用。
2. 在 CI 或本地脚本中固定运行 Vibe Graph 校验。
3. 继续补录 Context Assembler、CapabilityRegistry、Planner 两阶段协议、SSE Translator 等核心能力。
4. 对 `TRACE` 中标记的业务 followup 单独生成新 `SPEC/PLAN/TASK`，例如 API Key 安全治理、PinSpec 端到端联调、CodeCard 版本历史 UI。

## 交付边界

本次交付只沉淀协作规范和历史补录，不修改业务代码，不声明未重新运行的业务端到端测试已经通过。

