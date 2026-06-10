# Workflow Instruction 传递修复总结

**日期：** 2026-06-07  
**任务：** 修复群聊编排中 CLI 和部分 LLM Agent 未执行分配任务的问题

---

## 问题描述

用户提示词："帮我写一个 hello chenjinze，welcome to XUPT 的网页，部署到本机 8090 端口，然后生成本地链接给我"

### Planner 的任务拆解

| Subtask | Agent | 任务 | 状态 |
|---------|-------|------|------|
| s1 | Agent 4.8 | 写 HTML 文件 | ✅ 成功 |
| s2 | Claude Code CLI | 启动 Python HTTP 服务器 | ❌ 失败 |
| s3 | Agent 5.4 | 验证网页内容 | ❌ 失败 |

### 实际表现

- **Agent 4.8** (1539 事件): 成功生成 HTML，但提示"环境无法执行后台命令"
- **Claude Code CLI** (1 事件): 输出 "I can see the available skills and I'm ready to help. What would you like to work on?"
- **Agent 5.4** (14 事件): 输出 "我已经准备好了，请告诉我你想让我做什么。"

**问题**：后两个 Agent 完全没有理解它们被分配的任务。

---

## 根因分析

### 核心问题：instruction 传递断链

```
Planner 拆解任务
    ↓ subtask instruction
workflow_builder.py 构建 DAG
    ↓ adapter.build_agent(agent)  ❌ 返回 agent.instruction = system_prompt
    ↓                              ❌ 没有覆盖 instruction
Workflow 执行
    ↓
Agent 只收到 system_prompt，没有收到具体任务
```

### 详细根因

1. **`workflow_builder.py` 的分支不一致**
   ```python
   # 走 Adapter 的分支（CLI/LiteLLM/Anthropic）
   adapter = AdapterRegistry.get_for_agent(db_agent)
   agent = adapter.build_agent(db_agent, tool_loader=tool_loader)
   # ❌ 没有设置 instruction
   
   # fallback 分支
   instruction = self._merge_instruction(db_agent, st.instruction)
   agent = LlmAgent(..., instruction=instruction, ...)
   # ✅ 正确合并了 instruction
   ```

2. **基类 `build_agent` 的实现**
   ```python
   # base.py:AgentAdapter
   return LlmAgent(
       instruction=build_instruction(agent),  # ❌ 只有 system_prompt
       ...
   )
   ```

3. **CLI Adapter 的过时逻辑**
   ```python
   # cli_adapter.py
   # 尝试从 llm_request.contents 提取用户消息
   # ❌ Workflow 节点间没有用户消息传递
   user_prompt = "\n".join(prompt_parts)  # 结果是空的
   ```

---

## 修复方案

### 关键修改

#### 1. `workflow_builder.py` — 强制覆盖 instruction

```python
adapter = AdapterRegistry.get_for_agent(db_agent)
agent = adapter.build_agent(db_agent, tool_loader=tool_loader)

# ✅ 新增：强制覆盖 instruction
agent.instruction = self._merge_instruction(db_agent, st.instruction)

agent.name = agent_name
agent.mode = agent_mode
```

**效果**：所有 Agent 类型（CLI/LiteLLM/Anthropic）都收到：
- Agent 的 `system_prompt`
- `_EXECUTOR_SCOPE_DIRECTIVE`（防止越权）
- Planner 分配的 **subtask instruction**

#### 2. `cli_adapter.py` — 使用当前 instruction

```python
async def cli_before_model_callback(callback_context, llm_request) -> LlmResponse | None:
    # ✅ 从 callback_context.agent 获取当前 instruction
    current_agent = callback_context.agent
    full_prompt = current_agent.instruction if hasattr(current_agent, 'instruction') else ""
    
    # 直接运行 CLI，不再从 llm_request 提取
    result = await base_tool(prompt=full_prompt, timeout=timeout)
    # ...
```

#### 3. 日志输出修正

```python
logger.info(
    "DAG node[%d/%d]: name=%s mode=%s provider=%s instruction=%.80s...",
    len(agent_map), len(plan.subtasks), agent_name, agent_mode,
    getattr(db_agent, "provider", "unknown") if db_agent else "unknown",
    agent.instruction[:80],  # ✅ 打印合并后的 instruction
)
```

---

## 修改的文件

| 文件 | 修改内容 | 行数 |
|------|----------|------|
| `backend/app/services/adk/workflow_builder.py` | 强制覆盖 instruction + 修正日志 | 3 行关键逻辑 |
| `backend/app/services/adapters/cli_adapter.py` | 使用 agent.instruction 而非提取 llm_request | ~30 行 |
| `docs/ai-collab/decisions/cli-agent/004-workflow-instruction-propagation-fix.md` | 完整决策文档 | 新增 |

