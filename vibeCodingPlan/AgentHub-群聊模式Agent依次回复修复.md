# AgentHub-群聊模式 Agent 依次回复修复

## 实施目标

修复群聊模式下多个 Agent 并行执行导致 SSE 输出交织混乱的问题，实现 Agent 像群聊成员一样**依次回复各自的产出**。核心策略：**后端保持并行执行（性能不降级）+ SSE 输出层缓冲顺序化（展示干净）**。

---

## 问题现象

用户在群聊中发送消息 → Orchestrator 生成执行计划 → 确认执行后，多个 Agent 的 token 在 SSE 流中**交织混杂**，前端只能追踪一个流式消息，导致输出混乱。

**期望**: Agent A 完整输出 → Agent B 完整输出 → Agent C 完整输出（依次发言）。
**实际**: Agent A/B/C token 交织，前端 ref 被覆盖，`finalizeStreaming` 杀死未完成的流。

---

## 1. 问题根因分析

### 1.1 核心问题链

```
WorkflowBuilder: max_concurrency=3 并行执行（正确，不应改）
  → ADKToSSETranslator: 事件实时直通，未做输出缓冲/顺序化（问题所在）
    → SSE: 多 Agent token 交织在同一流中
      → Frontend: 只能追踪一个流式消息，ref 被覆盖
        → 结果: 输出混乱
```

### 1.2 各层 Gap 详析

**Gap 1 — ADKToSSETranslator 无缓冲层 (核心问题)**

文件: `backend/app/services/adapters/adk_to_sse.py`

`translate()` 方法是一个直通管道：ADK Event → SSE event。当 3 个 Agent 并行执行时，它们的 `message_start` / `token` / `message_end` 事件在 `async for` 中按到达顺序交错产出，没有任何排队或缓冲机制。

```
时间线:
  Agent A: [token_a1] [token_a2]                   [message_end_A]
  Agent B:        [token_b1] [token_b2] [token_b3]                    [message_end_B]
  Agent C:                            [token_c1]        [token_c2] [message_end_C]

SSE 输出:
  token_a1, token_b1, token_a2, token_b2, token_b3, token_c1, token_a_end, token_c2, token_b_end, token_c_end
  ← 完全交织，前端无法解析
```

**Gap 2 — 前端单流追踪 (连锁反应)**

文件: `agenthub-web/src/components/layout/ChatArea.tsx` 第 38-40 行

```typescript
const streamMsgIdRef = useRef<string | null>(null);   // 只有一个
const streamAgentRef = useRef<string>("");
```

当多个 `message_start` 事件连续到达时，ref 被不断覆盖。

**Gap 3 — finalizeStreaming 全局杀死 (连锁反应)**

文件: `agenthub-web/src/stores/chatStore.ts` 第 131-134 行

```typescript
return { isStreaming: false, streamingContent: rest };  // 任一 Agent 结束 → 全部杀死
```

**Gap 4 — 单气泡渲染 (连锁反应)**

文件: `agenthub-web/src/components/chat/MessageList.tsx` 第 474 行

```typescript
{streamingMessageId && streamingAgentName && (
    <StreamingMessageBubble ... />  // 只渲染一个
)}
```

---

## 2. 修复方案总览

### 核心思路: 活跃 Agent 实时穿透 + 非活跃暂存

关键设计：**不是等 Agent 全部跑完再发射，而是按 Plan 顺序指定一个"活跃 Agent"，它的事件实时穿透，其他 Agent 的事件暂存 buffer。**

```
                    ┌─────────────┐
  Agent A ──并行──→ │             │
  Agent B ──并行──→ │ ADK Workflow │  执行层：保持并行，不改
  Agent C ──并行──→ │             │
                    └──────┬──────┘
                           │ Event stream (可能交织)
                           ▼
             ┌──────────────────────────────┐
             │   StreamSequentializer       │  ← 新增
             │                              │
             │   active = plan.subtasks[0]  │
             │                              │
             │   event.inv == active?       │
             │     YES → yield 实时穿透 ─────→ SSE（用户看到实时流式）
             │     NO  → buffers[inv].push  │  暂存，不发射
             │                              │
             │   active 发 message_end?     │
             │     active = next subtask    │  切换活跃 Agent
             │     if buffer 已有数据:      │
             │       回放 buffer 中的事件   │  快速/瞬间输出
             │     else:                    │
             │       后续事件实时穿透       │  继续流式体验
             └──────────────┬───────────────┘
                            │ 顺序化后的 SSE
                            ▼
                     ┌──────────────┐
                     │   前端        │  只需处理一个流式消息
                     └──────────────┘
```

