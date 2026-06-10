# Vibe Graph 协作规则

本文档定义 AgentHub 在 Vibecoding 过程中沉淀 `spec -> plan -> task -> implements -> summary` 可追溯知识图谱的规则。

本规则基于仓库现有资产：

- `AGENTS.md`
- `.vibe-coding/workflow.md`（已归档至 `archive/development/vibe-coding-templates/`）
- `.vibe-coding/plan-template.md`（已归档）
- `.vibe-coding/summary-template.md`（已归档）
- `archive/development/plans/`（原 `vibeCodingPlan/`）
- `archive/development/summaries/`（原 `vibeCodingSummary/`）
- `docs/`
- `docs/ai-collab/`
- `agenthub-web/docs/specs/`
- `agenthub-web/docs/plans/`

## 1. 基本原则

1. `docs/vibe-graph/` 是索引层，不是重写层。
2. 历史文档保持原位，通过路径被图谱节点引用。
3. 新需求默认先形成 `SPEC`，再生成 `PLAN`，再拆分 `TASK`，最后实施并回写 `TRACE` 与 `SUMMARY`。
4. 图谱节点必须使用稳定 ID。文件名可以调整，但节点 ID 不应随标题变化而变化。
5. AI 不得为了补齐图谱而臆造已经完成的实现、验证结果或用户确认。
6. 若图谱规则与用户当前明确指令冲突，以用户当前指令为准，但必须在回复中说明偏离点。

## 2. 图谱链路

标准链路：

```text
SPEC -> PLAN -> TASK -> IMPLEMENTS -> TRACE -> SUMMARY
```

节点含义：

| 节点 | 含义 | 默认目录 |
| --- | --- | --- |
| `SPEC` | 稳定的能力、行为、需求或契约定义 | `docs/vibe-graph/specs/` |
| `PLAN` | 基于 spec 形成的实施方案 | `docs/vibe-graph/plans/` |
| `TASK` | 可执行、可验收、可追踪的工作单元 | `docs/vibe-graph/tasks/` |
| `IMPLEMENTS` | task 实际触达的源码、测试、配置或文档路径 | 记录在 `TASK` 或 `TRACE` frontmatter 中 |
| `TRACE` | 实施过程、验证结果、偏差和后续事项记录 | `docs/vibe-graph/traces/` |
| `SUMMARY` | 既有或新增的实施总结文档 | `archive/development/summaries/` 或其他既有总结目录 |

## 3. ID 命名规则

### 3.1 通用格式

```text
{TYPE}-{DOMAIN}-{TOPIC}-{NNN}
```

示例：

```text
SPEC-GROUPCHAT-DAG-001
PLAN-GROUPCHAT-DAG-001
TASK-GROUPCHAT-DAG-001
TRACE-GROUPCHAT-DAG-001
```

### 3.2 TYPE

| TYPE | 用途 |
| --- | --- |
| `SPEC` | 需求、能力、行为、契约定义 |
| `PLAN` | 实施计划 |
| `TASK` | 执行任务 |
| `TRACE` | 实施追踪 |

### 3.3 DOMAIN

`DOMAIN` 使用大写英文短词，代表业务或技术领域。

推荐值：

| DOMAIN | 适用范围 |
| --- | --- |
| `AUTH` | 登录、认证、授权 |
| `CONVERSATION` | 会话、消息、聊天基础链路 |
| `GROUPCHAT` | 群聊、多 Agent 协作 |
| `ORCHESTRATOR` | 编排器、DAG、计划执行 |
| `ARTIFACT` | 产物卡片、产物检测、产物存储 |
| `PREVIEW` | 文件预览、PPT/PDF/HTML 预览 |
| `DIFF` | Diff 展示、代码应用、局部修改 |
| `DEPLOYMENT` | 部署、预览服务、运行产物 |
| `SSE` | 流式事件协议 |
| `API` | 前后端接口契约 |
| `FRONTEND` | 前端通用体验与组件 |
| `BACKEND` | 后端通用基础设施 |
| `AICOLLAB` | AI 协作规范、流程、规则 |

如无法归类，应优先选择已有 `DOMAIN`。确需新增时，应在本节补充。

### 3.4 TOPIC

