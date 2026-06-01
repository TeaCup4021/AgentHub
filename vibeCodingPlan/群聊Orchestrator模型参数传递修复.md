# 群聊 Orchestrator 模型参数传递修复

## 问题描述

群聊模式下，在前端选择了一个 Agent 作为 Planner（任务分配者），但后端没有使用选定 Agent 的模型进行规划，而是走了内置 Orchestrator 降级策略。根因是 **`planner_agent_id` 参数在多层传递链中存在丢失路径**。

---

## 根因分析

### 数据流链路

```
前端 Select (ChatArea.tsx)
    │  onChange → setPlannerAgentId(state)
    │  useEffect → plannerAgentIdRef.current = state  ← Bug 1: 异步同步不可靠
    ▼
executeSend (ChatArea.tsx)
    │  plannerAgentId: plannerAgentIdRef.current       ← Bug 1: 可能读到 null
    ▼
POST /conversations/{id}/messages
    │  body: { plannerAgentId, mode, mentions, ... }
    ▼
backend messages.py
    │  if mode == "refine_plan":                       ← Bug 2: 忽略 planner_agent_id
    │     return (未更新 task.planner_agent_id)
    │  if mode == "auto_orchestrate" and mentions:
    │     OrchestratorTask(planner_agent_id=...)       ← 仅此路径正确
    ▼
SSE Stream GET /conversations/{id}/stream
    │  ?orchestrate_mode=auto_orchestrate              ← Bug 3: 未传 planner_agent_id
    ▼
backend conversations.py
    │  stream_conversation → 查 OrchestratorTask
    │  _orchestrator_plan_stream
    │     orch_task.planner_agent_id
    │     → planner_agent = db.get(Agent, id)
    │     → planner.plan(planner_agent=planner_agent)
    ▼
planner.py
    │  if planner_agent is not None:
    │     _plan_with_agent → build_agent_from_model   ← 使用 Agent 自己的模型 ✅
    │  else:
    │     _plan_with_orchestrator → get_deepseek_llm() ← 降级策略 ❌
```

### Bug 1（主因）：`plannerAgentIdRef` 通过 `useEffect` 同步 — 竞态条件

**位置**: `agenthub-web/src/components/layout/ChatArea.tsx:43-45`

```tsx
const [plannerAgentId, setPlannerAgentId] = useState<string | null>(null);
const plannerAgentIdRef = useRef<string | null>(null);
useEffect(() => { plannerAgentIdRef.current = plannerAgentId; }, [plannerAgentId]);
```

React 的 `useEffect` 在浏览器绘制后**异步**执行。当用户在下拉框中选择了 Agent 后立即发送消息（两次交互在同一个微任务批次中），`plannerAgentIdRef.current` 可能仍然是 `null`。

`executeSend` 在第 310 行读取该 ref：

```tsx
plannerAgentId: conv?.type === "group" ? plannerAgentIdRef.current : undefined,
```

若读到 `null`，后端收到 `"plannerAgentId": null`（Pydantic 映射为 `planner_agent_id=None`），导致 `OrchestratorPlanner.plan()` 走 `_plan_with_orchestrator` 降级路径，使用 `get_deepseek_llm()` 而非用户选定的 Agent 模型。

### Bug 2：`refine_plan` 模式后端忽略 `planner_agent_id`

**位置**: `backend/app/api/v1/messages.py:48-71`

```python
if data.mode == "refine_plan":
    # ... 只修改 task.status = "refining"
    # 完全忽略 data.planner_agent_id！
    task.status = "refining"
    user_msg = await MessageService.create_message(...)
    await db.commit()
    return user_msg
```

`executeSend` 中当 `_pendingPlan` 存在时，`msgMode` 为 `"refine_plan"`：

```tsx
const msgMode = _pendingPlan
    ? "refine_plan"       // ← 此时 mode 不是 auto_orchestrate
    : conv?.type === "group"
        ? "auto_orchestrate"
        : "direct";
```

若用户在计划草稿展示期间更改了 Planner 选择，新值 `plannerAgentId` 虽在 POST body 中发送，但后端 `refine_plan` 处理器未将其应用到 `OrchestratorTask.planner_agent_id`。

