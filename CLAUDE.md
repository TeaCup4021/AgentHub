# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AgentHub is a multi-Agent collaboration platform using IM chat as the core interaction paradigm. Users chat with AI agents (Claude Code, Codex, OpenCode, custom agents) in single or group conversations. A built-in Orchestrator coordinates multi-agent tasks in group chats.

## Repository Structure

```
D:\AgentHub\
├── backend/                    # FastAPI backend (Python)
│   ├── app/
│   │   ├── main.py             # FastAPI entry point
│   │   ├── core/               # config, database, middleware, exceptions
│   │   ├── models/             # SQLAlchemy ORM models (10 tables)
│   │   ├── schemas/            # Pydantic schemas (camelCase output)
│   │   ├── api/v1/             # API route handlers
│   │   └── services/           # Business logic (Day 2+)
│   ├── alembic/                # Database migrations
│   ├── docker-compose.yml      # PostgreSQL + Redis + MinIO
│   └── requirements.txt
├── AgentHub-架构设计.md         # Backend architecture doc (Chinese)
├── AgentHub-架构设计前端.md      # Frontend architecture & API contract (Chinese)
├── AgentHub-后端开发20天实施计划.md  # 20-day implementation plan
└── AgentHub-后端A-Day1实施计划.md   # Day 1 detailed plan
```

The frontend (React + TypeScript + Vite) is described in the architecture docs but not yet in this repo.

## Commands

### Infrastructure
```bash
cd backend
docker compose up -d            # Start PostgreSQL (5433), Redis (6379), MinIO (9000/9001)
docker compose ps               # Check service health
docker compose down             # Stop all services
```

### Backend Development
```bash
cd backend
pip install -r requirements.txt  # Install dependencies (first time)
uvicorn app.main:app --reload    # Start dev server on :8000
```

### Database Migrations
```bash
cd backend
alembic revision --autogenerate -m "description"   # Generate migration from model changes
alembic upgrade head                                # Apply migrations
alembic downgrade -1                                # Rollback one migration
alembic current                                     # Show current revision
```

**Important:** Alembic uses `settings.DATABASE_URL` from `app.core.config` (reads `.env`). On Windows, the `env.py` falls back to psycopg2 (sync) to avoid asyncpg/proactor issues.

### Testing (when tests are added)
```bash
pytest
pytest app/tests/ -v           # Verbose output
pytest app/tests/ -k "test_name"  # Run specific test
```

### Seed Data
```bash
python backend/seed_agents.py  # Insert built-in agents (Day 1, backend B task)
```

## Architecture

### Response Format
All JSON responses are auto-wrapped by `ResponseWrapperMiddleware`:
```json
{ "code": 200, "data": <actual-data>, "message": "success" }
```
Exception handlers also return this format. The middleware skips non-JSON responses (SSE, files).

### Naming Convention
- **Python**: `snake_case` everywhere (models, schemas, DB columns)
- **JSON output**: `camelCase` via Pydantic `alias_generator=to_camel` in `BaseSchema`
- **DB column `meta`**: The `Message` model has `meta_data` mapped to the `"meta"` column (reserved word in SQLAlchemy)

### Database (10 tables)
All tables use UUID primary keys (`UUIDMixin`) and timestamp tracking (`TimestampMixin`). Key tables:
- `users`, `agents`, `conversations`, `conversation_participants`, `messages`
- `message_mentions`, `message_pins`, `artifacts`
- `orchestrator_tasks`, `orchestrator_subtasks`

Async engine via `asyncpg`, session via `async_sessionmaker` with `get_db()` dependency injection.

### API Routes
- Entry: `app.api.router.api_router` mounted at `/api`
- v1 routes at `/api/v1/*`
- Currently only `GET /api/v1/health` is implemented (returns db/redis/minio status)

### SSE Protocol
6 event types for streaming agent output: `message_start`, `token`, `artifact`, `agent_status`, `message_end`, `error`. The SSE endpoint is `GET /api/v1/conversations/{id}/stream`.

### Key Patterns
- **Exception hierarchy**: `AppException` base → `NotFoundException` (404), `ValidationException` (422), `UnauthorizedException` (401), `InternalException` (500)
- **Settings**: `pydantic-settings` reads from `.env`, all config in `app.core.config.settings`
- **Adapter pattern**: Planned for AI provider abstraction — unified interface (`send_message`, `stream_message`, `cancel_run`, `parse_artifact`) for Claude/Codex/OpenCode

### Context Assembly (planned)
When sending messages to agents, the system will assemble context from: recent N messages + pinned messages + conversation-level Rules/Spec. This is not yet implemented.

## Current State (Day 1 Complete)
- [x] Docker Compose with PostgreSQL, Redis, MinIO
- [x] FastAPI skeleton with CORS, exception handlers, response middleware
- [x] 10 SQLAlchemy models with Alembic migration
- [x] Health check endpoint with DB connectivity test
- [x] Pydantic camelCase configuration
- [ ] Business APIs (conversations, messages, agents) — Day 2+
- [ ] SSE streaming — Day 3+
- [ ] Adapter layer for real AI providers — Day 4+
- [ ] Orchestrator engine — Day 9+
