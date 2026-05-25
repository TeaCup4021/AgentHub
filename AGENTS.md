# AgentHub

Multi-agent collaboration platform. IM chat interface + ADK-powered agent orchestration.

## Daily Workflow

Every development session follows this cycle:

1. **READ** the day's plan from `vibeCodingPlan/`
2. **IMPLEMENT** strictly according to the plan
3. **WRITE** a summary to `vibeCodingSummary/` when done

See `.vibe-coding/workflow.md` for detailed steps.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL + Redis + MinIO
- **Agent Engine**: Google ADK 2.0 (LlmAgent, Workflow, Runner)
- **Models**: AnthropicLlm (Claude) + LiteLLM (Codex/OpenCode)
- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS + shadcn/ui

## Key Conventions

- API responses: `{ code: number, data: T, message: string }`
- Python: `snake_case` storage, `camelCase` serialization (Pydantic `alias_generator`)
- Pagination: `{ list: T[], total: number, page: number, pageSize: number }`
- Dates: ISO 8601
- SSE protocol: 6 event types (message_start, token, artifact, agent_status, message_end, error)

## Key Files

| File | Purpose |
|------|---------|
| `AgentHub-架构设计.md` | Backend architecture design |
| `AgentHub-架构设计前端.md` | Frontend architecture design |
| `AgentHub-后端开发20天实施计划.md` | 20-day implementation plan |
| `vibeCodingPlan/` | Daily implementation plans |
| `vibeCodingSummary/` | Daily completion summaries |
| `backend/` | FastAPI application code |

## Role Split

- **Backend A**: Business APIs, data layer, Context Assembler, Artifact Service, CapabilityRegistry
- **Backend B**: ADK integration, SSE Translator, Orchestrator protocol, ExecutionTracer
