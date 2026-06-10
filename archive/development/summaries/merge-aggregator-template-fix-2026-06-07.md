# Merge Aggregator Template Variable 修复

**Date:** 2026-06-07  
**Status:** Fixed  
**Issue:** Orchestrator 总结 LLM 崩溃 `KeyError: 'Context variable not found: id'`

---

## 问题症状

DAG workflow 成功执行完所有 subtask（3 个 Agent 都完成并生成输出），但在最后生成 Orchestrator 总结时崩溃：

```
KeyError: 'Context variable not found: `id`.'
  File ".../google/adk/utils/instructions_utils.py", line 122, in _replace_match
    raise KeyError(f'Context variable not found: `{var_name}`.')
```

堆栈显示错误发生在 `orchestrator_summary` 节点的 `_process_agent_instruction` 阶段，ADK 尝试从 session state 中解析 instruction 中的模板变量 `{+id}+` 失败。

---

## 根因分析

### 1. 触发路径

`merge_aggregator.py:summarize_with_llm()` 方法中：

```python
# 旧代码（错误）
summary_escaped = (s.summary or '(无输出)').replace('{', '{{').replace('}', '}}')
user_request_escaped = (user_request or '(未提供)').replace('{', '{{').replace('}', '}}')

instruction = (
    "你是本次多 Agent 协作的协调者...直接输出总结正文，不要复述指令。\n\n"
    f"用户的原始需求:\n{user_request_escaped}\n\n"
    f"各 Agent 的输出:\n{outputs_text}"
)
```

### 2. 为什么转义无效

- CLI Agent 的输出包含 `previews/{id}.html` 和 `/preview/{id}` 等路径
- 转义后变成 `previews/{{id}}.html`
- ADK 的模板变量正则是 `r'{+[^{}]*}+'`，会匹配 `{{id}}`（两个或多个连续 `{`）
- 匹配后提取出变量名 `id`，尝试从 session state 中查找 `state['id']`
- 找不到 → `KeyError`

### 3. ADK 模板变量机制

ADK 在 `instructions_utils.inject_session_state()` 中：
- 正则 `r'{+[^{}]*}+'` 匹配所有 `{...}` 和 `{{...}}` 模式
- 提取变量名（去掉前后的 `{` 和 `}`）
- 调用 `state.get(var_name)` 查找值
- 找不到抛出 `KeyError`

**根本问题**：动态内容（用户输入、Agent 输出）不应放在 `instruction` 中，因为 instruction 会被 ADK 当作模板解析。

---

## 修复方案

### 核心原则

**将动态内容通过 `message` 参数传递，只在 `instruction` 中放置静态系统提示。**

### 修改内容

`backend/app/services/adk/merge_aggregator.py:176-204`

**Before:**
```python
# 转义花括号（无效）
summary_escaped = (s.summary or '(无输出)').replace('{', '{{').replace('}', '}}')
user_request_escaped = (user_request or '(未提供)').replace('{', '{{').replace('}', '}}')

# 动态内容拼接到 instruction（错误）
instruction = (
    "你是本次多 Agent 协作的协调者...直接输出总结正文，不要复述指令。\n\n"
    f"用户的原始需求:\n{user_request_escaped}\n\n"
    f"各 Agent 的输出:\n{outputs_text}"
)
agent = LlmAgent(name="orchestrator_summary", model=model, instruction=instruction)
runner = AgentHubRunner(agent=agent, app_name="agenthub_summary")
events = await runner.run_single_turn(
    user_id="summary",
    session_id=f"summary-{orch_task_id}",
    message="请总结以上协作结果。",  # 静态消息
)
```

**After:**
```python
# 无需转义 - 动态内容不进 instruction
summary_text = s.summary or '(无输出)'

# 静态 instruction（无模板变量）
instruction = (
    "你是本次多 Agent 协作的协调者(Orchestrator)。各专家 Agent 已完成各自子任务。"
    "请阅读它们的输出，向用户给出一段自然语言总结：说明整体完成了什么、各 Agent 的贡献、"
    "是否存在失败或冲突、以及给用户的结论或后续建议。直接输出总结正文，不要复述指令。"
)

# 动态内容放在 message 中
user_message = (
    f"用户的原始需求:\n{user_request or '(未提供)'}\n\n"
    f"各 Agent 的输出:\n{outputs_text}\n\n"
    "请总结以上协作结果。"
)

agent = LlmAgent(name="orchestrator_summary", model=model, instruction=instruction)
runner = AgentHubRunner(agent=agent, app_name="agenthub_summary")
events = await runner.run_single_turn(
    user_id="summary",
    session_id=f"summary-{orch_task_id}",
    message=user_message,  # 动态内容通过 message 传递
)
```

---

## 影响范围

- **修改文件**：`backend/app/services/adk/merge_aggregator.py`（1 处）
- **影响功能**：群聊 DAG 执行后的 Orchestrator LLM 总结
- **兼容性**：无 API 变更、无数据库变更、无前端变更
- **风险评估**：极低 —— 只改了内部实现，外部接口不变

---

## 验证方法

**复现路径**（修复前）：
1. 群聊选 3 个 Agent（5.4 / 4.8 / Claude Code CLI）
2. 发消息「写一个 hello 页面，部署到 8090 端口」
3. 确认计划
4. 3 个 Agent 依次执行完成
5. 崩溃在 `orchestrator_summary` 节点，后端日志显示 `KeyError: 'Context variable not found: id'`

**验证点**（修复后）：
1. 相同路径重新执行
2. 3 个 Agent 成功完成
3. **Orchestrator 成功生成自然语言总结**（不再崩溃）
4. 前端显示最后一条 orchestrator 消息，内容为 LLM 生成的总结段落
5. 后端日志无 `KeyError`

---

## 架构教训

### 1. ADK 模板变量的适用范围

**正确用法**：
- `instruction` 中只放**静态系统提示**
- 可使用 ADK 定义的变量（如 `{+user_id}+`、`{+session_id}+`），前提是你在 session state 中设置了它们

**错误用法**：
- 把用户输入、Agent 输出、文件路径等动态内容拼接到 `instruction`
- 即使转义了 `{` 和 `}`，ADK 的正则仍会匹配 `{{...}}`

### 2. 动态内容的正确传递方式

```python
# ✅ 正确
instruction = "静态系统提示"
message = f"动态内容: {user_input}"
runner.run_single_turn(message=message)

# ❌ 错误
instruction = f"静态系统提示\n动态内容: {user_input}"
runner.run_single_turn(message="")
```

### 3. 转义不是银弹

- `replace('{', '{{')` 只是把一个花括号变成两个
- ADK 的正则 `r'{+[^{}]*}+'` 会匹配**一个或多个**连续的 `{`
- 转义后的 `{{id}}` 仍然会被匹配并解析

### 4. 日志与可观测性

关键日志应打印完整的 instruction 内容（脱敏后），便于定位模板变量问题。本次问题如果有 instruction 日志，能更快定位到 `{id}` 的来源。

---

## 相关记录

- `docs/ai-collab/decisions/002-group-chat-dag-execution.md` — DAG 执行架构
- `docs/ai-collab/decisions/004-workflow-instruction-propagation-fix.md` — Workflow instruction 传递修复
- `CLAUDE.md` 纠正类规则 — 新增「LlmAgent instruction 动态内容」规则
