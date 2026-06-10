# 006 — CLI Agent 语言输出和任务执行修复

**日期：** 2026-06-07  
**状态：** ✅ 已实施  
**影响模块：** `backend/app/services/adapters/cli_adapter.py`

## 问题描述

### 症状

用户中文提问群聊，Planner 拆分 3 个 subtask，Claude Code CLI Agent 应执行部署网页的任务，但出现两个问题：

1. **输出英文而非中文**：CLI 回复 "I see the available skills. I'm ready to help! What would you like to work on?" 等英文 greeting
2. **未执行分配的任务**：网页没有生成，任务根本没执行

### 用户期望

CLI Agent 应该：
1. 用与用户请求相同的语言（中文）输出
2. 真正执行 Planner 分配的具体任务（生成 HTML 网页）

## 根因分析

### 根因 1：闭包访问 ORM 对象而非 LlmAgent 实例

**错误代码**（`cli_adapter.py:197`）：
```python
async def cli_before_model_callback(callback_context, llm_request) -> LlmResponse | None:
    # 闭包中的 agent 是 ORM Agent 模型（数据库对象）
    raw_instruction = getattr(agent, 'instruction', None)  # ❌ 返回 None
    if not raw_instruction:
        # Fallback 分支，使用 system_prompt
        from app.services.artifact_format import build_instruction
        raw_instruction = build_instruction(agent)
```

**问题**：
- 闭包中的 `agent` 是 **ORM Agent 模型**（`app.models.agent.Agent`），这是数据库对象
- ORM 模型**没有 `instruction` 字段**（只有 `system_prompt`, `provider`, `model` 等数据库列）
- `getattr(agent, 'instruction', None)` 永远返回 `None`，进入 fallback 分支
- Fallback 只拿到 `system_prompt`（通用能力描述），拿不到 Planner 分配的具体任务

**真正的 instruction 在哪**：
- `workflow_builder.py:65` 覆盖的是 **`LlmAgent` 实例**的 `instruction` 属性：
  ```python
  agent = adapter.build_agent(db_agent, tool_loader=tool_loader)
  agent.instruction = self._merge_instruction(db_agent, st.instruction)  # ← 这里
  ```
- `_merge_instruction` 返回的是：`ARTIFACT_FORMAT_SPEC + system_prompt + EXECUTOR_SCOPE_DIRECTIVE + "Your specific task: " + <Planner 分配的任务>`
- 但 `cli_adapter.py` 的 callback 闭包无法访问这个 `LlmAgent` 实例

### 根因 2：硬编码英文指令覆盖语言约束

**错误代码**（`cli_adapter.py:215-221`）：
```python
# Build a concise, action-oriented prompt for CLI
full_prompt = (
    "Execute the following task using your available tools "  # ❌ 硬编码英文
    "(filesystem access, shell commands, code generation). "
    "Actually DO the work — create files, run commands, generate artifacts. "
    "Do NOT just explain what to do or ask what I need.\n\n"
    "TASK:\n" + task_text
)
```

**问题**：
- 即使提取到正确的 `task_text`（Planner 用中文写的任务），前面加了硬编码的英文指令
- Planner 规则 #7 要求："instruction 用与用户请求相同的语言书写并要求 Agent 用该语言回复"
- 硬编码英文覆盖了 Planner 的语言约束

## 解决方案

### 修复 1：通过可变容器访问 LlmAgent 实例

**修改**（`cli_adapter.py:162-277`）：

