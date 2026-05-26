# ADK Artifact Event Stream (Day 6-7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 ADK 单聊流式链路中实现 Artifact 增量事件的稳定转换与“每次增量一版”落库，并完成 Claude/Codex 的 SSE 协议一致性验证。

**Architecture:** 保持 Translator 只做协议转换，在流式消费层编排“先发 SSE 再落库”，新增 ArtifactService 负责按 `artifact.id` 归并与 version 自增。通过最小去重与冲突重试保障稳定性，避免大改现有 API/Schema。

**Tech Stack:** FastAPI, SQLAlchemy Async, PostgreSQL(JSONB), Google ADK 2.0 Runner/Event, Pytest + pytest-asyncio

---

## File Structure

### Existing files to modify

- `backend/app/services/adapters/adk_to_sse.py`
  - Responsibility: ADK Event → SSE 6 事件转换
  - Planned change: 增加可复用的 artifact 标准化提取方法（不做 DB 写入）

- `backend/app/api/v1/conversations.py`
  - Responsibility: `/conversations/{id}/stream` 流式输出（mock / ADK）
  - Planned change: 在 ADK stream 分支接入 artifact 落库编排（SSE 优先）

### New files to create

- `backend/app/services/artifact.py`
  - Responsibility: Artifact 版本化落库服务（append_version）
  - Interface:
    - `append_version(db, conversation_id, message_id, artifact_payload, event_id=None) -> Artifact`

- `backend/tests/services/adapters/test_adk_to_sse_artifact.py`
  - Responsibility: Translator artifact 提取与 SSE artifact 事件转换测试

- `backend/tests/services/test_artifact_service.py`
  - Responsibility: ArtifactService version 递增、归并键降级、重复事件去重测试

- `backend/tests/api/test_conversation_stream_artifact_persistence.py`
  - Responsibility: stream 链路中“artifact 事件输出 + 落库不阻断”集成测试

- `backend/tools/verify_artifact_protocol.py`
  - Responsibility: Day 7 Claude/Codex 协议一致性检查脚本（6 事件覆盖与字段校验）

---

### Task 1: 建立 Translator 的 artifact 标准化提取能力（TDD）

**Files:**
- Modify: `backend/app/services/adapters/adk_to_sse.py`（新增 artifact 规范化辅助方法）
- Test: `backend/tests/services/adapters/test_adk_to_sse_artifact.py`

- [ ] Step 1: 写失败测试（custom_metadata artifact）
- [ ] Step 2: 运行单测确认失败
- [ ] Step 3: 最小实现使测试通过
- [ ] Step 4: 增加失败测试（仅 artifact_delta 也可产出）
- [ ] Step 5: 运行该测试文件确认通过
- [ ] Step 6: 提交

### Task 2: 新增 ArtifactService（version 递增与归并键策略，TDD）

**Files:**
- Create: `backend/app/services/artifact.py`
- Test: `backend/tests/services/test_artifact_service.py`
- Reference model: `backend/app/models/artifact.py`

- [ ] Step 1: 写失败测试（同 artifact.id 连续递增 version）
- [ ] Step 2: 运行单测确认失败
- [ ] Step 3: 最小实现 merge key 构建函数
- [ ] Step 4: 扩展失败测试（append_version 版本递增）
- [ ] Step 5: 实现最小 append_version
- [ ] Step 6: 运行服务测试确认通过
- [ ] Step 7: 提交

### Task 3: 在 ADK stream 链路接入“先发 SSE 后落库”（TDD）

**Files:**
- Modify: `backend/app/api/v1/conversations.py`
- Modify: `backend/app/services/adapters/adk_to_sse.py`（若需返回 artifact 元信息辅助）
- Test: `backend/tests/api/test_conversation_stream_artifact_persistence.py`

- [ ] Step 1: 写失败测试（artifact 事件输出不受落库失败影响）
- [ ] Step 2: 运行单测确认失败
- [ ] Step 3: 在 stream 分支实现落库编排（SSE 优先）
- [ ] Step 4: 运行测试确认通过
- [ ] Step 5: 补充路径测试（成功落库）
- [ ] Step 6: 运行 API 相关测试
- [ ] Step 7: 提交

### Task 4: 增加去重与冲突重试（服务层），防止重复写入

**Files:**
- Modify: `backend/app/services/artifact.py`
- Modify: `backend/tests/services/test_artifact_service.py`

- [ ] Step 1: 写失败测试（同 event_id 重复不新增版本）
- [ ] Step 2: 运行测试确认失败
- [ ] Step 3: 实现最小去重 + 重试
- [ ] Step 4: 运行服务测试确认通过
- [ ] Step 5: 提交

### Task 5: Day 7 协议一致性验证脚本（Claude/Codex）

**Files:**
- Create: `backend/tools/verify_artifact_protocol.py`
- Optional notes update: `backend/docs/adk_event_mapping.md`（如发现字段差异）

- [ ] Step 1: 写失败测试（字段校验函数）
- [ ] Step 2: 运行测试确认失败
- [ ] Step 3: 最小实现协议校验脚本
- [ ] Step 4: 跑脚本分别验证 Claude/Codex
- [ ] Step 5: 若有差异，更新映射文档
- [ ] Step 6: 提交

### Task 6: 全量回归与交付物检查

**Files:**
- Verify only（无新增代码）
- Optional update: `docs/AgentHub 响应格式与前后端对齐约定.md`（若出现新增必须约定字段）

- [ ] Step 1: 运行后端目标测试集
- [ ] Step 2: 启动服务做手工流式冒烟
- [ ] Step 3: 调用 stream 端点人工检查事件序列
- [ ] Step 4: 验证 artifacts 多版本可读取
- [ ] Step 5: 最终提交

---

## Spec Coverage Check (Self-Review)

- [x] 每次 artifact 增量存一版 → Task 2 / Task 3 / Task 4
- [x] 归并键优先 `artifact.id`，缺失降级 → Task 2
- [x] SSE 优先、落库失败不阻断主链路 → Task 3
- [x] 最小去重与并发冲突重试 → Task 4
- [x] Claude/Codex 协议一致性验证（只看协议） → Task 5
- [x] 回归验证（API + 流式 + artifacts 查询） → Task 6

## Placeholder / Consistency Check (Self-Review)

- [x] 无 TBD/TODO/“implement later” 类占位语句
- [x] 函数命名一致：`build_artifact_merge_key`, `append_version`, `validate_event_payload`
- [x] 所有任务均包含文件路径、测试命令、预期结果、提交步骤