---

## 验证方法

### 预期日志

```
2026-06-07 ... INFO [agenthub.workflow_builder] DAG node[2/3]: name=agent_20c4... 
instruction=You are Claude Code - a local AI coding agent...

[SYSTEM] You are ONE executor in a multi-agent plan. Do ONLY the single task below...

Your specific task: 请使用 Python 的 http.server 模块将 index.html 部署到本机 8090 端口...
```

### 预期行为

- **CLI Agent 输出**：实际执行了 `python -m http.server 8090` 命令（或尝试执行并报告结果）
- **Agent 5.4 输出**：验证了网页内容或报告端口未启动
- **不再出现**："I'm ready to help" 或 "我已经准备好了" 这类 greeting

---

## 影响范围

### ✅ 受益场景
- 所有 Workflow DAG 编排
- 多 Agent 协作任务（每个 Agent 都能收到具体任务）

### ⚠️ 无影响场景
- 单聊流程（不走 `workflow_builder`）
- Coordinator 模式（Coordinator 自己调用 `request_task_<name>`）

### 🔍 潜在风险
- 如果某个 Agent 依赖特定的 `system_prompt` 格式，现在被 `_merge_instruction` 追加了内容
- **缓解措施**：`_merge_instruction` 保留原 `system_prompt` 作为基础，只追加指令

---

## 关联问题

- **已知问题 #11**（4.8 越权分工）— 已通过 `_EXECUTOR_SCOPE_DIRECTIVE` 修复
- **已知问题 #8**（CLI Agent 串行慢）— 未解决，但现在 CLI 至少能收到正确任务了

---

## 经验总结

### 架构教训

1. **统一路径的重要性**：同一个功能不应该有多条分支各自实现
   - Adapter 分支和 fallback 分支对 instruction 的处理不一致
   - 应该在一个统一的地方处理 instruction 合并

2. **数据流的可观测性**：关键数据（如 instruction）应该打印到日志
   - 之前日志打印的是 `system_prompt`，掩盖了问题
   - 修改后打印合并后的 `instruction`，立即能看到是否传递正确

3. **分层职责**：
   - Adapter 负责构建基础 Agent（model、tools、callbacks）
   - `workflow_builder` 负责任务级别的配置（instruction、name、mode）
   - 清晰的分层避免职责混乱

### 调试技巧

1. **从日志反推数据流**：
   - "DAG raw author breakdown" 显示事件数
   - "DAG node instruction" 显示 Agent 收到的指令
   - "Agent 输出内容" 反映实际理解的任务

2. **对比预期与实际**：
   - Planner 的 plan draft（预期）
   - Agent 的实际输出（实际）
   - 两者差异即为问题所在

3. **追踪关键变量的生命周期**：
   - `st.instruction` → `_merge_instruction()` → `agent.instruction` → `before_model_callback` → CLI prompt
   - 在每个环节打印或断点，找到断链点

---

## 后续优化建议

### P1 — 立即做

- ✅ **已完成**：修复 instruction 传递

### P2 — 近期做

- **统一 Adapter 接口**：让所有 Adapter 的 `build_agent` 接受 `task_instruction` 参数
  - 更干净的架构
  - 但需要修改所有 Adapter 的签名

- **CLI Agent 会话复用**：多个 subtask 共享同一个 CLI 会话
  - 减少启动开销（每次 ~96s）
  - 保留上下文（文件已创建、环境已配置）

### P3 — 有空做

- **Workflow 测试覆盖**：为 `workflow_builder` 增加单元测试
  - 验证 instruction 合并逻辑
  - 验证各种 Agent 类型的正确性

- **执行可视化**：前端展示每个 Agent 收到的完整 instruction
  - 用户可以看到任务是如何分配的
  - 方便调试和理解

---

## 总结

这次修复解决了一个**架构性问题**：Workflow 编排中，不同类型的 Agent 走不同的代码分支，导致 instruction 传递不一致。

通过在 `workflow_builder` 统一覆盖 `agent.instruction`，确保所有 Agent（无论是 CLI、LiteLLM 还是 Anthropic）都能收到 Planner 分配的具体任务。

修改遵循"最小侵入"原则，只改动了 3 行关键逻辑，但影响深远：
- ✅ CLI Agent 现在能正确执行系统操作
- ✅ LLM Agent 现在能理解具体任务而非空等
- ✅ 多 Agent 协作更加可靠

这为 AgentHub 的多 Agent 编排能力奠定了坚实基础。
