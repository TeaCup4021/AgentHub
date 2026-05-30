# AgentHub CLI Agent 集成 — 问题与修复记录

> 日期：2026-05-30  
> 目标：将本地 Claude Code CLI 和 Codex CLI 作为一等 Agent 接入 AgentHub

---

## 1. 新建对话选择 Agent 后点不了"确定"

**现象**：前端新建对话对话框中，选择了一个 Agent 后确定按钮仍然禁用。

**根因**：按钮禁用由三个条件控制（`ConversationList.tsx:477-482`）：
```typescript
disabled: !newTitle.trim() || selectedAgentIds.length === 0 || ...
```
- 标题为空（`newTitle=""`）时按钮始终禁用
- 即使 Agent 已预选，用户必须**输入标题**才能点击确定

**修复**：无需代码修改，这是设计行为。但 `openNewDialog` 的 `useEffect` 缺少 `openNewDialog` 依赖导致 WelcomePage 触发时可能使用空 `agents` 的旧闭包，标记为已知缺陷。

---

## 2. OPENAI_BASE_URL 导致后端启动失败

**现象**：`pydantic_core.ValidationError: Extra inputs are not permitted [openai_base_url]`

**根因**：`.env` 中有 `OPENAI_BASE_URL=https://julianapi.com`，但 `config.py` 的 `Settings` 类未声明该字段。

**修复**：在 `config.py` 的 `Settings` 类中新增 `OPENAI_BASE_URL: Optional[str] = None`。

---

## 3. Conversation 模型无 agentIds 属性 → 500 错误

**现象**：`AttributeError: 'Conversation' object has no attribute 'agentIds'`

**根因**：`stream_conversation` 的 CLI 路由代码直接访问 `conv.agentIds`，但 `Conversation` ORM 模型没有该字段。Agent 与会话的关联存储在 `conversation_participants` 表（`participant_type='agent'`）。

**修复**：改为查询 `ConversationParticipant` 表：
```python
select(ConversationParticipant.participant_id).where(
    ConversationParticipant.conversation_id == conv_id,
    ConversationParticipant.participant_type == "agent",
)
```

---

## 4. Codex CLI 默认 model 不匹配

**现象**：`codex exec` 报错 `The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed gpt-5`

**根因**：用户 Codex CLI 配置走 DeepSeek API，但 `config.py` 中 `CODEX_CLI_MODEL` 默认值为 `"gpt-5"`。

**修复**：
- `config.py`: `CODEX_CLI_MODEL` 默认值改为 `"deepseek-v4-pro"`
- `seed.py`: Codex CLI Agent 的 `model` 字段改为 `"deepseek-v4-pro"`
- `CreateAgentModal.tsx`: 前端 model 下拉改为 `["deepseek-v4-pro", "deepseek-v4-flash"]`
- `.env.example` 同步更新

---

## 5. Claude Code CLI Agent 未出现在数据库中

**现象**：前端 Agent 列表只看到 `Codex CLI`，没有 `Claude Code CLI`。

**根因**：用户数据库中已有自建的 `Claude Code` Agent（provider=`AnthropicLlm`，普通 LLM Agent）。种子去重逻辑按 `name` 检查，发现 "Claude Code" 已存在就跳过了我们的 `claude-code-cli` 版本。

**修复**：
- 种子 Agent 名称改为 `"Claude Code CLI"`（与 `"Codex CLI"` 命名风格一致）
- 手动向数据库插入正确的 CLI Agent（provider=`claude-code-cli`）
- 清理重复记录

---

## 6. Windows 下 create_subprocess_exec 无法执行 .cmd 文件

**现象**：`[WinError 193] %1 is not a valid Win32 application`

**根因**：npm 全局安装的 `claude` 命令实际是 `claude.cmd` 批处理文件。`asyncio.create_subprocess_exec` 不能直接执行 `.cmd` 文件。

**修复**：Windows 下使用 `subprocess.Popen(shell=True)`，由 `cmd.exe` 自动解析 `.cmd` 文件：
```python
if sys.platform == "win32":
    proc = subprocess.Popen(" ".join([cli_path] + args), shell=True, ...)
```

---

## 7. stream-json 输出格式需要 --verbose 标志

**现象**：Claude Code 流式输出为空，stderr 显示 `--output-format=stream-json requires --verbose`

**根因**：`_build_stream_args` 中缺少 `--verbose` 参数。Claude Code 的 `stream-json` 输出格式要求同时启用 `--verbose`。

**修复**：在 `ClaudeCodeRunner._build_stream_args` 中添加 `"--verbose"`。

---

## 8. Python 3.14 NotImplementedError 子进程失败

**现象**：
```
NotImplementedError: _make_subprocess_transport
  File "asyncio/base_events.py", line 533, in _make_subprocess_transport
```

**根因**：Python 3.14 在 Windows 上的默认事件循环（可能被 uvicorn 覆盖）使用 `BaseEventLoop`，其 `_make_subprocess_transport` 未实现（抛出 `NotImplementedError`）。`WindowsProactorEventLoopPolicy` 虽存在但 uvicorn 启动时可能不生效，且该 API 已标记为 3.16 移除。

**修复**：放弃 `asyncio.create_subprocess_exec`，改用 **`subprocess.Popen` + `asyncio.to_thread()` 线程池** 方案：
- `run()`：在 `asyncio.to_thread()` 中执行 `subprocess.Popen.communicate(timeout)`
- `run_stream()`：在 `asyncio.to_thread()` 中逐行读取 stdout，通过 `asyncio.Queue` 推送到主 async 上下文
- 此方案与事件循环类型无关，跨平台兼容

---

## 9. SSE 流式输出中 "user" 事件被误判为 error

**现象**：Claude Code stream-json 输出中 `type: "user"` 事件（用户消息回显）被 `_parse_stream` 当作 error 事件处理，导致前端收到额外的 SSE error 事件。

**根因**：`_parse_stream` 中 `elif event_type in ("error", "user"):` 将 `"user"` 和 `"error"` 并列。

**修复**：拆分处理——`"error"` 事件生成 `CliEvent("error", ...)`，`"user"` 事件忽略（或生成 progress 事件）。重构 `_parse_stream` 为 `_parse_line` 返回事件列表。

---

## 变更文件汇总

### 新增
| 文件 | 用途 |
|------|------|
| `backend/app/services/adk/cli_runner.py` | 子进程执行器：`BaseCliRunner` → `ClaudeCodeRunner` / `CodexCliRunner` |
| `backend/app/services/adk/cli_tools.py` | `@register_builtin("claude_code")` + `@register_builtin("codex_cli")` |

### 修改
| 文件 | 变更 |
|------|------|
| `backend/app/core/config.py` | +8 个 CLI 环境变量 + `OPENAI_BASE_URL` |
| `backend/app/core/seed.py` | +2 个 CLI Agent 种子数据 + 去重逻辑改为按名称检查 |
| `backend/app/services/adk/tool_loader.py` | `_ensure_builtins_loaded()` 懒加载 |
| `backend/app/services/adk/coordinator_builder.py` | CLI provider → `before_model_callback` 拦截（一等 sub-agent） |
| `backend/app/api/v1/conversations.py` | `_cli_sse_stream()` + 单聊 CLI 路由 + `ConversationParticipant` 查询 |
| `backend/.env` + `.env.example` | CLI 路径 + workspace + 补全缺失字段 |
| `agenthub-web/.../CreateAgentModal.tsx` | Provider/Model 下拉新增 CLI 选项 |
| `docs/AgentHub 响应格式与前后端对齐约定.md` | 新增第 41 节 CLI Agent 文档 |
