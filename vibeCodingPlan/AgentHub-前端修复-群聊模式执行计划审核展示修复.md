# AgentHub-前端修复-群聊模式执行计划审核展示修复

## 实施目标

修复群聊模式下发送消息时，执行计划未先展示给用户审核而是直接执行的问题。

## 计划实现功能

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/conversations/{conv_id}/messages` | POST | 修复 `auto_orchestrate` 模式下 OrchestratorTask 创建条件 |
| `/api/v1/conversations/{conv_id}/stream` | GET | SSE 流路由逻辑加固 |

---

## 1. 问题根因分析

### 1.1 核心 Bug

**文件**: `backend/app/api/v1/messages.py` 第 160 行

```python
if data.mode == "auto_orchestrate" and data.mentions:
```

Python 中空列表 `[]` 是 falsy。当 `data.mentions` 为空列表时，整个条件为 `False`，导致 `OrchestratorTask` **不会被创建**。SSE 流随后回退到单 Agent 直接执行路径，完全跳过了 Plan → Review → Confirm 的标准两阶段流程。

### 1.2 触发场景

| 场景 | mentions 值 | OrchestratorTask 创建？ | 行为 |
|------|-------------|------------------------|------|
| 群聊有 Agent，未 @提及 | `conversation.agentIds` (非空) | ✅ 是 | 正确：展示计划 |
| 群聊有 Agent，@提及了 | 手动提及的 ID 列表 | ✅ 是 | 正确：展示计划 |
| **群聊无 Agent** | `[]` (空列表) | ❌ 否 | **Bug：跳过计划直接执行** |
| 单聊模式 | `[]` (空列表) | N/A（走 direct 路径） | 正确：直接执行 |

### 1.3 全链路追踪

```
用户发送消息 → ChatInput.handleSend
  → ChatArea.handleSend (群聊自动填充 mentions = conversation.agentIds)
    → executeSend (msgMode = "auto_orchestrate")
      → POST /messages { mode: "auto_orchestrate", mentions: [...] }
        → ❌ if mentions 为空: 不创建 OrchestratorTask
        → ✅ if mentions 非空: 创建 OrchestratorTask(status="planning")
      → GET /stream?orchestrateMode=auto_orchestrate
        → 查找 status="planning" → 未找到！
        → 查找 status="confirmed" → 未找到！
        → 回退到单 Agent 直接执行（无 Plan）
      → ❌ 用户看到：Agent 直接执行，没有 Plan Review
```

### 1.4 辅助问题

**a) SSE 流的 `orchestrate_mode` 参数未被有效利用**

`backend/app/api/v1/conversations.py` 第 1065 行的 `orchestrate_mode` 参数仅在检查失败任务时使用（第 1132 行），不影响实际路由逻辑。路由完全依赖数据库中的 `OrchestratorTask.status`。

**b) 前端无降级提示**

当群聊无 Agent 时，前端没有给出警告，用户不知道为什么没看到计划审核界面。

**c) 计划消息与持久化消息可能重复展示**

`_orchestrator_plan_stream` 将计划消息持久化到数据库（sender_type="orchestrator", content=plan_raw_text），而前端 `displayMessages` 又基于 `pendingPlan` 创建了一个合成消息（contentType="plan"）。在消息列表刷新后，用户可能看到两条消息：一条是持久化的 markdown 文本，一条是合成计划卡片。

---

## 2. 修复方案

### 2.1 后端修复（关键）

#### 修改 1: 移除 OrchestratorTask 创建的空 mentions 守卫

**文件**: `backend/app/api/v1/messages.py`

```python
# 修改前（第 160 行）
if data.mode == "auto_orchestrate" and data.mentions:

# 修改后
if data.mode == "auto_orchestrate":
```

**理由**: 
- 即使 `mentions` 为空，Orchestrator 也应该尝试制定计划。Planner 可以从对话参与者中获取可用 Agent 列表。
- 为空 mentions 时创建的 OrchestratorTask 仍然会触发计划生成流程，只是 Planner 看到的 agent_ids 为空。
- 如果确实没有 Agent 可用，Planner 会返回空计划或错误，由前端展示给用户。

#### 修改 2: 增强 `_orchestrator_plan_stream` 的 Agent 发现逻辑

**文件**: `backend/app/api/v1/conversations.py` 的 `_orchestrator_plan_stream` 函数

当 `mentions` 为空时，从对话的参与者中自动获取 Agent 列表作为 fallback：

```python
# 在 try 块中，获取 mentions 后添加 fallback
mentions = [m.agent_id for m in mention_result.scalars().all()]

# fallback: 如果 mentions 为空，从对话参与者获取
if not mentions:
    parts_result = await db.execute(
        select(ConversationParticipant.participant_id).where(
            ConversationParticipant.conversation_id == conv_id,
            ConversationParticipant.participant_type == "agent",
        )
    )
    mentions = list(parts_result.scalars().all())
    logger.info(
        "No @mentions found, fallback to conversation agents: %s",
        [str(m) for m in mentions],
    )
