# AgentHub 后端 A - Day 13 (消息过滤与群聊联调) 进度总结

## 1. 环境变更与基础设施
- **依赖引用**：无新增 Python 包
- **数据库迁移**：无需新增 migration。`messages.sender_type` 和 `messages.sender_id` 列已在 Day 1 建表
- **项目结构**：
  - `backend/app/api/v1/messages.py`（修改）— `list_messages` 端点新增 `senderType` / `senderId` 查询参数（带 alias）
  - `backend/app/services/message.py`（修改）— `MessageService.list_messages()` 新增 `sender_type` / `sender_id` 参数，SQL 条件拼接（AND 语义）

## 2. 当前项目进度与测试结果

### 完成的功能

| # | 功能 | 说明 |
|---|------|------|
| 1 | sender_type 过滤 | `?senderType=agent` → 仅返回 agent 消息；`?senderType=orchestrator` → 仅返回 orchestrator 汇总；不传时不过滤（向后兼容） |
| 2 | sender_id 过滤 | `?senderId=<UUID>` → 仅返回该发送者的消息 |
| 3 | 组合过滤（AND） | `?senderType=agent&senderId=<UUID>` → 同时满足两个条件的消息 |
| 4 | 游标分页兼容 | sender 过滤 + cursor 分页组合正常，`hasMore` / `nextCursor` 语义不变 |

### 端点签名变更

`GET /api/v1/conversations/{conv_id}/messages`

| 参数 | 类型 | 必填 | alias | 说明 |
|------|------|------|-------|------|
| `sender_type` | `Optional[str]` | 否 | `senderType` | "user" / "agent" / "system" / "orchestrator" |
| `sender_id` | `Optional[UUID]` | 否 | `senderId` | 具体发送者 UUID |

### 测试结果

```
tests/services/test_message_sender_filter.py::test_list_messages_accepts_sender_type PASSED
tests/services/test_message_sender_filter.py::test_list_messages_accepts_sender_id PASSED
tests/services/test_message_sender_filter.py::test_list_messages_backward_compatible PASSED
tests/services/test_message_sender_filter.py::test_both_filters_have_correct_type_hints PASSED
tests/services/test_message_sender_filter.py::test_api_endpoint_has_senderType_alias PASSED
=== 5 new tests PASSED ===
```

### 现有测试回归

```
tests/api/test_conversation_stream_artifact_persistence.py (2 tests) PASSED
tests/services/adapters/test_adk_to_sse_artifact.py (4 tests) PASSED
tests/services/test_artifact_service.py (5 tests) PASSED
tests/tools/test_verify_artifact_protocol.py (4 tests) PASSED
=== 15 existing tests PASSED (regression free) ===
```

### 对齐约定文档更新
- **§37 消息列表 sender 过滤**（新增）：`GET /messages` 新增 `senderType` / `senderId` 可选查询参数，支持单独过滤和 AND 组合，不影响现有游标分页行为

## 3. 下一步工作计划与要点分析
- **群聊 REST 侧联调**（需后端 B MergeAggregator 落库后验证）：
  - orchestrator_summary artifact 在消息列表中正确内联
  - `?senderType=orchestrator` 过滤出聚合汇总消息
  - `?senderId=<agent UUID>` 过滤出特定 Agent 的输出
- **confirm_plan 幂等性**：当前代码逻辑已支持（重复确认同一 plan 返回 409），但尚未在群聊全链路中验证
- **下阶段开发**：Day 14 SpecManager CRUD + Meta-Agent 对话式创建
