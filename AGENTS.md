# AgentHub

Multi-agent collaboration platform. IM chat interface + ADK-powered agent orchestration.



## Tech Stack

- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL + Redis + MinIO
- **Agent Engine**: Google ADK 2.0 (LlmAgent, Workflow, Runner)
- **Models**: AnthropicLlm (Claude) + LiteLLM (Codex/OpenCode)
- **Frontend**: React 19 + TypeScript + Vite + Semi Design 2.x

## Key Conventions

- API responses: `{ code: number, data: T, message: string }`
- Python: `snake_case` storage, `camelCase` serialization (Pydantic `alias_generator`)
- Pagination: `{ list: T[], total: number, page: number, pageSize: number }`
- Dates: ISO 8601
- SSE protocol: 7 event types (message_start, token, artifact, agent_status, thinking, message_end, error)

## Key Files

| File | Purpose |
|------|---------|
| `docs/AgentHub-架构设计.md` | Backend architecture design |
| `docs/AgentHub-架构设计前端.md` | Frontend architecture design |
| `docs/AgentHub-后端开发20天实施计划.md` | 20-day implementation plan (reference) |
| `archive/development/plans/` | Historical daily implementation plans |
| `archive/development/summaries/` | Historical daily completion summaries |
| `agenthub-web/` | React 19 + Semi Design frontend source |
| `backend/` | FastAPI backend source |
| `docs/AgentHub 响应格式与前后端对齐约定.md` | Frontend-backend API contract |

## Role Split

- **Backend A**: Business APIs, data layer, Context Assembler, Artifact Service, CapabilityRegistry
- **Backend B**: ADK integration, SSE Translator, Orchestrator protocol, ExecutionTracer

## Vibe Graph Workflow

For new feature work, historical documentation backfill, or AI collaboration
rule changes, follow `docs/vibe-graph/rules.md`.

Required traceability chain:

```text
SPEC -> PLAN -> TASK -> IMPLEMENTS -> TRACE -> SUMMARY
```

Do not implement a new feature without either:

- an existing `SPEC` / `PLAN` / `TASK` chain, or
- creating one first under `docs/vibe-graph/`.
