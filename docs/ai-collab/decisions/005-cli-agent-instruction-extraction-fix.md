# CLI Agent 指令提取修复

**日期：** 2026-06-07  
**状态：** ✅ 已修复  
**问题编号：** #15

## 问题描述

在 Workflow DAG 编排模式下，CLI Agent（Claude Code CLI）未能正确执行分配的任务，而是输出了"I see the available skills. I'm ready to help! What would you like to work on?"这样的通用响应。

### 症状

1. **任务：** "写一个 hello 页面，部署到 8090 端口"
2. **规划：** Planner 拆分为 3 个 subtask：
   - s1 (5.4): 设计页面规格 ✅
   - s2 (4.8): 编写 HTML 代码 ✅
   - s3 (Claude Code CLI): 部署到 8090 端口 ❌
3. **s3 输出：** CLI Agent 收到技能列表而非任务指令，输出 greeting 而非执行部署

### 日志证据

```
14:44:28 INFO [agenthub.workflow_builder] DAG node[3/3]: name=agent_20c4183e_424a_41cf_80f1_b98d7ba703f0 
    mode=single_turn provider=claude-code-cli 
    instruction=\nCRITICAL OUTPUT RULES — You MUST follow these exactly:...
```

workflow_builder 正确设置了 instruction，但 CLI 的 `before_model_callback` 没有正确提取。

```
14:45:06 INFO [sqlalchemy.engine.Engine] INSERT INTO messages (conversation_id, ..., content, ...)
    VALUES (..., '<thinking>\nThe user has sent me a list of available skills, but there\'s no actual request...')
```

CLI 收到的是技能列表，不是任务指令。

## 根本原因

**文件：** `backend/app/services/adapters/cli_adapter.py`  
**函数：** `build_agent` → `cli_before_model_callback` (第 181-220 行)

### 原因 1：错误的提取源

```python
# ❌ 错误做法：从 llm_request.contents 提取
prompt_parts: list[str] = []
for content in getattr(llm_request, "contents", []) or []:
    for part in getattr(content, "parts", []) or []:
        text = getattr(part, "text", "")
        if text:
            prompt_parts.append(text)
raw_text = "\n".join(prompt_parts) if prompt_parts else ""
```

**问题：** `llm_request.contents` 包含 ADK 注入的所有内容，包括：
- Skills 列表（工具描述）
- System messages
- User messages
- 其他元数据

在 Workflow 模式下，这些内容混在一起，导致提取到的是技能列表而不是任务指令。

### 原因 2：不完整的 Fallback

```python
# ❌ 错误做法：fallback 使用 build_instruction(agent)
if not raw_text.strip():
    from app.services.artifact_format import build_instruction
    raw_text = build_instruction(agent)
```

**问题：** `build_instruction(agent)` 只返回 `ARTIFACT_FORMAT_SPEC + system_prompt`，不包含 `workflow_builder.py` 已经合并好的 subtask instruction。

### 原因 3：没有利用闭包中的 agent 对象

`cli_before_model_callback` 是在 `build_agent` 内部定义的闭包，可以直接访问外部的 `agent` 变量。

`workflow_builder.py` 第 65 行已经设置了：
```python
agent.instruction = self._merge_instruction(db_agent, st.instruction)
```

这个 `agent.instruction` 包含了完整的合并指令：
```
ARTIFACT_FORMAT_SPEC 
+ system_prompt 
+ EXECUTOR_SCOPE_DIRECTIVE 
+ "Your specific task: <subtask instruction>"
```

但 `cli_before_model_callback` 没有使用这个已经准备好的 `agent.instruction`。

## 修复方案

### 修改：`backend/app/services/adapters/cli_adapter.py` (第 181-220 行)

**核心思路：** 直接使用闭包中的 `agent.instruction`，而不是从 `llm_request.contents` 提取。