`TOPIC` 使用大写英文短语，单词之间用 `-` 连接。

要求：

- 表达能力单元，而不是具体文件名。
- 避免过细，例如不要用单个函数名作为 topic。
- 避免过宽，例如不要用 `SYSTEM` 覆盖多个无关功能。

### 3.5 NNN

`NNN` 为三位递增编号，从 `001` 开始。

同一个 `{TYPE}-{DOMAIN}-{TOPIC}` 下新增节点时递增编号。

### 3.6 文件命名

推荐文件名：

```text
{id}.md
```

示例：

```text
docs/vibe-graph/specs/SPEC-GROUPCHAT-DAG-001.md
docs/vibe-graph/plans/PLAN-GROUPCHAT-DAG-001.md
docs/vibe-graph/tasks/TASK-GROUPCHAT-DAG-001.md
docs/vibe-graph/traces/TRACE-GROUPCHAT-DAG-001.md
```

## 4. Frontmatter 字段

所有图谱节点必须使用 YAML frontmatter。

### 4.1 通用字段

```yaml
---
id: SPEC-GROUPCHAT-DAG-001
type: spec
title: 群聊 DAG 执行
status: draft
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
source_assets: []
depends_on: []
relates_to: []
---
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 稳定节点 ID。 |
| `type` | 是 | `spec`、`plan`、`task`、`trace` 之一。 |
| `title` | 是 | 人类可读标题。 |
| `status` | 是 | 节点状态。 |
| `owner` | 否 | 责任角色，例如 `Backend A`、`Backend B`、`Frontend`、`AI Collaboration`。 |
| `created` | 是 | 创建日期，格式 `YYYY-MM-DD`。 |
| `updated` | 是 | 最近更新日期，格式 `YYYY-MM-DD`。 |
| `source_assets` | 否 | 引用的历史文档或源资产路径。 |
| `depends_on` | 否 | 前置依赖节点 ID。 |
| `relates_to` | 否 | 相关但非前置依赖的节点 ID。 |

### 4.2 SPEC 字段

```yaml
---
id: SPEC-GROUPCHAT-DAG-001
type: spec
title: 群聊 DAG 执行
status: accepted
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
source_assets:
  - docs/ai-collab/decisions/002-group-chat-dag-execution.md
depends_on:
  - SPEC-SSE-PROTOCOL-001
relates_to:
  - SPEC-ORCHESTRATOR-PLAN-001
plans:
  - PLAN-GROUPCHAT-DAG-001
acceptance:
  - 群聊执行顺序符合 DAG 依赖。
  - SSE 事件能够表达每个 Agent 的状态变化。
---
```

额外字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `plans` | 否 | 由该 spec 派生的 plan ID。 |
| `acceptance` | 是 | 可验收标准。 |
| `non_goals` | 否 | 明确不解决的问题。 |
| `contracts` | 否 | API、SSE、数据结构等契约引用。 |

### 4.3 PLAN 字段

```yaml
---
id: PLAN-GROUPCHAT-DAG-001
type: plan
title: 群聊 DAG 执行实施计划
status: approved
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
specs:
  - SPEC-GROUPCHAT-DAG-001
source_assets:
  - vibeCodingPlan/群聊DAG执行与Orchestrator总结重构.md
tasks:
  - TASK-GROUPCHAT-DAG-001
  - TASK-GROUPCHAT-DAG-002
review:
  required: true
  confirmed_by: user
  confirmed_at: 2026-06-09
---
```

额外字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `specs` | 是 | 该 plan 来源的 spec ID。 |
| `tasks` | 否 | 由该 plan 拆出的 task ID。 |
| `review.required` | 是 | 是否需要用户确认。新功能默认必须为 `true`。 |
| `review.confirmed_by` | 否 | 确认人或确认来源。 |
| `review.confirmed_at` | 否 | 确认日期。 |
| `risks` | 否 | 实施风险。 |
| `verification` | 否 | 计划中的验证方式。 |

### 4.4 TASK 字段

```yaml
---
id: TASK-GROUPCHAT-DAG-001
type: task
title: 实现群聊 DAG 执行顺序
status: implemented
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
plan: PLAN-GROUPCHAT-DAG-001
specs:
  - SPEC-GROUPCHAT-DAG-001
