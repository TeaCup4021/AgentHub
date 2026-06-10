# 003 — 多 Agent 编排修复汇总（2026-06-06晚）

## 状态
已实施

## 背景
2026-06-06 晚联调发现多个影响多 agent 编排体验的问题:
1. **4.8 越权分工** — Claude Opus 4.8 被分配一个 subtask 后，把所有工作自己做完
2. **加载气泡延迟** — 多 @ 比单 @ 明显慢
3. **确认后空气泡** — 用户确认计划后，orchestrator 显示空白消息气泡
4. **刷新后 agent 回复消失** — 刷新页面后已回复的 agent 消息从数据库消失
5. **任务分配下拉框冗余** — @ 机制已支持指定 planner，下拉框成为多余 UI
6. **CLI agent 无法参与 DAG** — Claude Code CLI 和 Codex CLI 在群聊编排时被 ValidationError 拒绝
7. **Planner 超时 90s** — deepseek-v4-pro 规划复杂任务时超时，前端气泡消失

## 问题分析

### 问题 #1: 4.8 越权分工
**现象**: planner 把「写 HTML」分给 4.8、「部署服务」分给 CLI，但 4.8 把两件事都做了。

**根因**: Planner LLM 给 executor 的 instruction 写成「你来主导开发，分配...」，executor 误以为自己是二级协调者。

**影响**: 多 agent 协作退化为单 agent 串行，失去并行优势。

### 问题 #2: 加载气泡延迟
**现象**: `@4.8 @5.4` 比 `@5.4` 慢 3-5 秒出计划卡。

**根因**: 多 @ 路径多一次消歧 LLM 调用（`_disambiguate_orchestrator`）+ planner 调用，串行耗时。

**影响**: 用户体验感知慢，但这是多 @ 的固有成本，非 BUG。

### 问题 #3: 确认后空气泡
**现象**: 用户确认计划后，orchestrator 显示一个空白消息气泡（无文字、无卡片）。

**根因**: orchestrator 消息原本包含计划文本，`cleanContent` 裁掉后内容为空。但因消息有 `plan` artifact（元数据类型、不可视），渲染守卫 `hasRenderableArtifact` 统计时误判为「有卡片可渲染」，导致整条消息渲染出来但显示为空。

**影响**: UI 出现无意义空气泡，用户困惑。

### 问题 #4: 刷新后 agent 回复消失
**现象**: 群聊中 agent 正在回复时刷新页面，再打开会话时已回复的部分消息消失。

**根因**: `_accumulate_stream_events` 只在事件循环正常结束时落库 incomplete 消息。刷新页面触发 `GeneratorExit`，except 捕获后直接 break，未执行 fallback 持久化。

**影响**: 数据丢失，用户需要重新提问。

### 问题 #5: 任务分配下拉框冗余
**现象**: 群聊界面顶部有「任务分配」下拉框选 planner，但 @ 机制已支持指定，两者功能重复。

**根因**: 历史遗留 UI，在 @ 指定 planner 功能实现后未清理。

**影响**: UI 混乱，用户不知该用哪个。

### 问题 #6: CLI agent 无法参与 DAG
**现象**: planner 把任务分给 Claude Code CLI，执行时报 ValidationError:
```
Agent 'agent_xxx' has mode='task' and cannot be used as a workflow graph node
```

**根因**: `cli_adapter.py:243` 硬编码 `mode="task"`，而 ADK Workflow 图只接受 `mode="single_turn"` 节点。

**影响**: CLI agent 无法参与多 agent 编排，能力受限。

### 问题 #7: Planner 超时 90s
**现象**: 群聊规划 3-agent 任务时，等待 90 秒后提示超时，计划未生成，气泡消失。

**根因**: deepseek-v4-pro API 响应慢，90 秒超时不够。

**影响**: 用户无法使用群聊功能，体验严重受损。

## 决策

### 修复 #1: 双层约束防止 executor 越权
**Planner prompt 层**:
- `planner.py` 规则 #3 明确要求 instruction 必须是「executor 独自可完成、只产出自己那份交付物」的具体任务
- 禁止写「你来统筹/分配/主导」类指令

**Executor 执行层**:
- `workflow_builder.py` 新增 `_EXECUTOR_SCOPE_DIRECTIVE`
- 每个 executor 节点构建时注入 `[SYSTEM]` 指令:
  ```
  [SYSTEM] 你只负责完成上述任务，不要试图统筹或分配其他工作。
  只产出你自己这部分的交付物，其他子任务由其他 Agent 完成。
  ```
- 双层防护: LLM 不听 prompt → 执行层硬兜底

**权衡**: 注入系统指令会增加 prompt 长度(~50 tokens/agent)，但换来编排正确性，值得。

### 修复 #2: 无修复(体验优化暂不做)
**决策**: 多 @ 的延迟是消歧 + 规划的固有成本，暂不优化。

**未来可选方案**:
- 消歧改为并行调用 Planner(每个候选 agent 一个 prompt)，最快的用
- 前端加 loading 动画提示「正在选择协调者...」