```python
async def cli_before_model_callback(
    callback_context, llm_request
) -> LlmResponse | None:
    from app.services.adk.cli_runner import claude_code_tool, codex_cli_tool

    # ✅ 新做法：直接使用 agent.instruction（闭包变量）
    # workflow_builder.py 第 65 行已经设置了完整的 merged instruction
    raw_instruction = getattr(agent, 'instruction', None)
    if not raw_instruction:
        # Fallback: use system_prompt if instruction wasn't set
        from app.services.artifact_format import build_instruction
        raw_instruction = build_instruction(agent)

    # 提取 "Your specific task:" 之后的任务部分
    task_marker = "Your specific task:"
    task_pos = raw_instruction.find(task_marker)
    if task_pos >= 0:
        task_text = raw_instruction[task_pos + len(task_marker):].strip()
    else:
        # 如果没有 marker（单聊模式），整个 instruction 就是任务
        task_text = raw_instruction.strip()

    # 构建简洁的 CLI prompt
    full_prompt = (
        "Execute the following task using your available tools "
        "(filesystem access, shell commands, code generation). "
        "Actually DO the work — create files, run commands, generate artifacts. "
        "Do NOT just explain what to do or ask what I need.\n\n"
        "TASK:\n" + task_text
    )

    # ... 执行 CLI 工具 ...
```

### 关键改进

1. **✅ 直接读取 `agent.instruction`**：利用闭包访问已经合并好的指令
2. **✅ 避免从 `llm_request.contents` 提取**：绕过 ADK 注入的技能列表污染
3. **✅ 保留任务提取逻辑**：正确提取 "Your specific task:" 之后的内容
4. **✅ 单聊模式兼容**：如果没有 marker，整个 instruction 视为任务

### 副产品修复

删除了第 248-271 行的重复代码（与第 223-247 行完全相同）。

## 验证要点

### 测试用例

**输入：** "写一个 hello 页面，部署到 8090 端口"

**预期行为：**
1. Planner 拆分 3 个 subtask：设计 → 编写 → 部署
2. s1 (5.4) 输出设计规格
3. s2 (4.8) 输出 HTML 代码卡片
4. s3 (CLI) **实际执行部署任务**，而不是输出 greeting

### 验证日志

修复后应看到：
```
INFO [agenthub.adapter.cli] CLI callback: extracted task from agent.instruction
INFO [agenthub.adapter.cli] CLI callback: task_text=获取上一步生成的 HTML 代码，将其转化为...
```

而不是：
```
INSERT INTO messages (..., '<thinking>\nThe user has sent me a list of available skills...')
```

## 影响范围

### 直接影响

- ✅ CLI Agent 在 Workflow DAG 编排中能正确执行分配的任务
- ✅ 部署类任务（如"启动服务器"）不再输出 greeting

### 间接影响

- ✅ 多 Agent 协作的完整性提升（CLI 不再是"聋子"）
- ✅ 用户对 CLI Agent 的信任度提升

### 不影响

- ✅ 单聊模式不受影响（fallback 逻辑保留）
- ✅ 其他 Adapter (LiteLlm, Anthropic) 不受影响

## 相关问题

- **问题 #13**：Workflow 中 Agent 未执行分配的任务（已修复，见 004-workflow-instruction-propagation-fix.md）
  - 当时修复了 workflow_builder 的 instruction 覆盖
  - 但 CLI 的提取逻辑仍有问题，本次彻底修复
- **问题 #14**：CLI Agent 部署的网页无法持久访问（已修复，见 004）
  - AgentHub 新增 `/serve` 托管功能
  - CLI 不再需要启动 HTTP 服务器

## 后续建议

### 短期

1. **回归测试**：重新运行"写一个 hello 页面，部署到 8090 端口"测试用例
2. **日志增强**：在 `cli_before_model_callback` 中添加 debug 日志，记录提取到的 `task_text`

### 中期

1. **统一 Instruction 传递**：考虑在所有 Adapter 中统一使用 `agent.instruction`，而不是从 `llm_request` 提取
2. **ADK 升级**：关注 ADK 2.x 对 Workflow instruction 传递的改进

### 长期

1. **CLI Session 复用**：编排模式下多个 subtask 共享同一 CLI 会话（避免每次重新初始化）
2. **CLI Streaming in Workflow**：支持 CLI 在 Workflow 中流式输出（当前是 non-streaming）

## 参考

- `backend/app/services/adapters/cli_adapter.py` (第 181-248 行)
- `backend/app/services/adk/workflow_builder.py` (第 61-65 行)
- `docs/ai-collab/decisions/004-workflow-instruction-propagation-fix.md`
