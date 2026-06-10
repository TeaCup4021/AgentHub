# AgentHub 后端B - Day 06-07 (ADK Artifact 事件流与协议验证) 进度总结

日期：2026-05-26

## 1. 环境变更与基础设施

- **依赖引用**：无新增/升级 Python 包，使用现有 FastAPI + SQLAlchemy Async + Google ADK 2.0 依赖。
- **项目结构**：
  - 新增 `backend/app/services/artifact.py` — Artifact 版本化落库服务
  - 新增 `backend/tests/services/adapters/test_adk_to_sse_artifact.py` — Translator artifact 提取测试
  - 新增 `backend/tests/services/test_artifact_service.py` — 版本递增/去重/重试测试
  - 新增 `backend/tests/api/test_conversation_stream_artifact_persistence.py` — 流式链路集成测试
  - 新增 `backend/tests/conftest.py` — 后端测试路径初始化
  - 新增 `backend/tools/verify_artifact_protocol.py` — SSE 协议一致性验证脚本（Day 7）
  - 新增 `backend/tests/tools/test_verify_artifact_protocol.py` — 协议验证工具测试
  - 修改 `backend/app/services/adapters/adk_to_sse.py` — artifact 提取优先级修正
  - 修改 `backend/app/api/v1/conversations.py` — 流式链路接入 artifact 持久化编排

## 2. 当前项目进度与测试结果

### 完成的接口

- `POST /api/v1/conversations/{id}/stream`（ADK 分支）：流式输出中 artifact 事件已接入持久化，SSE 优先输出、落库失败不阻断流
- Artifact 增量版本化存储：每次增量写入一条记录，`version` 按归并键单调递增
- 协议一致性验证工具：覆盖 6 类 SSE 事件字段校验 + SSE 文本解析（支持 CRLF/多行 data）

### 测试结果（全量聚焦测试通过）

```
backend/tests/services/adapters/test_adk_to_sse_artifact.py  — 4 passed
backend/tests/api/test_conversation_stream_artifact_persistence.py — 2 passed
backend/tests/services/test_artifact_service.py               — 5 passed
backend/tests/tools/test_verify_artifact_protocol.py          — 4 passed

合计：15 passed, 0 failed
```

### 核心实现

| 功能 | 文件 | 关键方法 |
|------|------|----------|
| Artifact 提取优先级 | `backend/app/services/adapters/adk_to_sse.py` | custom_metadata["artifact"] > actions.artifact_delta |
| 归并键策略 | `backend/app/services/artifact.py:12` | `build_artifact_merge_key()` — 优先 artifact.id，降级 message_id+type+title |
| 版本化落库 | `backend/app/services/artifact.py:24` | `ArtifactService.append_version()` — 查 max(version)+1，event_id 去重，IntegrityError 重试 1 次 |
| 流式编排 | `backend/app/api/v1/conversations.py` | `_persist_artifact_from_sse_payload()` — 先 yield SSE 再写库，异常不阻断流 |
| 协议验证 | `backend/tools/verify_artifact_protocol.py` | `validate_event_payload()` / `parse_sse_lines()` / `evaluate_events()` |

## 3. 与对齐约定一致性

- **统一响应包裹 `{code, data, message}`**：本次未改中间件与 REST 包裹逻辑
- **snake_case 存储 + camelCase 序列化**：无 schema 破坏
- **SSE 6 事件规范**：未修改事件名与结构，保持 `message_start / token / artifact / agent_status / message_end / error` 兼容

## 4. 文档补充判断

本次新增了 ArtifactService 和协议验证工具，但未新增对外 API 端点、未新增返回字段、未新增错误码。现有契约已覆盖 artifact 事件结构（`docs/AgentHub 响应格式与前后端对齐约定.md`），无需增补。

## 5. 合并状态

- 分支 `worktree-day6-7-artifact-event-stream`（`61be249`）已合并到 `main`（`ca1545c`）
- 合并后聚焦测试全部通过
- 已合并特性分支已删除

## 6. 影响范围

- `backend/app/services/adapters/adk_to_sse.py`
- `backend/app/api/v1/conversations.py`
- `backend/app/services/artifact.py`
- `backend/tools/verify_artifact_protocol.py`
- 对应测试文件（4 个）

## 7. 下一步工作计划与要点分析

- **数据库同步**：使用现有 `artifacts` 表与 JSONB `content` 字段，无需新增 migration；`_mergeKey` 和 `_eventId` 均内嵌在 content JSON 中
- **依赖分析与配置补全**：无新增环境变量或 API Key 需求
- **下阶段开发**：Day 8-9 Orchestration 事件流（群聊场景 artifact 聚合语义），需扩展现有单聊 artifact 链路到多 Agent 协同场景