implements:
  - backend/app/services/adk/orchestrator.py
  - backend/tests/services/test_orchestrator.py
traces:
  - TRACE-GROUPCHAT-DAG-001
---
```

额外字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `plan` | 是 | 父 plan ID。 |
| `specs` | 是 | 关联 spec ID。 |
| `implements` | 否 | 实际修改或新增的代码、测试、配置、文档路径。 |
| `traces` | 否 | 关联 trace ID。 |
| `blocked_by` | 否 | 阻塞该任务的节点或外部条件。 |
| `acceptance` | 否 | 任务级验收标准。 |

### 4.5 TRACE 字段

```yaml
---
id: TRACE-GROUPCHAT-DAG-001
type: trace
title: 群聊 DAG 执行实施追踪
status: verified
owner: Backend B
created: 2026-06-09
updated: 2026-06-09
tasks:
  - TASK-GROUPCHAT-DAG-001
implements:
  - backend/app/services/adk/orchestrator.py
  - backend/tests/services/test_orchestrator.py
summaries:
  - vibeCodingSummary/群聊DAG执行与Orchestrator总结重构-summary.md
verification:
  - command: pytest backend/tests/services/test_orchestrator.py
    result: passed
---
```

额外字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `tasks` | 是 | 被追踪的 task ID。 |
| `implements` | 是 | 实际触达路径。 |
| `summaries` | 否 | 关联 summary 文件路径。 |
| `verification` | 否 | 验证命令和结果。未运行时必须写明原因。 |
| `deviations` | 否 | 与原 plan 不一致的地方。 |
| `followups` | 否 | 后续事项。 |

## 5. 状态枚举

### 5.1 SPEC 状态

| 状态 | 含义 |
| --- | --- |
| `draft` | 草案，尚未确认。 |
| `accepted` | 已确认，可用于生成 plan。 |
| `implemented` | 已有实现落地。 |
| `deprecated` | 已废弃。 |

### 5.2 PLAN 状态

| 状态 | 含义 |
| --- | --- |
| `draft` | 草案。 |
| `reviewing` | 等待用户确认。 |
| `approved` | 已确认，可拆 task 或实施。 |
| `implemented` | 对应 task 已实施。 |
| `superseded` | 被新 plan 替代。 |

### 5.3 TASK 状态

| 状态 | 含义 |
| --- | --- |
| `todo` | 待执行。 |
| `in_progress` | 执行中。 |
| `implemented` | 已实现。 |
| `verified` | 已验证。 |
| `blocked` | 被阻塞。 |
| `cancelled` | 已取消。 |

### 5.4 TRACE 状态

| 状态 | 含义 |
| --- | --- |
| `draft` | 追踪记录草稿。 |
| `implemented` | 已记录实现路径。 |
| `verified` | 已记录验证结果。 |
| `partial` | 部分完成或部分验证。 |

## 6. 新需求流程

当用户提出新功能、新接口、新交互或新协作规则时，AI 必须按以下流程处理。

### 6.1 生成 SPEC

1. 读取相关已有文档，包括 `AGENTS.md`、`docs/`、`docs/ai-collab/`、`agenthub-web/docs/specs/`、`vibeCodingPlan/`、`vibeCodingSummary/`。
2. 判断是否已有可复用 spec 或历史设计。
3. 若已有，优先扩展或引用现有节点，不重复创建同义 spec。
4. 若没有，创建新的 `SPEC-*`。
5. SPEC 必须包含目标、范围、非目标、输入输出、关键约束、验收标准和源资产引用。

### 6.2 生成 PLAN

1. PLAN 必须引用一个或多个 SPEC。
2. PLAN 必须说明实施范围、涉及模块、接口或组件、风险和验证方式。
3. 新功能默认需要用户确认，`review.required` 必须为 `true`。
4. 在用户明确确认前，不进入业务代码实现阶段。

### 6.3 拆分 TASK

1. TASK 必须足够小，能够独立实施和验收。
2. TASK 必须引用父 PLAN 和相关 SPEC。
3. TASK 应明确预期触达路径，但实际触达路径以实施后的 `implements` 和 TRACE 为准。
4. 涉及前后端契约时，至少拆分出契约更新或契约校验任务。

### 6.4 实施 IMPLEMENTS

1. 实施前必须读取目标文件上下文。
2. 必须遵循 `AGENTS.md` 和 `.vibe-coding/workflow.md` 的工程约定。
3. 后端接口必须遵循统一响应格式 `{ code, data, message }`、snake_case 存储、camelCase 序列化、分页和日期格式约定。
4. SSE 相关实现必须遵循既有 SSE 事件规范。
5. 若发现实际实现必须偏离 PLAN，必须记录偏离原因，并在必要时先向用户确认。

### 6.5 回写 TRACE 与 SUMMARY

1. 实施后必须创建或更新 `TRACE-*`。
2. TRACE 必须记录实际触达路径、验证结果、偏离项和后续事项。
3. 若已有 `vibeCodingSummary/` 记录，应在 TRACE 中链接该 summary。
4. 若本次任务需要新增 summary，应遵循 `.vibe-coding/summary-template.md`。
5. 若未能运行验证，必须在 TRACE 和最终回复中说明原因。

## 7. 历史补录流程

历史补录用于将 Claude Code 或 Codex 已经沉淀的计划、总结、决策和规格文档纳入图谱。

### 7.1 选择补录对象

优先选择同时具备以下条件的功能：

1. 有明确 plan。
2. 有明确 summary 或 decision。
3. 能在源码中找到主要实现路径。
4. 功能边界相对清楚。

首批候选：

- 群聊 DAG 执行与 Orchestrator 总结重构。
- PPT 内联浏览。
- 产物预览与编辑。

### 7.2 补录步骤

1. 阅读相关 source assets。
2. 从历史文档中提炼能力边界，生成 `SPEC-*`。
3. 将历史 plan 映射为 `PLAN-*`，不要重写原 plan 全文。
4. 按已经完成的工作拆出 `TASK-*`。
5. 根据 summary、git diff、测试和代码路径生成 `TRACE-*`。
6. 在每个节点的 `source_assets` 中记录原始文档路径。
7. 对无法确认的信息使用 `unknown` 或在正文中标注“待确认”，不得臆造。

### 7.3 补录限制

1. 历史补录不得修改业务代码。
2. 历史补录不得为了让链路看起来完整而伪造用户确认、测试结果或实现路径。
3. 如果历史 plan 与实际实现不一致，应在 TRACE 的 `deviations` 中记录。
4. 如果一个历史文档覆盖多个能力，应拆成多个 SPEC，而不是创建一个过宽节点。

## 8. 实施追踪规则

实施追踪的核心目标是回答“这项任务到底改了哪里、如何验证、与计划是否一致”。

### 8.1 implements 记录范围

`implements` 可以包含：

- 后端源码。
- 前端源码。
- 测试文件。
- migration。
- 配置文件。
- 文档。
- mock 或 fixture。

不应包含：

- 与任务无关的偶然改动。
- 临时文件。
- 未被实际修改或引用的路径。

### 8.2 验证记录

验证记录应包含：

```yaml
verification:
  - command: pytest backend/tests/services/test_x.py
    result: passed
    notes: 覆盖核心服务逻辑