### Bug 3：SSE 流 URL 缺少 `planner_agent_id`

**位置**:
- `agenthub-web/src/lib/sse.ts:30-54`
- `agenthub-web/src/components/layout/ChatArea.tsx:304`

```ts
// sse.ts — 只传了 orchestrate_mode，未传 planner_agent_id
const streamUrl = new URL(`/api/v1/conversations/${conversationId}/stream`, ...);
if (orchestrateMode) streamUrl.searchParams.set("orchestrate_mode", orchestrateMode);
// ← 缺少: planner_agent_id
```

虽然后端通过查询 `OrchestratorTask` 表来获取 `planner_agent_id`，但增加显式 SSE 参数可以作为 DB 查询失败时的 fallback，同时让意图更明确。

---

## 修复方案

### 修复 1：将 `plannerAgentIdRef` 改为同步更新（核心修复）

**文件**: `agenthub-web/src/components/layout/ChatArea.tsx`

**方案**: 在 Select 的 `onChange` 中同时更新 state 和 ref，消除 `useEffect` 异步同步的竞态窗口。

```tsx
// 删除 useEffect 同步
// useEffect(() => { plannerAgentIdRef.current = plannerAgentId; }, [plannerAgentId]);

// 在 Select onChange 中同步更新
<Select
    value={plannerAgentId ?? ""}
    onChange={(v) => {
        const value = v ? String(v) : null;
        setPlannerAgentId(value);
        plannerAgentIdRef.current = value;  // ← 立即同步，无竞态
    }}
    ...
>
```

**影响范围**: 仅 `ChatArea.tsx` 一处改动，消除所有通过 `plannerAgentIdRef.current` 读取的竞态风险。

---

### 修复 2：`refine_plan` 处理器应用 `planner_agent_id`

**文件**: `backend/app/api/v1/messages.py`

**方案**: 在 `refine_plan` 分支中，若 `data.planner_agent_id` 有值，更新 `task.planner_agent_id`。

```python
if data.mode == "refine_plan":
    if not data.plan_id:
        raise HTTPException(status_code=400, detail="plan_id is required for refine_plan mode")

    result = await db.execute(
        select(OrchestratorTask)
        .where(
            OrchestratorTask.conversation_id == conv_id,
            OrchestratorTask.status == "plan_draft",
        )
        .order_by(OrchestratorTask.created_at.desc())
        .limit(1)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="No plan_draft task found to refine")

    # ✅ 新增：若用户更改了 Planner 选择，更新 task
    if data.planner_agent_id is not None:
        planner_result = await db.execute(
            select(Agent).where(Agent.id == data.planner_agent_id)
        )
        if not planner_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="planner_agent_id not found")
        task.planner_agent_id = data.planner_agent_id

    task.status = "refining"
    user_msg = await MessageService.create_message(
        db=db, conv_id=conv_id, user_id=user_id, data=data,
    )
    await db.commit()
    return user_msg
```

---

### 修复 3：SSE 流 URL 增加 `planner_agent_id` 参数

**文件**:
- `agenthub-web/src/lib/sse.ts`
- `agenthub-web/src/components/layout/ChatArea.tsx`
- `backend/app/api/v1/conversations.py`

**方案**: 从 SSE 流创建到后端接收，全链路增加 `planner_agent_id` 传递。

#### 3a. `sse.ts` — 增加参数

```ts
export function createSSEStream(
  conversationId: string,
  callbacks: SSECallbacks,
  prompt?: string,
  orchestrateMode?: string,
  plannerAgentId?: string | null,    // ← 新增
): () => void {
  // ...
  if (orchestrateMode) streamUrl.searchParams.set("orchestrate_mode", orchestrateMode);
  if (plannerAgentId) streamUrl.searchParams.set("planner_agent_id", plannerAgentId);  // ← 新增
  // ...
}
```

#### 3b. `ChatArea.tsx` — 透传 `plannerAgentId`

在所有调用 `createSSEStream` 的地方，传入 `plannerAgentIdRef.current`：

