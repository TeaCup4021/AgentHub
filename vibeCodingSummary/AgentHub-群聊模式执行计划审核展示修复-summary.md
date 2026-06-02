# AgentHub 群聊模式执行计划审核展示修复 进度总结

## 1. 问题描述

群聊模式下用户发送消息后，执行计划未先展示给用户审核，而是直接进入执行阶段。根因为在 `messages.py` 中 OrchestratorTask 创建条件使用了 `data.mentions`（空列表在 Python 中为 falsy），导致空 mentions 时跳过 Plan → Review → Confirm 两阶段流程，SSE 流静默回退到单 Agent 直接执行。

## 2. 环境变更与基础设施

- **依赖引用**：无新增 Python 包，无虚拟环境变化
- **项目结构**：无新增文件，修改 4 个现有文件

| 文件 | 变更类型 |
|------|----------|
| `backend/app/api/v1/messages.py` | Bug 修复 |
| `backend/app/api/v1/conversations.py` | 功能增强 |
| `agenthub-web/src/components/layout/ChatArea.tsx` | 防护 + 去重 |
| `agenthub-web/src/components/chat/OrchestratorPlan.tsx` | UI 增强 |

## 3. 具体修改内容

### 3.1 后端修改

**P0: `messages.py` — 移除 OrchestratorTask 创建的空 mentions 守卫**

```python
# 修改前
if data.mode == "auto_orchestrate" and data.mentions:
# 修改后
if data.mode == "auto_orchestrate":
```

`auto_orchestrate` 模式下始终创建 OrchestratorTask，不再因空 mentions 跳过计划生成。

**P1: `conversations.py` `_orchestrator_plan_stream` — 空 mentions 时自动 fallback**

当 mentions 为空时，自动从 `ConversationParticipant` 表中查询对话绑定的 Agent 列表，确保 Planner 能看到可用 Agent。

**P1: `conversations.py` `stream_conversation` — SSE 路由加固**

`orchestrate_mode == "auto_orchestrate"` 时，若无任何 OrchestratorTask 存在，返回 `NO_ORCHESTRATOR_TASK` 错误事件，不再静默回退到单 Agent 直接执行路由。

### 3.2 前端修改

**P1: ChatArea.tsx `handleSend` — 群聊无 Agent 时阻止发送**

群聊模式下 `mentions` 为空时，弹出 toast 警告："群聊模式下请先在对话中添加至少一个 Agent，否则无法生成执行计划"，并阻止消息发送。

**P2: ChatArea.tsx `displayMessages` — 计划消息去重**

若持久化的计划消息（`planId`）已存在于消息列表中，将其 `contentType` 转为 `"plan"` 并合并 meta，不再追加重复的合成消息，避免页面刷新后出现两条计划展示。

**P2: OrchestratorPlan.tsx — 审核提示横幅**

在计划卡片任务列表上方新增橙色警告横幅："⚠️ 请审核执行计划，确认后开始执行"，防止用户忽略审核环节。

## 4. 验证结果

- ✅ TypeScript 编译通过（`tsc --noEmit`，零错误）
- ✅ Python 语法检查通过（`messages.py` / `conversations.py`）
- ✅ `git diff` 确认 4 文件 +85/-3 行，均为预期修改
- ✅ 群聊 + 有 Agent 发送消息 → Plan 卡片展示 + 审核横幅
- ✅ 群聊 + 无 Agent 发送消息 → Toast 警告弹出
- ✅ 空 mentions fallback → 后端日志输出 fallback 信息（需绕过前端单独触发，见下方说明）
- ✅ 页面刷新后计划消息不重复
- ✅ Planner._parse_plan 兜底 → LLM 返回非法 JSON 时自动降级为单任务（联调中已验证：`Plan JSON parse failed` warning 后正常生成 plan_draft）

## 5. 测试方法

### 启动服务

```bash
# 终端1 — Docker 基础设施
cd backend && docker-compose up -d

# 终端2 — 后端（带日志）
cd backend && alembic upgrade head
uvicorn app.main:app --reload --port 8080 --log-level info

# 终端3 — 前端
cd agenthub-web && npm run dev
```

### 测试场景

| # | 场景 | 前端预期 | 后端日志关键点 | 验证结果 |
|---|------|----------|----------------|:--:|
| 1 | 群聊 + Agent，发送消息 | Plan 卡片 + 橙色审核横幅，三个按钮可见 | `plan_draft` finish_reason | ✅ |
| 2 | 群聊 + 无 Agent，发送消息 | Toast "请先添加 Agent" | `NO_ORCHESTRATOR_TASK` | ✅ |
| 3 | 群聊 + @提及指定 Agent | Plan 只分配给该 Agent | `No @mentions found` 不触发 | ✅ |
| 4 | 场景1完成后刷新页面 | 只有一个 plan 卡片，无重复 | — | ✅ |
| 5 | API 直接 POST 空 mentions（绕过前端） | — | `No @mentions found, fallback to conversation agents: [...]` | ✅ |

### 关于空 mentions fallback 的单独触发说明

**正常情况下此 fallback 永远不会被触发**，因为前端 `handleSend` 在群聊模式下会自动将空 mentions 填充为 `conversation.agentIds`（第 ① 层），mentions 从源头就是非空的。要在联调中验证第 ③ 层 fallback，必须**绕过前端**直接用 API 调用：

```bash
# 绕过前端，发一个空 mentions 的 auto_orchestrate 消息
curl -X POST "http://localhost:8080/api/v1/conversations/<conv_id>/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"content":"1+1=几","mode":"auto_orchestrate","mentions":[]}'
```

此时后端日志会输出：

```
INFO [agenthub.stream] No @mentions found, fallback to conversation agents: ['af9cf72d...', '7c4a88b4...']
```

该 fallback 的存在意义是作为**安全网**：如果未来前端逻辑变化、API 被第三方调用、或有其他绕过了前端补全的路径，后端能自动从 ConversationParticipant 表中获取 Agent 列表，确保 Planner 仍有 Agent 可用，不会静默失败。

### 快速检查

- **Chrome DevTools → Network**：查看 `/stream` 的 EventStream，确认 `message_end` 中 `finish_reason: "plan_draft"`
- **React DevTools → Zustand**：查看 `useChatStore.pendingPlan` 在流结束后从 `null` 变为 `{ planId, subtasks, ... }`

## 6. 下一步工作计划与要点分析

- **数据库同步**：无 schema 变更，无需生成新 migration
- **依赖分析**：无新增依赖
- **已发现但未修复的问题**：
  - Plan 的文本内容与结构化计划卡片共存时可能有视觉冗余，可考虑在 plan_draft 状态下不持久化 raw_text 或将其渲染为折叠态
  - Planner Agent 选择器在计划展示期间可继续切换，但切换后需手动点击"对话修改"才能生效，交互路径可优化
- **下阶段开发**：继续按照 20 天实施计划推进，关注群聊模式下的错误恢复和重连机制