```

如果未运行验证：

```yaml
verification:
  - command: npm test
    result: not_run
    notes: 当前环境缺少依赖，未执行
```

### 8.3 偏差记录

当实际实现与 PLAN 不一致时，必须记录：

```yaml
deviations:
  - plan_item: 原计划修改 X
    actual: 实际改为 Y
    reason: 发现 X 与现有架构冲突
```

## 9. 总结回写规则

SUMMARY 是图谱链路的收口，既可以复用 `vibeCodingSummary/` 中已有总结，也可以新增总结。

总结必须覆盖：

1. 完成了哪些 SPEC、PLAN、TASK。
2. 实际修改了哪些文件。
3. 运行了哪些验证。
4. 哪些内容未完成或需要后续处理。
5. 是否存在与原计划不一致的地方。

若新增 summary，应优先放在 `vibeCodingSummary/`，并在对应 TRACE 的 `summaries` 中引用。

## 10. AI 操作约束

后续 AI 在 AgentHub 仓库中执行 Vibecoding 工作时，必须遵守以下约束。

### 10.1 文件与代码约束

1. 未经用户要求，不得修改业务代码来“配合”图谱补录。
2. 创建或更新图谱节点时，默认只修改 `docs/vibe-graph/`。
3. 更新历史 source asset 前必须确认这是用户明确要求，而不是索引补录需要。
4. 不得删除或移动历史 `vibeCodingPlan/`、`vibeCodingSummary/`、`docs/` 文档。

### 10.2 事实约束

1. 不得将未验证的实现标记为 `verified`。
2. 不得将未确认的 plan 标记为 `approved`。
3. 不得伪造测试命令结果。
4. 不得凭记忆填写实现路径，必须读取仓库文件或明确标注待确认。
5. 不得把 AI 推测当作历史事实；推测必须写入正文说明。

### 10.3 流程约束

1. 新功能实施前必须存在可追溯的 SPEC 与 PLAN。
2. 新功能 PLAN 在进入代码实现前必须得到用户确认，除非用户明确要求直接实现。
3. 实施完成后必须回写 TRACE。
4. 涉及前后端接口、SSE、数据结构或响应格式时，必须检查 `docs/AgentHub 响应格式与前后端对齐约定.md` 或对应契约文档。
5. 发现需求与既有文档冲突时，必须先指出冲突，由用户决定修改文档还是调整需求。

### 10.4 粒度约束

1. SPEC 应按能力单元拆分，而不是按文件或函数拆分。
2. TASK 应按可独立实施和验收的工作单元拆分。
3. 一个 PLAN 可以覆盖多个 TASK，但不应覆盖多个互不相关的 SPEC。
4. 一个 TRACE 可以关联多个 TASK，但必须清楚列出每个 TASK 的实现和验证情况。

## 11. 与现有流程的关系

既有 `.vibe-coding/workflow.md` 的闭环是：

```text
Plan -> Review -> Implement -> Summarize
```

Vibe Graph 在其前后补充索引节点：

```text
SPEC -> Plan -> Review -> Task -> Implement -> Trace -> Summarize
```

对应关系：

| 既有流程 | 图谱节点 |
| --- | --- |
| Plan | `PLAN` |
| Review | `PLAN.review` |
| Implement | `TASK` + `IMPLEMENTS` |
| Summarize | `TRACE` + `SUMMARY` |

因此，Vibe Graph 不是替代既有流程，而是为既有流程补充更稳定的追溯结构。

## 12. 负责人交付规则

当用户要求将 Vibecoding 过程中的 spec、skill、rules 等协作规范交付给项目负责人时，应按以下规则收口。

### 12.1 交付包组成

交付包至少包含：

1. `docs/vibe-graph/handoff.md`：面向负责人的总览入口。
2. `docs/vibe-graph/rules.md`：AI 协作规则。
3. `docs/vibe-graph/SKILL.md`：后续 AI 可复用的仓库内 Skill。
4. `docs/vibe-graph/prompts.md`：固定协作口令。
5. `docs/vibe-graph/templates/`：节点模板。
6. `docs/vibe-graph/references/node-schema.md`：schema 参考。
7. `docs/vibe-graph/scripts/validate-vibe-graph.py`：校验脚本。
8. 至少一个业务样例链路，推荐至少两个。

### 12.2 交付验收标准

交付前必须确认：

1. 协作规范自身有 `SPEC-AICOLLAB-*` 链路，避免规则只是散文档。
2. 至少一个历史业务功能已完成 `SPEC -> PLAN -> TASK -> TRACE` 补录。
3. `TRACE` 记录真实 implements、verification、deviations 和 followups。
4. `handoff.md` 能独立解释背景、目录、使用方式、样例和验收清单。
5. `validate-vibe-graph.py` 运行通过。

### 12.3 交付限制

1. 交付协作规范不应顺手修改业务代码。
2. 不得为了显得完整而伪造测试结果、用户确认或实现路径。
3. 未重新运行的业务验证必须明确标记为 `not_run` 或说明来自历史 summary。
4. 交付说明应区分“已完成规范资产”和“后续可继续补录的历史功能”。