**举例**（3 个 Agent，Plan 顺序 A→B→C，各跑 30s，B 先跑完）：

```
时间 →
Agent A:  ████████████████████████████████         (30s)
Agent B:      ██████████████████                    (20s, 先跑完)
Agent C:  ████████████████████████████████████████   (40s, 最慢)

SSE 输出:
  [0-30s]  A 实时流式穿透     ← 用户看到 A 一个字一个字输出
  [30s]    A message_end
  [30s]    B 的 buffer 一次性回放  ← B 早已跑完，事件已在 buffer，瞬间输出
  [30s]    B message_end
  [30-40s] C 实时流式穿透     ← C 还在跑，切换为活跃后继续实时流式
  [40s]    C message_end

总耗时 ~40s = max(各 Agent)，用户体验: 一直有内容输出，无沉默等待
```

| 层 | 修复策略 | 改动量 | 优先级 |
|----|---------|--------|--------|
| **StreamSequentializer** (Backend 新增) | 活跃 Agent 事件实时穿透，其他暂存 buffer；完成时切换 | 新文件 | P0 |
| **ADKToSSETranslator** (Backend) | 接入 Sequentializer | 少量 | P0 |
| **chatStore** (Frontend) | `finalizeStreaming` 防全局杀死 | 1 行 | P1（防御性） |
| **ChatArea + MessageList** (Frontend) | 不改（后端保证单流） | 无 | — |

### 为什么这个方案更好？

| 对比维度 | max_concurrency=1 | 全缓冲后 dump | 活跃穿透 + 暂存 |
|----------|:---:|:---:|:---:|
| 执行性能 | ❌ Σ(各 Agent) | ✅ max(各 Agent) | ✅ max(各 Agent) |
| 流式体验 | ✅ 实时流式 | ❌ 沉默等待→突然全出 | ✅ 实时流式 |
| 输出间隔 | 有（等上一个） | 无（瞬间 dump） | 几乎没有（buffer 回放很快） |
| 前端改动 | 小 | 小 | 小 |
| 架构侵入 | 改执行引擎 | 加输出管道 | 加输出管道 |

---

## 3. Backend 修改清单

### 3.1 新增: StreamSequentializer（活跃穿透 + 暂存切换）

**新文件**: `backend/app/services/adk/stream_sequentializer.py`

**核心算法**:

```
对于每个到达的 ADK Event:
  1. 如果 event 属于当前 active agent → 立即 yield（实时穿透）
  2. 如果 event 属于其他 agent → 追加到 buffer（暂存）
  3. 如果 active agent 发出了 message_end:
     a. active 切换到 plan 中的下一个 subtask
     b. 如果新 active 的 buffer 已有事件 → 回放 buffer 中的所有事件（已完成的瞬间输出）
     c. 如果新 active 的 buffer 为空 → 等待其事件到达，然后实时穿透
```

**关键点**:
- **Plan 顺序决定发言顺序**，不是谁先完成谁先说
- **活跃 Agent 实时流式**，用户不会看到沉默
- **已完成的 Agent 瞬间回放**，不会造成等待
- buffer 只存 Event 对象引用，内存开销很小