```python
def build_agent(self, agent: Agent, tool_loader=None) -> LlmAgent:
    provider = (agent.provider or "").lower()

    # ✅ 创建可变容器，callback 通过它访问 LlmAgent 实例
    llm_agent_ref = {"instance": None}

    async def cli_before_model_callback(callback_context, llm_request) -> LlmResponse | None:
        # ✅ 从容器读取 LlmAgent 实例（而非闭包中的 ORM agent）
        llm_agent_instance = llm_agent_ref.get("instance")
        if llm_agent_instance and hasattr(llm_agent_instance, 'instruction'):
            raw_instruction = llm_agent_instance.instruction  # ← workflow_builder 已覆盖
        else:
            # Fallback: use system_prompt if LlmAgent wasn't set
            from app.services.artifact_format import build_instruction
            raw_instruction = build_instruction(agent)

        # 提取 "Your specific task:" 后的任务文本
        task_marker = "Your specific task:"
        task_pos = raw_instruction.find(task_marker)
        if task_pos >= 0:
            task_text = raw_instruction[task_pos + len(task_marker):].strip()
        else:
            task_text = raw_instruction.strip()

        # ✅ 直接传递 task_text，不加英文指令头
        full_prompt = task_text

        # ... 调用 CLI ...

    # Build description with capability tags for Coordinator matching
    capabilities = agent.capabilities or []
    # ... description 构建逻辑 ...

    # ✅ 构建 LlmAgent 并存入容器
    llm_agent = LlmAgent(
        name=agent.name.replace(" ", "_").replace("-", "_"),
        description=description,
        instruction=agent.system_prompt or "You are a helpful coding agent.",
        before_model_callback=cli_before_model_callback,
        mode="single_turn",
    )

    # ✅ 存入容器，callback 可以访问到
    llm_agent_ref["instance"] = llm_agent

    return llm_agent
```

**关键点**：
1. **可变容器 `llm_agent_ref`**：字典是可变对象，闭包可以读写其内容
2. **返回前赋值**：`build_agent` 返回前设置 `llm_agent_ref["instance"] = llm_agent`
3. **Callback 从容器读取**：`llm_agent_instance = llm_agent_ref.get("instance")` 拿到的是 `LlmAgent` 实例（有 `instruction` 属性）

### 修复 2：删除硬编码英文指令

**修改**（`cli_adapter.py:220-222`）：

```python
# ✅ 直接传递 task_text，Planner 已注入语言指令
full_prompt = task_text
```

**原理**：
- `task_text` 来自 `workflow_builder._merge_instruction` 返回的完整 instruction
- Planner 规则 #7 确保 instruction 末尾包含 "用中文回复" 等语言指令
- 直接传递给 CLI，保留 Planner 的语言约束

## 验证方法

### 前置条件
- 后端运行（FastAPI）
- 前端 Mock 模式关闭（`VITE_USE_MOCK=false`）
- 数据库中有 Claude Code CLI Agent

### 测试步骤

1. **中文群聊测试**：
   ```
   @Claude 4.8 @Claude Code CLI 帮我生成一个欢迎页面，要有红色标题"你好，AgentHub"
   ```
   - 预期：Planner 拆分任务，CLI Agent 用中文回复，生成 HTML 代码卡

2. **检查后端日志**：
   ```
   INFO: DAG node[3/3]: name=... mode=single_turn provider=claude-code-cli instruction=生成一个HTML网页...用中文回复
   ```
   - `instruction` 应该是中文，且包含具体任务（而非 system_prompt）

3. **验证产物生成**：
   - 前端应该显示 `<artifact type="preview">` 或 `<artifact type="code">` 卡片
   - 内容是 HTML 网页，标题为"你好，AgentHub"

## 影响范围

### 修改的文件
- `backend/app/services/adapters/cli_adapter.py`（第 162-277 行）

### 受益场景
1. **群聊 Workflow 中的 CLI Agent**：现在能正确执行分配的任务，输出语言与用户一致
2. **中文用户**：CLI Agent 用中文回复，不再输出英文 greeting
3. **多语言支持**：只要 Planner 规则 #7 生效，任何语言的用户都能得到同语言的 CLI 回复

### 不受影响场景
- **单聊 CLI Agent**：`cli_adapter.stream()` 方法不变，仍走原有逻辑
- **非 CLI Agent**：LiteLLM / Anthropic Adapter 不受影响

## 相关问题

- **问题 #15**：CLI Agent 在 Workflow 中收到技能列表（已于 2026-06-07 早期修复，改为从闭包提取 instruction，但访问的是 ORM 对象）
- **问题 #16**：本次修复彻底解决闭包访问错误 + 语言覆盖问题

## 未来改进

1. **统一 instruction 传递机制**：考虑在 `AdapterRegistry` 层面定义标准接口，避免 Adapter 各自实现 instruction 提取逻辑
2. **语言检测 fallback**：如果 Planner 未注入语言指令，可以在 CLI Adapter 中检测 `task_text` 语言并自动追加对应的 "Reply in <language>" 指令
3. **可变容器替代方案**：Python 3.11+ 可以考虑使用 `nonlocal` + 延迟赋值，但当前方案（可变容器）兼容性更好且语义明确
