# AgentHub

IM + ADK 编排。

## 技术栈

- 后端：FastAPI、SQLAlchemy、PostgreSQL
- Agent：ADK 2.0、Anthropic、LiteLLM、CLI
- 前端：React、TypeScript、Vite、Semi、Zustand
- 包管理：npm

## 常用命令

```bash
npm run dev
npm run dev:backend
npm run dev:frontend
cd agenthub-web && npm run build && npm run lint && npm run test
cd backend && pytest && alembic upgrade head
```

## 项目结构

- `backend/app/api/v1/`：API
- `backend/app/services/`：业务、ADK、Artifact
- `backend/app/models/`、`schemas/`
- `backend/alembic/`：迁移
- `agenthub-web/src/lib/`、`stores/`：API/SSE/状态

## 编码规范

- API 返回 `{ code, data, message }`；分页返回 `{ list, total, page, pageSize }`。
- Python/DB 用 `snake_case`；JSON/query 用 `camelCase`；Schema 用 `alias_generator`。
- 路由禁止写业务；逻辑放到 service。
- SSE 只用 `message_start/token/artifact/agent_status/thinking/message_end/error`。
- 环境变量必须写入 `Settings`，禁止散落用 `os.getenv()`。

## 注意事项

- 禁止读取或输出 `backend/.env`。
- 禁止修改已存在迁移；数据库变更必须新增迁移。
- 禁止维护前端硬编码模型或能力列表。
- 新功能、接口或协作规则变更先建 `SPEC -> PLAN -> TASK -> IMPLEMENTS -> TRACE -> SUMMARY`。