```python
from collections import deque
from dataclasses import dataclass, field
from typing import AsyncGenerator, Optional

from google.adk.events import Event


@dataclass
class _AgentSlot:
    """Per-agent state in the sequentializer."""
    agent_name: str           # ADK agent name, e.g. "agent_<uuid>"
    buffer: list = field(default_factory=list)
    complete: bool = False
    started: bool = False     # True after first event seen


class StreamSequentializer:
    """Ensures agents emit to SSE one at a time in plan order,
    while allowing parallel execution behind the scenes.

    Active agent → events pass through in real-time.
    Other agents → events are buffered until their turn.
    """

    def __init__(self, agent_order: list[str] | None = None):
        """
        agent_order: ADK agent names in desired emission order.
                     e.g. ["agent_<uuid1>", "agent_<uuid2>"]
                     If None, uses FIFO completion order.
        """
        self._order = agent_order or []
        self._slots: dict[str, _AgentSlot] = {}
        self._active_idx: int = 0

    async def sequentialize(
        self,
        event_stream: AsyncGenerator[Event, None],
    ) -> AsyncGenerator[Event, None]:
        async for event in event_stream:
            if not event:
                continue

            inv_id = getattr(event, "invocation_id", None) or "_global"

            # Lazy-init slot for this invocation
            if inv_id not in self._slots:
                self._slots[inv_id] = _AgentSlot(agent_name=inv_id)

            slot = self._slots[inv_id]
            slot.started = True

            # Check completion
            actions = getattr(event, "actions", None)
            if (getattr(event, "turn_complete", False)
                    or (actions and getattr(actions, "end_of_agent", False))):
                slot.complete = True

            active_name = self._get_active_name()
            if active_name is None:
                # No order specified or first event → become active
                self._active_idx = self._find_idx(inv_id)
                active_name = inv_id

            if inv_id == active_name:
                # Active agent: pass through in real-time
                yield event

                if slot.complete:
                    # Active done → advance and drain next agent's buffer
                    yield []  # signal for _advance_and_drain
                    async for e in self._advance_and_drain():
                        yield e
            else:
                # Non-active: buffer and wait
                slot.buffer.append(event)

        # Drain any remaining complete slots
        async for e in self._drain_remaining():
            yield e

    def _get_active_name(self) -> str | None:
        if self._active_idx < len(self._order):
            return self._order[self._active_idx]
        return None

    def _find_idx(self, name: str) -> int:
        try:
            return self._order.index(name)
        except ValueError:
            return max(0, len(self._order) - 1)

    async def _advance_and_drain(self):
        """Move to the next agent in plan order. If its buffer has events,
        replay them all. Otherwise it will become active for future events."""
        while True:
            self._active_idx += 1
            next_name = self._get_active_name()
            if next_name is None:
                break

            slot = self._slots.get(next_name)
            if slot is None:
                # Agent hasn't started yet → it will become active
                # when its first event arrives (handled in sequentialize)
                break

            if slot.buffer:
                # Replay buffered events
                for event in slot.buffer:
                    yield event
                slot.buffer.clear()

            if slot.complete:
                # Already done → advance to next immediately
                continue
            else:
                # Still running → future events will pass through
                break

    async def _drain_remaining(self):
        """At stream end, drain any slots that were never activated."""
        for name in self._order[self._active_idx:]:
            slot = self._slots.get(name)
            if slot and slot.buffer:
                for event in slot.buffer:
                    yield event
```

### 3.2 构建 agent_order（plan subtask 顺序 → ADK agent name 映射）

在 `_dag_workflow_stream()` 中，从 `plan_obj` 提取 subtask 顺序，映射到 ADK agent name：

```python
# 构建 agent name → plan 顺序映射
# plan_obj.subtasks 的顺序就是 Planner 指定的执行顺序
agent_order = []
for st in plan_obj.subtasks:
    # WorkflowBuilder 创建的 agent name 格式: "agent_<uuid-with-dashes-replaced>"
    agent_name = "agent_" + str(st.agent_id).replace("-", "_")
    agent_order.append(agent_name)

sequentializer = StreamSequentializer(agent_order=agent_order)
event_stream = sequentializer.sequentialize(event_stream)
```

### 3.2 ADKToSSETranslator: 接入 StreamSequentializer

**文件**: `backend/app/services/adapters/adk_to_sse.py`

**改动**: 新增 `sequential` 模式，在 `translate()` 中可选注入 StreamSequentializer。

```python
class ADKToSSETranslator:
    def __init__(self, version: str = "v1", sequential: bool = False) -> None:
        self.version = version
        self.sequential = sequential

    async def translate(
        self,
        event_stream: AsyncGenerator[Event, None],
        conversation_id: str,
    ) -> AsyncGenerator[str, None]:
        # 群聊模式：注入缓冲顺序化层
        if self.sequential:
            from app.services.adk.stream_sequentializer import StreamSequentializer
            sequentializer = StreamSequentializer()
            event_stream = sequentializer.sequentialize(event_stream)

        # 原有 translate 逻辑不变...
        state = _TranslationState()
        async for event in event_stream:
            # ... 保持不变
```

### 3.3 conversations.py: 群聊模式启用 sequential translator

**文件**: `backend/app/api/v1/conversations.py`

**改动**: `_dag_workflow_stream()` 中创建 translator 时传入 `sequential=True`。

```python
# 第 928 行附近，将
translator = ADKToSSETranslator()
# 改为
translator = ADKToSSETranslator(sequential=True)  # 群聊模式：缓冲顺序化
```

同样修改 `_coordinator_stream()` 中的 translator 创建。

### 3.4 (可选增强) 按 Plan 顺序发射

如果需要 Agent 严格按 Planner 指定的顺序发言（而非谁先完成谁先说），可在 StreamSequentializer 中增加排序：

