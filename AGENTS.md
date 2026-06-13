# AgentHub

AgentHub 是一个多 Agent 协作平台，提供 IM 聊天界面，并通过 ADK 驱动 Agent 编排。

## 技术栈

- **后端**：FastAPI + SQLAlchemy async + PostgreSQL + Redis + MinIO
- **Agent 引擎**：Google ADK 2.0（LlmAgent、Workflow、Runner）
- **模型接入**：AnthropicLlm（Claude）+ LiteLLM（Codex/OpenCode）
- **前端**：React 19 + TypeScript + Vite + Semi Design 2.x

## 关键约定

- API 响应统一使用：`{ code: number, data: T, message: string }`
- Python 侧存储字段使用 `snake_case`，对外序列化使用 `camelCase`（通过 Pydantic `alias_generator` 实现）
- 分页响应统一使用：`{ list: T[], total: number, page: number, pageSize: number }`
- 日期时间统一使用 ISO 8601 格式
- SSE 协议包含 7 类事件：`message_start`、`token`、`artifact`、`agent_status`、`thinking`、`message_end`、`error`

## 关键文件

| 文件 | 用途 |
|------|------|
| `docs/AgentHub-架构设计.md` | 后端架构设计 |
| `docs/AgentHub-架构设计前端.md` | 前端架构设计 |
| `docs/AgentHub-后端开发20天实施计划.md` | 20 天后端实施计划（参考） |
| `archive/development/plans/` | 历史每日实施计划 |
| `archive/development/summaries/` | 历史每日完成总结 |
| `agenthub-web/` | React 19 + Semi Design 前端源码 |
| `backend/` | FastAPI 后端源码 |
| `docs/AgentHub 响应格式与前后端对齐约定.md` | 前后端 API 契约 |

## 角色分工

- **Backend A**：业务 API、数据层、Context Assembler、Artifact Service、CapabilityRegistry
- **Backend B**：ADK 集成、SSE Translator、Orchestrator 协议、ExecutionTracer

## Vibe Graph 工作流

遇到新功能开发、历史文档补录或 AI 协作规则变更时，必须遵守 `docs/vibe-graph/rules.md`。

必需的可追溯链路：

```text
SPEC -> PLAN -> TASK -> IMPLEMENTS -> TRACE -> SUMMARY
```

在实现新功能前，必须满足以下任一条件：

- 已存在对应的 `SPEC` / `PLAN` / `TASK` 链路；
- 或先在 `docs/vibe-graph/` 下创建对应链路。