### 修复 #3: 渲染守卫只统计可视 artifact
**决策**: `MessageList.tsx:renderableArtifacts` 只统计**可视类型**:
- `code`, `diff`, `preview`, `file`, `document`, `link`, `deploy_status`
- 排除 `plan`, `orchestrator_summary`(元数据类型)

**逻辑**:
```tsx
const renderableArtifacts = message.artifacts?.filter(
  a => !['plan', 'orchestrator_summary'].includes(a.artifactType)
) || []

if (!cleanContent && renderableArtifacts.length === 0 && !hasThinking) {
  return null  // 整条不渲染
}
```

**权衡**: plan 和 summary 不再视为「可渲染」，符合语义(它们是后端元数据)。

### 修复 #4: try/finally 包住事件循环
**决策**: `_accumulate_stream_events` 改为:
```python
try:
    async for event in stream:
        # 累加逻辑
except GeneratorExit:
    pass  # 客户端断开，正常
finally:
    await _flush_incomplete(...)  # 无论如何都落库
```

**_flush_incomplete**: 抽取 fallback 持久化逻辑，对所有 incomplete 累加器:
- 写入 DB (content + status)
- yield `message_end` 事件

**权衡**: finally 无法 yield，需把 `message_end` 改为通过 queue 传递或不 yield(前端依赖 `invalidateQueries` 刷新)。当前实现直接落库不 yield。

### 修复 #5: 深度清理任务分配下拉框
**前端**:
- 删除 `plannerAgentId` state/ref
- 删除整个下拉框 UI
- 所有 API 调用不再传 `plannerAgentId`

**后端**:
- `MessageCreate` schema 删除 `planner_agent_id` 字段
- `refine_plan` 删除「用户审视时改 dropdown」逻辑
- `auto_orchestrate` 简化为:
  - 单 @ → 该 agent 当 planner
  - 多 @ → 消歧器选一个
  - 无 @ → `planner_agent_id=None` → 默认 orchestrator(deepseek)

**权衡**: 删除一个用户可能习惯的 UI，但 @ 机制更符合聊天直觉，且减少混淆。

### 修复 #6: CLI mode 改为 single_turn
**决策**: `cli_adapter.py:243` 改为 `mode="single_turn"`

**原理**:
- ADK Workflow 校验拒绝 `mode="task"`
- CLI agent 通过 `before_model_callback` 拦截 LLM 调用，mode 只是元数据
- `single_turn` 允许进入 Workflow 图，before_model_callback 仍能启动子进程

**权衡**: CLI agent 现在可参与 DAG，但每个 subtask 仍启动独立子进程(已知问题 #8 待优化)。

### 修复 #7: Planner 超时提升到 180s
**决策**: `conversations.py:521` 改为:
```python
_PLANNER_TIMEOUT_SECONDS = int(os.getenv("AGENTHUB_PLANNER_TIMEOUT", "180"))
```

**影响范围**:
- `_orchestrator_plan_stream`(初次规划)
- `_refine_plan_stream`(反馈后重规划)

**权衡**: 180s 仍可能不够(deepseek API 不稳定)，但再提高会影响用户耐心。建议 @ 指定 Claude 模型当 planner。

## 结果

### 改动文件
**后端(7 个文件)**:
- `backend/app/services/adk/planner.py` — 规则 #3 强化
- `backend/app/services/adk/workflow_builder.py` — `_EXECUTOR_SCOPE_DIRECTIVE` 注入
- `backend/app/api/v1/conversations.py` — `_PLANNER_TIMEOUT_SECONDS` 改 180、`_accumulate_stream_events` 加 try/finally
- `backend/app/api/v1/messages.py` — 删除 `planner_agent_id` 逻辑
- `backend/app/schemas/message.py` — `MessageCreate` 删字段
- `backend/app/services/adapters/cli_adapter.py` — `mode="single_turn"`

**前端(1 个文件)**:
- `agenthub-web/src/components/layout/ChatArea.tsx` — 删下拉框 UI + state + 传参
- `agenthub-web/src/components/chat/MessageList.tsx` — 渲染守卫改用 `renderableArtifacts`

### 验证方法
1. **4.8 越权** — `@4.8 @5.4 @CLI` 发复杂任务，检查各 agent 是否只做自己那份
2. **空气泡** — 确认计划后检查无空白消息
3. **刷新丢失** — agent 回复中途刷新页面，检查已回复部分是否保留
4. **下拉框** — 检查群聊界面顶部无「任务分配」下拉框
5. **CLI DAG** — planner 分配任务给 CLI，检查无 ValidationError
6. **超时** — 复杂任务规划在 180s 内完成

### 风险
- **Executor 注入指令**: 部分 LLM 可能仍不遵守，需后续监控
- **CLI 子进程**: 每个 subtask 仍启动独立会话，性能待优化(已知问题 #8)
- **deepseek 超时**: 180s 仍可能不够，建议用户 @ 指定其他 planner

## 相关文档
- `docs/ai-collab/decisions/orchestration/002-group-chat-dag-execution.md` — DAG 执行重构
- `CLAUDE.md` — 规则章节新增 5 条纠正类规则
