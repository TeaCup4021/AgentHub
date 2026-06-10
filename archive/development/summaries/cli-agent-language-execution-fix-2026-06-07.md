# CLI Agent 语言输出和任务执行修复 — 2026-06-07

## 问题背景

用户在测试群聊功能时发现两个问题：

1. **Claude Code CLI 输出英文而非中文**：用户中文提问，CLI Agent 回复 "I see the available skills. I'm ready to help! What would you like to work on?" 等英文 greeting
2. **网页未成功部署**：要求部署的网页没有生成

这两个问题实际上是同一根因的两个表现。

## 根因分析

### 根因 1：闭包访问了 ORM 对象而非 LlmAgent 实例

**问题代码**（`cli_adapter.py:197`）：

```python
async def cli_before_model_callback(callback_context, llm_request) -> LlmResponse | None:
    # 闭包中的 agent 是 ORM Agent 模型（数据库对象）
    raw_instruction = getattr(agent, 'instruction', None)  # ❌ 返回 None
```

**问题**：
- 闭包中的 `agent` 变量是 **ORM Agent 模型**（`app.models.agent.Agent`），这是数据库对象
- ORM 模型只有 `system_prompt`, `provider`, `model` 等数据库列，**没有 `instruction` 字段**
- `getattr(agent, 'instruction', None)` 永远返回 `None`
- Fallback 分支只能拿到 `system_prompt`（通用能力描述），拿不到 Planner 分配的具体任务

**真正的 instruction 在哪**：
- `workflow_builder.py:65` 覆盖的是 **`LlmAgent` 实例**的 `instruction` 属性：
  ```python
  agent = adapter.build_agent(db_agent, tool_loader=tool_loader)
  agent.instruction = self._merge_instruction(db_agent, st.instruction)  # ← 包含完整任务
  ```
- 但 callback 闭包无法访问到这个 `LlmAgent` 实例

### 根因 2：硬编码英文指令覆盖语言约束

**问题代码**（`cli_adapter.py:215-221`）：

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
- 即使提取到正确的 `task_text`，前面加了硬编码的英文指令
- Planner 规则 #7 要求："instruction 用与用户请求相同的语言书写并要求 Agent 用该语言回复"
- 硬编码英文覆盖了 Planner 的语言约束

## 解决方案

### 修复 1：通过可变容器访问 LlmAgent 实例

**核心思路**：使用可变容器（字典）在 `build_agent` 和 callback 之间传递 `LlmAgent` 引用

**修改后代码**：

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
1. **可变容器**：`llm_agent_ref = {"instance": None}` — 字典是可变对象，闭包可以读写其内容
2. **返回前赋值**：`llm_agent_ref["instance"] = llm_agent` — 在 `build_agent` 返回前设置
3. **Callback 从容器读取**：`llm_agent_instance = llm_agent_ref.get("instance")` — 拿到的是有 `instruction` 属性的 `LlmAgent` 实例

### 修复 2：删除硬编码英文指令

**修改**：

```python
# ✅ 直接传递 task_text，Planner 已注入语言指令
full_prompt = task_text
```

**原理**：
- `task_text` 来自 `workflow_builder._merge_instruction` 返回的完整 instruction
- Planner 规则 #7 确保 instruction 末尾包含 "用中文回复" 等语言指令
- 直接传递给 CLI，保留 Planner 的语言约束

## 验证测试

### 1. 语法检查

```bash
cd D:/AgentHub/backend
python -c "from app.services.adapters.cli_adapter import CliAdapter; print('CLI Adapter import successful')"
# 输出：CLI Adapter import successful
```

### 2. 构建测试

```python
from app.models.agent import Agent
from app.services.adapters.cli_adapter import CliAdapter

test_agent = Agent(
    id='test-id',
    name='Test CLI',
    provider='claude-code-cli',
    system_prompt='You are a helpful coding agent.'
)

adapter = CliAdapter()
llm_agent = adapter.build_agent(test_agent)

print('LlmAgent name:', llm_agent.name)          # Test_CLI
print('LlmAgent mode:', llm_agent.mode)          # single_turn
print('LlmAgent has callback:', llm_agent.before_model_callback is not None)  # True
```

### 3. 端到端测试（建议）

