# 核心数据库表

14 个 Model，定义在 `backend/app/models/`。

## 用户 (`User`)

| 列 | 类型 | 说明 |
|----|------|------|
| id | UUID PK | |
| email | String(255) | |
| name | String(100) | |
| avatar_url | String(500) | |
| password_hash | String(255) | |
| is_active | Boolean | |

## Agent (`Agent`)

| 列 | 类型 | 说明 |
|----|------|------|
| id | UUID PK | |
| name | String(100) | |
| avatar_url | String(500) | |
| provider | String(50) | `anthropic`, `openai`, `deepseek`, `claude-code-cli` 等 |
| model | String(100) | `claude-sonnet-4-6`, `gpt-4o` 等 |
| system_prompt | Text | 系统提示词 |
| capabilities | JSONB | `["coding", "reasoning", ...]` |
| api_key | String(500) | 加密存储 |
| base_url | String(500) | API 基址 |
| tool_config | JSONB | 工具配置 |
| is_builtin | Boolean | 是否为内置 Agent |
| is_active | Boolean | |
| created_by | UUID FK→users | 创建者（null 表示内置） |

## 对话 (`Conversation`)

| 列 | 类型 | 说明 |
|----|------|------|
| id | UUID PK | |
| title | String(200) | |
| type | String(20) | `single` / `group` |
| owner_id | UUID FK→users | |
| project_id | UUID FK→projects | |
| is_archived | Boolean | |
| is_pinned | Boolean | |
| is_deleted | Boolean | 软删除 |
| deleted_at | DateTime | |
| last_active_at | DateTime | |

## 对话参与者 (`ConversationParticipant`)

| 列 | 类型 | 说明 |
|----|------|------|
| conversation_id | UUID FK | |
| participant_type | String(20) | `agent` |
| participant_id | UUID | Agent ID |

## 消息 (`Message`)

| 列 | 类型 | 说明 |
|----|------|------|
| id | UUID PK | |
| conversation_id | UUID FK | |
| sender_type | String(20) | `user`, `agent`, `orchestrator`, `system` |
| sender_id | UUID | |
| parent_message_id | UUID FK | 引用回复 |
| content_type | String(20) | `text` |
| content | Text | |
| status | String(20) | `pending`, `done`, `failed` |
| meta | JSONB | 元数据（如 `agent_name`） |

## 消息 @提及 (`MessageMention`)

| 列 | 类型 | 说明 |
|----|------|------|
| message_id | UUID FK | |
| agent_id | UUID | |

## 消息钉选 (`MessagePin`)

| 列 | 类型 | 说明 |
|----|------|------|
| conversation_id | UUID FK | |
| message_id | UUID FK | |
| created_by | UUID FK | |

## 产物 (`Artifact`)

| 列 | 类型 | 说明 |
|----|------|------|
| id | UUID PK | |
| conversation_id | UUID FK | |
| message_id | UUID FK | |
| artifact_type | String(50) | `code`, `diff`, `preview`, `plan`, `orchestrator_summary` 等 |
| title | String(200) | |
| content | JSONB | 产物内容 |
| storage_key | String(500) | MinIO 存储键 |
| mime_type | String(100) | |
| version | Integer | 版本号 |

## 编排任务 (`OrchestratorTask`)

| 列 | 类型 | 说明 |
|----|------|------|
| id | UUID PK | |
| conversation_id | UUID FK | |
| trigger_message_id | UUID FK | |
| status | String(20) | `planning`, `plan_draft`, `awaiting_confirmation`, `refining`, `confirmed`, `running`, `completed`, `failed` |
| plan | JSONB | 计划结构（含 subtasks 数组） |
| result_summary | JSONB | 执行摘要 + DAG 数据 |
| planner_agent_id | UUID | 指定规划 Agent |

## 编排子任务 (`OrchestratorSubtask`)

| 列 | 类型 | 说明 |
|----|------|------|
| task_id | UUID FK | |
| agent_id | UUID | |
| instruction | Text | |
| status | String(20) | `queued`, `running`, `success`, `failed` |
| latency_ms | Integer | |
| error_detail | Text | |
| output_message_id | UUID | |
| depends_on | JSONB | 依赖关系 |
| mode | String(20) | `single_turn` |
| execution_order | Integer | |

## 项目 (`Project`), 验证码 (`VerificationCode`)

基础 CRUD + 邮箱验证码。