```

#### 修改 3: SSE 流路由加固

**文件**: `backend/app/api/v1/conversations.py` 的 `stream_conversation` 函数

在第 1132 行，增强 `orchestrate_mode` 的使用：当 `orchestrate_mode == "auto_orchestrate"` 且没有找到任何 OrchestratorTask 时，返回明确的错误提示而不是回退到单 Agent 执行：

```python
if orchestrate_mode == "auto_orchestrate":
    # 群聊模式但无 OrchestratorTask → 不应该静默回退
    return StreamingResponse(
        _error_sse_stream(
            "NO_ORCHESTRATOR_TASK",
            "群聊模式需要先创建编排任务，请检查对话是否已绑定 Agent",
        ),
        media_type="text/event-stream",
    )
```

### 2.2 前端修复

#### 修改 4: 群聊无 Agent 时的前端警告

**文件**: `agenthub-web/src/components/layout/ChatArea.tsx` 的 `handleSend` 函数

在群聊模式下，如果 `conversation.agentIds` 为空，阻止发送并给出提示：

```typescript
const handleSend = useCallback(async (content: string, mentions: string[]) => {
    if (!activeId || !conversation) return;

    if (conversation.type === "group" && mentions.length === 0) {
      mentions = conversation.agentIds;
    }

    // 新增：群聊无 Agent 时给出提示
    if (conversation.type === "group" && conversation.agentIds.length === 0) {
      toast.warning("群聊模式下请先添加至少一个 Agent");
      return;
    }
    // ...
}, [...]);
```

#### 修改 5: 计划审核状态的 UI 强化

**文件**: `agenthub-web/src/components/chat/OrchestratorPlan.tsx`

增加更明显的"等待审核"视觉标识，防止用户错过计划审核：

- 在计划卡片顶部添加醒目的提示行（例如带背景色的 banner："📋 请审核执行计划，确认后开始执行"）
- "确认执行"按钮使用更醒目的样式

### 2.3 数据一致性修复

#### 修改 6: 避免计划消息重复展示

**文件**: `agenthub-web/src/components/layout/ChatArea.tsx` 的 `displayMessages`

当 `pendingPlan` 存在时，检查 `filteredMessages` 是否已包含对应的持久化计划消息。如果已存在，不再创建合成消息，而是修改已有消息的 content_type 和 meta。

```typescript
const displayMessages = useMemo(() => {
    if (!pendingPlan) return filteredMessages;
    
    // 检查是否已存在相同的计划消息（避免重复）
    const existingPlanMsg = filteredMessages.find(
      m => m.id === pendingPlan.planId
    );
    
    if (existingPlanMsg) {
      // 修改已有消息的属性使其作为计划卡片渲染
      return filteredMessages.map(m =>
        m.id === pendingPlan.planId
          ? {
              ...m,
              contentType: "plan",
              meta: {
                planId: pendingPlan.planId,
                subtasks: pendingPlan.subtasks,
                plannerAgentName: pendingPlan.plannerAgentName,
                plannerAgentId: pendingPlan.plannerAgentId,
              },
            }
          : m
      );
    }
    
    // 合成新消息（原有逻辑）
    const planMsg: Message = { /* ... */ };
    return [...filteredMessages, planMsg];
}, [filteredMessages, pendingPlan, activeId]);
```

---

## 3. 涉及文件清单

| 文件 | 修改类型 | 优先级 |
|------|----------|--------|
| `backend/app/api/v1/messages.py` | Bug 修复 | **P0** |
| `backend/app/api/v1/conversations.py` | 功能增强 | P1 |
| `agenthub-web/src/components/layout/ChatArea.tsx` | 用户体验 + Bug 修复 | P1 |
| `agenthub-web/src/components/chat/OrchestratorPlan.tsx` | 用户体验增强 | P2 |

---

## 4. 验证检查点

- [ ] 群聊有 Agent 时发送消息 → Plan 正常展示 → 点击"确认执行" → 执行开始
- [ ] 群聊有 Agent 时发送消息 → Plan 正常展示 → 点击"手动编辑" → 编辑后确认 → 执行开始
- [ ] 群聊有 Agent 时发送消息 → Plan 正常展示 → 点击"对话修改" → 输入修改意见 → 新 Plan 展示
- [ ] **群聊无 Agent 时发送消息 → 前端提示"请先添加 Agent"（阻止发送）**
- [ ] 群聊空 mentions 时 → OrchestratorTask 被创建 → Plan 生成流程启动
- [ ] 计划消息不会在消息列表中重复展示
- [ ] 计划卡片有醒目的"等待审核"提示
- [ ] SSE 流不会在 `auto_orchestrate` 模式下静默回退到单 Agent 执行

---

## 5. 依赖与风险

- **依赖**: 无外部依赖，所有修改仅限于现有代码
- **风险**: 
  - `data.mentions` 条件移除后，空 mentions 场景下 Planner 需要正确处理空 Agent 列表（当前 Planner 已有 fallback 逻辑，见 `_parse_plan` 的空 agent 处理）
  - SSE 路由加固可能影响已有的降级行为，需要确认没有依赖静默回退的上游调用
  - 计划消息去重逻辑需要与消息持久化时序保持一致