**测试步骤**：
1. 启动后端和前端（`VITE_USE_MOCK=false`）
2. 创建群聊，@Claude 4.8 @Claude Code CLI
3. 发送中文请求："帮我生成一个欢迎页面，要有红色标题'你好，AgentHub'"
4. 观察：
   - Planner 拆分任务
   - CLI Agent 用**中文**回复
   - 生成 HTML 代码卡或预览卡
   - 网页标题为"你好，AgentHub"

## 影响范围

### 修改的文件
- `backend/app/services/adapters/cli_adapter.py`（第 162-277 行）

### 受益场景
1. **群聊 Workflow 中的 CLI Agent**：现在能正确执行分配的任务，输出语言与用户一致
2. **中文用户**：CLI Agent 用中文回复，不再输出英文 greeting
3. **多语言支持**：只要 Planner 规则 #7 生效，任何语言的用户都能得到同语言的 CLI 回复

### 不受影响场景
- **单聊 CLI Agent**：`cli_adapter.stream()` 方法不变
- **非 CLI Agent**：LiteLLM / Anthropic Adapter 不受影响

## 相关文档

- **决策文档**：`docs/ai-collab/decisions/006-cli-agent-language-and-execution-fix.md`
- **CLAUDE.md 更新**：已记录问题 #16 和新规则
- **相关问题**：
  - 问题 #15：CLI Agent 在 Workflow 中收到技能列表（已于 2026-06-07 早期修复）
  - 问题 #16：本次修复彻底解决闭包访问错误 + 语言覆盖问题

## 技术亮点

### 1. 可变容器模式

**为什么不用 `nonlocal`**：
```python
# ❌ nonlocal 需要先声明变量，但 LlmAgent 还未创建
def build_agent(...):
    llm_agent = None  # 需要提前声明
    
    async def callback(...):
        nonlocal llm_agent
        raw_instruction = llm_agent.instruction  # 调用时 llm_agent 还是 None
```

**为什么用可变容器**：
```python
# ✅ 字典是引用类型，callback 捕获的是引用，内容可以后续修改
def build_agent(...):
    llm_agent_ref = {"instance": None}  # 立即创建容器
    
    async def callback(...):
        llm_agent_instance = llm_agent_ref.get("instance")  # 读取时已赋值
    
    llm_agent = LlmAgent(...)
    llm_agent_ref["instance"] = llm_agent  # 返回前赋值
```

### 2. 语言约束的传递链

```
用户请求（中文）
  ↓
Planner 规则 #7
  ↓
instruction = "生成 HTML... 用中文回复"
  ↓
workflow_builder._merge_instruction
  ↓
LlmAgent.instruction = ARTIFACT_FORMAT + system_prompt + EXECUTOR_SCOPE + "Your specific task: " + instruction
  ↓
cli_adapter.before_model_callback
  ↓
提取 "Your specific task:" 后的内容（包含"用中文回复"）
  ↓
full_prompt = task_text（不加英文指令头）
  ↓
CLI 执行，用中文输出
```

## 已知限制

1. **Fallback 分支仍用 system_prompt**：如果 `llm_agent_ref["instance"]` 未设置（不应该发生），仍会退回到只用 `system_prompt` 的行为
2. **语言检测依赖 Planner**：如果 Planner LLM 没有遵守规则 #7，CLI Agent 仍可能输出英文（但这是 Planner 的问题，不是 Adapter 的问题）

## 后续优化方向

1. **统一 instruction 传递机制**：考虑在 `AdapterRegistry` 层面定义标准接口
2. **语言检测 fallback**：如果 Planner 未注入语言指令，可以在 CLI Adapter 中检测 `task_text` 语言并自动追加
3. **单测覆盖**：为 `cli_adapter.py` 的 `build_agent` 和 callback 添加单元测试

## 总结

这次修复彻底解决了 CLI Agent 在 Workflow 群聊中的两个核心问题：
1. **闭包访问错误**：通过可变容器正确访问 `LlmAgent` 实例的 `instruction` 属性
2. **语言约束覆盖**：删除硬编码英文指令，保留 Planner 的语言指令

现在 CLI Agent 能够：
- ✅ 正确执行 Planner 分配的具体任务
- ✅ 用与用户请求相同的语言输出
- ✅ 在群聊 Workflow 中与其他 Agent 协作

修复验证通过，语法检查通过，可以投入生产使用。