```python
class StreamSequentializer:
    def __init__(self, agent_order: list[str] | None = None):
        """
        agent_order: 期望的 agent invocation 顺序列表。
        如果提供，就绪的 agent 按此顺序出队。
        """
        self._agent_order = agent_order
        # ...

    async def _pick_next(self) -> str | None:
        """从就绪队列中选择下一个要发射的 agent。"""
        if self._agent_order:
            # 按 plan 顺序，选择第一个已就绪的
            for name in self._agent_order:
                if name in self._ready_queue:
                    self._ready_queue.remove(name)
                    return name
        # Fallback: FIFO
        return self._ready_queue.popleft() if self._ready_queue else None
```

**暂时不实现**：FIFO（谁先完成谁先说）更符合群聊自然语义，且实现更简单。

---

## 4. Frontend 修改清单

### 4.1 chatStore: 修复 finalizeStreaming 副作用

**文件**: `agenthub-web/src/stores/chatStore.ts` 第 131-134 行

**改动**: `finalizeStreamingMessage` 不再全局设置 `isStreaming: false`。

```typescript
// 改前
finalizeStreamingMessage: (messageId) =>
    set((s) => {
        const { [messageId]: _, ...rest } = s.streamingContent;
        return { isStreaming: false, streamingContent: rest };  // ❌
    }),

// 改后
finalizeStreamingMessage: (messageId) =>
    set((s) => {
        const { [messageId]: _, ...rest } = s.streamingContent;
        return { 
            isStreaming: Object.keys(rest).length > 0,  // ✅ 有剩余流才保持 true
            streamingContent: rest 
        };
    }),

// 新增：强制停止所有流（用于用户点击停止按钮）
stopAllStreaming: () =>
    set({ isStreaming: false, streamingContent: {} }),
```

虽然 StreamBuffer 保证了后端一次只发一个 Agent，前端不会遇到并行流的情况，但 `finalizeStreaming` 的防御性修复仍是必要的——防止任何边界情况下（如重连、SSE 事件乱序）流式状态被错误清理。

### 4.2 ChatArea: handleStop 使用 stopAllStreaming

**文件**: `agenthub-web/src/components/layout/ChatArea.tsx`

```typescript
const stopAllStreaming = useChatStore((s) => s.stopAllStreaming);

const handleStop = useCallback(() => {
    disconnectRef.current?.();
    stopAllStreaming();  // ✅ 替换原来的 finalizeStreaming(streamMsgIdRef.current)
    streamMsgIdRef.current = null;
    setIsStreaming(false);
    clearAgentStatuses();
    setDagTaskId(null);
    // ...
}, [stopAllStreaming, setIsStreaming, clearAgentStatuses]);
```

### 4.3 （不需要改）ChatArea 和 MessageList

由于后端 StreamSequentializer 保证了：
- 同一时刻只有一个 Agent 的 SSE 事件在传输
- Agent A 的 `message_end` 总是在 Agent B 的 `message_start` 之前到达

前端现有的单 `streamMsgIdRef` 和单 `StreamingMessageBubble` 架构完全够用，**无需修改**。

---

## 5. 修复后的完整流程

```
用户发送群聊消息
  → POST /messages { mode: "auto_orchestrate" }
    → OrchestratorTask(status="planning")
  → SSE Phase 1: planning
    → Planner 生成计划
    → plan_draft + pendingPlan 展示给用户
  → 用户确认计划
    → POST /messages { mode: "confirm_plan" }
  → SSE Phase 2: execution
    ┌─────────────────────────────────────────────────────┐
    │ ADK Workflow (并行，不改)                            │
    │   Agent A ──运行── 完成                             │
    │   Agent B ──────运行────── 完成                     │
    │   Agent C ──运行──────────── 完成                   │
    └──────────────────┬──────────────────────────────────┘
                       │ Events (可能交织)
                       ▼
    ┌──────────────────────────────────────────────────────┐
    │ StreamSequentializer (新增)                          │
    │   Buffer A: [start, tok, tok, ..., end] ← 就绪      │
    │   Buffer B: [start, tok, ..., end]      ← 排队等待  │
    │   Buffer C: [start, tok, ..., end]      ← 排队等待  │
    │                                                      │
    │   发射 Buffer A → 清空 → 发射 Buffer B → 清空 → ... │
    └──────────────────┬───────────────────────────────────┘
                       │ 顺序化 SSE (一次一个 Agent)
                       ▼
    ┌──────────────────────────────────────────────────────┐
    │ 前端 (不改)                                          │
    │   Agent A 气泡: StreamingBubble 流式填充 → 完成     │
    │   Agent B 气泡: StreamingBubble 流式填充 → 完成     │
    │   Agent C 气泡: StreamingBubble 流式填充 → 完成     │
    │   Orchestrator 汇总                                  │
    └──────────────────────────────────────────────────────┘
```

