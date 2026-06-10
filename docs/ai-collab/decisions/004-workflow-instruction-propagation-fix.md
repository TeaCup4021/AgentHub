# 004 - Workflow Instruction Propagation & AgentHub Artifact Hosting

**Date:** 2026-06-07
**Status:** Implemented
**Related Issues:** 群聊编排中 CLI/LLM Agent 未执行分配的任务；部署的网页无法持久访问

---

## 问题 A：Workflow 编排中 Agent 未收到 subtask instruction

### 症状

Planner 拆分为 3 个 subtask（s1: 写 HTML / s2: 启动服务器 / s3: 验证），但 s2 的 Claude Code CLI 和 s3 的 Agent 5.4 输出 greeting 消息而非执行任务。

### 根因链

1. **Planner 可能输出 `mode="task"`**：Prompt 规则写了 `"single_turn" or "task"`，ADK Workflow 拒绝 `mode="task"` 节点

2. **`workflow_builder.py` 分支不一致**：Adapter 分支用 `adapter.build_agent()` 返回 agent，但其 `instruction` 是固定的 `system_prompt`，没有 subtask instruction。只有 fallback 分支（`except ValueError`）才调用 `_merge_instruction`

3. **基类 `AgentAdapter.build_agent()`** 只调用 `build_instruction(agent)`（= `system_prompt`），不含任务指令

4. **CLI Adapter 的 `before_model_callback`** 尝试从 `llm_request.contents` 提取用户消息，但在 Workflow DAG 中节点间无用户消息传递，提取结果为空

5. **CLI Agent 收到的 prompt 太长**：合并后的 instruction 包含 system_prompt + artifact_format 规则 + EXECUTOR_SCOPE_DIRECTIVE + task instruction，CLI 看到元指令后迷失，只输出 "请问你需要我做什么？"

### 修复

| # | 文件 | 修改 |
|---|------|------|
| 1 | `planner.py` | Prompt 规则 #5 改为 "always use single_turn"；解析时强制转换 `mode="task"` → `"single_turn"` |
| 2 | `workflow_builder.py` | Adapter 分支强制覆盖 `agent.instruction = self._merge_instruction(db_agent, st.instruction)`；mode 只在不兼容时修正 |
| 3 | `cli_adapter.py` | 回退到从 `llm_request.contents` 提取文本（不限于 user role）；新增 fallback |
| 4 | `cli_adapter.py` | 提取 "Your specific task:" 后的任务文字，加简洁 CLI 指令头 |

---

## 问题 B：CLI Agent 启动的服务器随子进程退出而终止

### 症状

CLI Agent 成功执行 `python -m http.server 8090`，输出 "部署完成！HTTP 200 ✅"，但用户点击链接时显示 "拒绝连接"。

### 根因

CLI Agent 是一次性子进程。它启动的 HTTP 服务器在 CLI 退出后随之终止，端口绑定消失。

### 修复：AgentHub 内置产物托管

将"部署"重新定义为 AgentHub 平台提供的持久文件服务。

**修改的文件：**

| 文件 | 修改 |
|------|------|
| `preview_server.py` | 新增 `serve_app` Starlette 应用，`/serve/{conv_id}/{path}` 路由 + MIME 检测 |
| `main.py` | 挂载 `/serve` |
| `conversations.py` | 新增 `POST /{conv_id}/artifacts/upload` 端点（MinIO 上传） |
| `artifact_detector.py` | `_publish_preview_html` 同步存到 `serve/{conv_id}/index.html`；接受 `conversation_id` |
| `artifact_format.py` | `ARTIFACT_FORMAT_SPEC` 新增 "不要启动服务器，平台自动托管" 指令 |
| `planner.py` | 新增规则 #8：禁止分配 "启动服务器/部署到端口" 的 subtask |

**工作流变化：**
```
前: Agent 生成 HTML → 尝试 python -m http.server → 服务器随 CLI 退出而终止
后: Agent 生成 HTML → artifact 自动上传 MinIO → AgentHub /serve 端点持久服务
```

---

## 架构教训

### 1. 统一路径避免分支不一致

同一个功能的多条代码分支必须保持一致的逻辑。`workflow_builder.py` 中 Adapter 分支和 fallback 分支对 instruction 的处理不一致，导致了"Agent 只收到 system_prompt"的 bug。

### 2. 数据流可观测性

关键变量（如 `agent.instruction`）必须打印到日志。修复前日志打印的是 `system_prompt` 片段，掩盖了问题。

### 3. 分层职责

- **Adapter** 负责构建基础 Agent（model、tools、callbacks）
- **workflow_builder** 负责任务级别配置（instruction、name、mode）
- 修改点是 workflow_builder 强制覆盖 instruction，而非让每个 Adapter 各自实现

### 4. CLI Agent 的特殊性

- CLI Agent 需要简洁直接的 prompt，不适合包含大量元指令
- CLI Agent 是一次性子进程，不适合需要持久运行的任务
- 持久化服务应由平台层（AgentHub）统一管理

### 5. Planner 输出不可信

- LLM 可能输出 `mode="task"`（违反 Workflow 约束）
- LLM 可能输出 `agentName` 为 system_prompt 片段
- 必须在上游（解析时）和下游（workflow_builder）双重兜底

---

## 相关记录

- `vibeCodingSummary/workflow-instruction-fix-2026-06-07.md` — 修复历程详细记录
- `docs/ai-collab/decisions/002-group-chat-dag-execution.md` — DAG 执行架构
- `docs/ai-collab/decisions/003-multi-agent-orchestration-fixes.md` — 多 Agent 修复
