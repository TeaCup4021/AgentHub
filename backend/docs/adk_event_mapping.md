# ADK Event → SSE 6 事件映射

日期：2026-05-23

## 目的
确认 ADK `Runner.run_async()` 产出的 Event 字段，与 AgentHub SSE 6 事件协议的映射关系。

## SSE 6 事件回顾
- `message_start`
- `token`
- `artifact`
- `agent_status`
- `message_end`
- `error`

## 映射表
| ADK Event 字段 | 判断条件 | SSE 事件 | SSE 字段 |
|---|---|---|---|
| `invocation_id` | 首次出现新 invocation_id | `message_start` | message_id |
| `author` | 新 author 首次出现 | `message_start` | sender.type/id/name |
| `content.parts[].text` | `partial=True` | `token` | delta, index(自增) |
| `actions.artifact_delta` | 非空 | `artifact` | artifact.id/type/title/content |
| `actions.transfer_to_agent` | 非空 | `agent_status` | agent.id/name, status="running" |
| `actions.end_of_agent` | True | `agent_status` / `message_end` | status="done" / finish_reason |
| `turn_complete` | True | `message_end` | finish_reason, usage |
| `usage_metadata` | 非空 | `message_end` | usage.input_tokens/output_tokens |
| `error_code` / `error_message` | 非空 | `error` | code, message, retryable |
| `timestamp` | 始终 | 全部事件 | timestamp |
| `branch` | 非空 | `agent_status` | subtask_id |

## 生命周期示例（顺序）
1. `message_start`：新 invocation/author 首次出现。
2. `token`：`partial=True` 且有 text parts，连续多次。
3. `artifact`：`actions.artifact_delta` 非空。
4. `agent_status`：`transfer_to_agent` 或 `end_of_agent`。
5. `message_end`：`turn_complete=True`，附带 usage。
6. `error`：`error_code` 或 `error_message` 非空。

## 备注
- `usage_metadata` 常与 `turn_complete` 同时出现，作为 `message_end` 的 usage 字段。
- `message_end` 与 `error` 可以在同一轮中先后出现，具体由 Runner 事件顺序决定。