---

## 6. 验证检查点

- [ ] 群聊模式下 3 个无依赖 Agent 并行执行，SSE 输出按完成顺序依次发射
- [ ] 每个 Agent 的输出在独立的聊天气泡中正确显示，不交织
- [ ] Agent 1 的 `message_end` 先于 Agent 2 的 `message_start`
- [ ] 各 Agent 的执行耗时接近 `max(各 Agent)` 而非 `Σ(各 Agent)`（证明并行执行未被破坏）
- [ ] 停止按钮可正确终止当前执行
- [ ] 单聊模式不受影响（`sequential=False`）
- [ ] Coordinator 模式同样受益（通过 3.3 的修改）
- [ ] 重连场景下 `isStreaming` 状态正确

---

## 7. 依赖与风险

| 依赖/风险 | 说明 | 缓解措施 |
|-----------|------|----------|
| ADK Event 的 `invocation_id` | StreamSequentializer 依赖每个事件携带正确的 `invocation_id` | 测试确认 ADK 2.0 的 Event 对象有此属性（`adk_to_sse.py` 已在用） |
| 大 buffer 内存 | 若 Agent 输出极长（>10K tokens），buffer 中持有完整事件列表可能占内存 | 可优化为只 buffer token 文本而非完整 Event 对象 |
| Agent 执行失败 | 失败的 Agent 是否会永远不发 `turn_complete`，导致 buffer 永不就绪？ | StreamSequentializer 需要超时机制：超过 N 秒无新事件，标记当前 buffer 为 complete |
| Coordinator 模式 | Coordinator 不是固定 agent 列表，invocation 可能动态产生 | Coordinator 也是逐轮调用 agent 的，天然顺序，Sequentializer 影响不大 |
| Events 乱序 | `_drain` 发射时 events 的顺序与原始到达顺序一致（list 追加），不会乱序 | 已验证 |

---

## 8. 涉及文件清单

### Backend (3 个文件修改 + 1 个新文件)

| # | 文件 | 改动 | 影响范围 |
|---|------|------|----------|
| **1** | **`backend/app/services/adk/stream_sequentializer.py`** | **新增**: StreamSequentializer 类 | 新模块 |
| 2 | `backend/app/services/adapters/adk_to_sse.py` | `__init__` 新增 `sequential` 参数；`translate()` 注入 Sequentializer | 小 |
| 3 | `backend/app/api/v1/conversations.py` | `_dag_workflow_stream()` 和 `_coordinator_stream()` 中 `ADKToSSETranslator(sequential=True)` | 1 行 × 2 处 |
| 4 | `backend/app/services/adk/workflow_builder.py` | **不改**（保持并行执行） | 无 |

### Frontend (2 个文件修改)

| # | 文件 | 改动 | 影响范围 |
|---|------|------|----------|
| 5 | `agenthub-web/src/stores/chatStore.ts` | `finalizeStreamingMessage` 修复 + 新增 `stopAllStreaming` | 小 |
| 6 | `agenthub-web/src/components/layout/ChatArea.tsx` | `handleStop` 改用 `stopAllStreaming` | 1 行 |

### 不需要改的文件（之前错误列出的）

- ~~`WorkflowBuilder`~~ — 保持并行，不改
- ~~`Planner`~~ — 不改 prompt，保持自然 DAG
- ~~`MessageList`~~ — 单气泡够用
- ~~`types/chat.ts`~~ — 不需要动

---

## 9. 与原方案的对比

| 维度 | 原方案 (max_concurrency=1) | 新方案 (StreamSequentializer) |
|------|---------------------------|-------------------------------|
| 执行层 | ❌ 强制串行 | ✅ 保持并行 |
| 总耗时 | 3 个 Agent 各 30s → 90s | 3 个 Agent 各 30s → ~30s |
| 输出顺序 | 按 plan 顺序 | 按完成顺序（谁先做完谁先说） |
| 改动范围 | 大（执行引擎 + 前端 + Planner） | 小（仅加 buffer 层 + 防御性修复） |
| 回滚风险 | 高（影响执行语义） | 低（仅影响输出管道，可开关） |
| 前端复杂度 | 需要多流追踪 | 无需修改 |
