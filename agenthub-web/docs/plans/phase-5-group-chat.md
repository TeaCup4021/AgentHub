## Phase 5: P0 群聊 + Orchestrator

### Task 5.1: 创建 OrchestratorPlan 卡片

**Files:**
- Create: `src/components/chat/OrchestratorPlan.tsx`

- [ ] **Step 1: 创建计划展示卡片**

```typescript
// src/components/chat/OrchestratorPlan.tsx

interface SubTask {
  agentId: string;
  agentName: string;
  instruction: string;
}

interface OrchestratorPlanProps {
  planId: string;
  subtasks: SubTask[];
  onConfirm: () => void;
  onAdjust: (subtasks: SubTask[]) => void;
}

export function OrchestratorPlan({ planId, subtasks, onConfirm, onAdjust }: OrchestratorPlanProps) {
  return (
    <div className="px-4 py-3">
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 max-w-[75%] mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span className="text-sm font-semibold text-purple-800">Orchestrator 任务拆解</span>
        </div>

        <div className="space-y-2">
          {subtasks.map((task, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-purple-700 bg-white rounded px-3 py-2">
              <span className="w-5 h-5 rounded-full bg-purple-200 text-purple-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                {i + 1}
              </span>
              <span className="flex-1">{task.instruction}</span>
              <span className="text-purple-500 shrink-0">@{task.agentName}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={() => onAdjust(subtasks)}
            className="rounded-md px-3 py-1 text-xs text-purple-600 hover:bg-purple-100"
          >
            调整分派
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-purple-600 px-3 py-1 text-xs text-white hover:bg-purple-700"
          >
            确认执行
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 5.2: 创建 AgentProgressBar

**Files:**
- Create: `src/components/chat/AgentProgressBar.tsx`

- [ ] **Step 1: 创建进度条组件**

```typescript
// src/components/chat/AgentProgressBar.tsx

export interface AgentProgress {
  agentId: string;
  agentName: string;
  status: "queued" | "running" | "success" | "failed" | "timeout";
  progress: number; // 0-100
}

interface AgentProgressBarProps {
  agents: AgentProgress[];
}

const statusColors: Record<string, string> = {
  queued: "bg-gray-200",
  running: "bg-blue-400",
  success: "bg-emerald-500",
  failed: "bg-red-500",
  timeout: "bg-yellow-500",
};

const statusLabels: Record<string, string> = {
  queued: "等待中",
  running: "执行中",
  success: "完成",
  failed: "失败",
  timeout: "超时",
};

export function AgentProgressBar({ agents }: AgentProgressBarProps) {
  if (agents.length === 0) return null;
  return (
    <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
      <div className="flex items-center gap-4 overflow-x-auto">
        {agents.map((a) => (
          <div key={a.agentId} className="flex items-center gap-1.5 text-xs shrink-0">
            <div className={`w-2 h-2 rounded-full ${statusColors[a.status]} ${a.status === "running" ? "animate-pulse" : ""}`} />
            <span className="font-medium text-gray-700">{a.agentName}</span>
            <span className="text-gray-500">{statusLabels[a.status]}</span>
            {a.status === "running" && (
              <span className="text-blue-600">{a.progress}%</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### Task 5.3: 扩展 ChatArea 支持群聊 Orchestrator 流程

**Files:**
- Modify: `src/components/layout/ChatArea.tsx`

- [ ] **Step 1: 添加 agentStatuses 状态和群聊 SSE 处理**

在 ChatArea.tsx 中添加 import：

```typescript
import { useState } from "react";
import { AgentProgressBar } from "@/components/chat/AgentProgressBar";
import type { AgentProgress } from "@/components/chat/AgentProgressBar";
```

在组件内添加状态：

```typescript
const [agentStatuses, setAgentStatuses] = useState<AgentProgress[]>([]);
```

修改 `handleSend` 以支持群聊的 `auto_orchestrate` 模式：

```typescript
// 根据对话类型自动选择 mode
const msgMode = conversation?.type === "group" ? "auto_orchestrate" : "direct";
await messageApi.send(activeId, { content, mode: msgMode });
```

在 SSE 回调中添加 `onAgentStatus`：

```typescript
onAgentStatus: (data) => {
  setAgentStatuses((prev) => {
    const idx = prev.findIndex((p) => p.agentId === data.agent.id);
    const entry: AgentProgress = {
      agentId: data.agent.id,
      agentName: data.agent.name,
      status: data.status,
      progress: data.progress,
    };
    if (idx >= 0) {
      const updated = [...prev];
      updated[idx] = entry;
      return updated;
    }
    return [...prev, entry];
  });
},
```

在 `onMessageEnd` 回调中，全部完成时清空进度条：

```typescript
onMessageEnd: (data) => {
  // ... 现有的 finalizeStreaming 逻辑 ...
  setAgentStatuses((prev) => {
    if (prev.every((a) => a.status === "success" || a.status === "failed")) {
      return [];
    }
    return prev;
  });
},
```

在 JSX 的 ChatHeader 和 MessageList 之间插入进度条：

```typescript
{conversation.type === "group" && (
  <AgentProgressBar agents={agentStatuses} />
)}
```

- [ ] **Step 2: 验证编译通过**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 5.4: 提交 Phase 5

```bash
git add agenthub-web/src/components/chat/OrchestratorPlan.tsx agenthub-web/src/components/chat/AgentProgressBar.tsx agenthub-web/src/components/layout/ChatArea.tsx
git commit -m "feat: Phase 5 — 群聊 Orchestrator 流程
- OrchestratorPlan 任务拆解展示卡片
- AgentProgressBar 多Agent状态进度条
- ChatArea 集成 agent_status SSE 事件
- 群聊模式自动发送 auto_orchestrate"
```