```tsx
// auto_orchestrate 流
disconnectRef.current = createSSEStream(convId, {
    ...buildCallbacks(convId, conv),
    onConnectionError,
}, content, streamMode, plannerAgentIdRef.current);  // ← 新增参数

// confirm_plan 流
disconnectRef.current = createSSEStream(activeId, {
    ...callbacks,
    onConnectionError: () => { ... },
}, undefined, "auto_orchestrate", plannerAgentIdRef.current);  // ← 新增参数

// reconnect 流（在 onConnectionError 中）
const reconnectCallbacks = buildCallbacks(convId, conv);
disconnectRef.current = createSSEStream(convId, {
    ...reconnectCallbacks,
    onConnectionError: () => { ... },
}, lastPromptRef.current, streamMode, plannerAgentIdRef.current);  // ← 新增参数
```

#### 3c. `conversations.py` — 后端接收并 fallback

```python
@router.get("/{conv_id}/stream")
async def stream_conversation(
    conv_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    prompt: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    orchestrate_mode: Optional[str] = Query(None, alias="orchestrateMode"),
    planner_agent_id: Optional[UUID] = Query(None, alias="plannerAgentId"),  # ← 新增
):
```

在流处理函数中使用该参数作为 DB 查询的 fallback（如果 `OrchestratorTask` 中的 `planner_agent_id` 为空但 query param 有值）。

---

### 修复 4（防御性）：`_plan_with_agent` 清空 Planner Agent 的工具

**文件**: `backend/app/services/adk/planner.py`

**方案**: 当 Agent 被用作 Planner 时，不应加载其工具集（工具可能干扰规划任务）。

```python
async def _plan_with_agent(
    self,
    planner_agent: Agent,
    executors: List[Agent],
    user_message: str,
    conversation_id: UUID,
) -> OrchestratorPlanResult:
    agent = build_agent_from_model(planner_agent)
    agent.instruction = self._build_agent_planner_instruction(user_message, executors)
    agent.tools = []  # ✅ 新增：Planner 不需要工具
    agent.planner = BuiltInPlanner(
        thinking_config=types.ThinkingConfig(thinking_budget=1024)
    )
    return await self._run_planner(agent, user_message, conversation_id, executors)
```

---

## 涉及文件总览

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `agenthub-web/src/components/layout/ChatArea.tsx` | **修改** | Select onChange 同步更新 ref；透传 plannerAgentId 到 SSE 流 |
| 2 | `agenthub-web/src/lib/sse.ts` | **修改** | createSSEStream 增加 plannerAgentId 参数 |
| 3 | `backend/app/api/v1/messages.py` | **修改** | refine_plan 分支应用 planner_agent_id |
| 4 | `backend/app/api/v1/conversations.py` | **修改** | SSE 端点接收 planner_agent_id 参数做 fallback |
| 5 | `backend/app/services/adk/planner.py` | **修改** | _plan_with_agent 清空 tools（防御性） |

---

## 实现顺序

```
Step 1: ChatArea.tsx — Select onChange 同步更新 ref              ← 核心修复，消除竞态
Step 2: messages.py — refine_plan 分支应用 planner_agent_id      ← 后端参数接收
Step 3: sse.ts — 增加 plannerAgentId 参数                        ← SSE 链路增强
Step 4: ChatArea.tsx — 所有 createSSEStream 调用点透传参数       ← 配合 Step 3
Step 5: conversations.py — SSE 端点接收 planner_agent_id        ← 配合 Step 3
Step 6: planner.py — _plan_with_agent 清空工具（防御性）         ← 可选增强
```

---

## 验证方案

1. **正常流程验证**：群聊中选择 Agent-A 作为 Planner → 发送消息 → 检查后端日志确认使用了 Agent-A 的模型（而非 `get_deepseek_llm()`）
2. **快速操作验证**：选择 Planner 后立即按 Enter 发送 → 确认参数正确传递
3. **计划修改验证**：计划草稿展示期间，切换 Planner → 发送修改消息 → 确认修改使用了新的 Planner 模型
4. **日志检查点**：`planner.py:60` 进入 `_plan_with_agent`（正确路径）vs `planner.py:64` 进入 `_plan_with_orchestrator`（降级路径）
