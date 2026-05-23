## Phase 8: P2 Agent 仪表盘 (AgentDashboard)

> 源自 OpenAkita 的 Agent 状态仪表盘。在 AgentProgressBar 基础上，增加可展开的详细面板，展示每个 Agent 的运行状态、委派链和 token 消耗。

### Task 8.1: 创建 AgentDashboard 组件

**Files:**
- Create: `src/components/chat/AgentDashboard.tsx`

- [ ] **Step 1: 创建 AgentDashboard 组件**

```typescript
// src/components/chat/AgentDashboard.tsx
import type { AgentProgress } from "./AgentProgressBar";

export interface AgentDetail extends AgentProgress {
  taskDescription?: string;
  delegationLevel?: number;  // 0=直接执行, 1=一级委派...
  parentAgentId?: string;
  tokensUsed?: number;
  startedAt?: string;
  elapsedMs?: number;
}

interface AgentDashboardProps {
  agents: AgentDetail[];
  open: boolean;
  onClose: () => void;
}

const statusLabels: Record<string, string> = {
  queued: "排队中", running: "执行中", success: "已完成",
  failed: "失败", timeout: "超时",
};

const statusColors: Record<string, string> = {
  queued: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  timeout: "bg-yellow-100 text-yellow-700",
};

function formatElapsed(ms?: number): string {
  if (!ms) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function AgentDashboard({ agents, open, onClose }: AgentDashboardProps) {
  if (!open) return null;

  return (
    <div className="border-b border-gray-200 bg-white shadow-sm">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-700">
          Agent 仪表盘 ({agents.length} 个 Agent)
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ✕
        </button>
      </div>

      {/* Agent 列表 */}
      <div className="max-h-64 overflow-y-auto">
        {agents.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gray-400">
            暂无活跃 Agent
          </p>
        ) : (
          agents.map((agent) => (
            <div
              key={agent.agentId}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors"
              style={{ paddingLeft: `${12 + (agent.delegationLevel || 0) * 16}px` }}
            >
              {/* 委派层级指示线 */}
              {agent.delegationLevel != null && agent.delegationLevel > 0 && (
                <span className="text-gray-300 text-xs">└</span>
              )}

              {/* Agent 头像 */}
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-[10px] font-bold text-white">
                {agent.agentName.charAt(0)}
              </div>

              {/* 信息区 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-800 truncate">
                    {agent.agentName}
                  </span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${statusColors[agent.status]}`}>
                    {statusLabels[agent.status]}
                  </span>
                </div>
                {agent.taskDescription && (
                  <p className="text-[10px] text-gray-500 truncate mt-0.5">
                    {agent.taskDescription}
                  </p>
                )}
              </div>

              {/* 指标区 */}
              <div className="flex items-center gap-3 shrink-0 text-[10px] text-gray-400">
                {agent.status === "running" && agent.progress > 0 && (
                  <span className="text-blue-600 font-medium">{agent.progress}%</span>
                )}
                {agent.tokensUsed != null && (
                  <span>{agent.tokensUsed} tk</span>
                )}
                {agent.elapsedMs != null && (
                  <span>{formatElapsed(agent.elapsedMs)}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

---

### Task 8.2: 创建 dashboardStore

**Files:**
- Create: `src/stores/dashboardStore.ts`

- [ ] **Step 1: 创建 dashboardStore 管理仪表盘状态**

```typescript
// src/stores/dashboardStore.ts
import { create } from "zustand";
import type { AgentProgress } from "@/components/chat/AgentProgressBar";

interface DashboardState {
  dashboardOpen: boolean;
  setDashboardOpen: (open: boolean) => void;
  toggleDashboard: () => void;

  agentStatuses: AgentProgress[];
  updateAgentStatus: (status: AgentProgress) => void;
  clearStatuses: () => void;
  allDone: () => boolean;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboardOpen: false,
  setDashboardOpen: (open) => set({ dashboardOpen: open }),
  toggleDashboard: () => set((s) => ({ dashboardOpen: !s.dashboardOpen })),

  agentStatuses: [],
  updateAgentStatus: (status) =>
    set((s) => {
      const idx = s.agentStatuses.findIndex((a) => a.agentId === status.agentId);
      if (idx >= 0) {
        const updated = [...s.agentStatuses];
        updated[idx] = status;
        return { agentStatuses: updated };
      }
      return { agentStatuses: [...s.agentStatuses, status] };
    }),
  clearStatuses: () => set({ agentStatuses: [] }),
  allDone: () =>
    get().agentStatuses.every(
      (a) => a.status === "success" || a.status === "failed" || a.status === "timeout"
    ),
}));
```

---

### Task 8.3: 重构 ChatArea — 从 agentStatuses useState 迁移到 dashboardStore

**Files:**
- Modify: `src/components/layout/ChatArea.tsx`

- [ ] **Step 1: 替换本地 useState → dashboardStore**

```typescript
// 移除:
// const [agentStatuses, setAgentStatuses] = useState<AgentProgress[]>([]);

// 改为:
import { useDashboardStore } from "@/stores/dashboardStore";

const agentStatuses = useDashboardStore((s) => s.agentStatuses);
const updateAgentStatus = useDashboardStore((s) => s.updateAgentStatus);
const clearStatuses = useDashboardStore((s) => s.clearStatuses);

// 在 onAgentStatus 回调中:
onAgentStatus: (data) => {
  updateAgentStatus({
    agentId: data.agent.id,
    agentName: data.agent.name,
    status: data.status as AgentProgress["status"],
    progress: data.progress,
  });
},

// 在 onMessageEnd / onError 回调中全部完成时:
// clearStatuses() 替代原来的 setAgentStatuses([])
```

- [ ] **Step 2: 在 JSX 中添加 AgentDashboard**

```typescript
import { AgentDashboard } from "@/components/chat/AgentDashboard";

const dashboardOpen = useDashboardStore((s) => s.dashboardOpen);
const toggleDashboard = useDashboardStore((s) => s.toggleDashboard);

// 在 AgentProgressBar 下方插入:
{conversation.type === "group" && (
  <>
    {/* 点击进度条可展开/收起仪表盘 */}
    <div onClick={toggleDashboard} className="cursor-pointer">
      <AgentProgressBar agents={agentStatuses} />
    </div>
    <AgentDashboard
      agents={agentStatuses}
      open={dashboardOpen}
      onClose={() => setDashboardOpen(false)}
    />
  </>
)}
```

---

### Task 8.4: 验证编译

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 8.5: 提交 Phase 8

```bash
git add agenthub-web/src/components/chat/AgentDashboard.tsx \
        agenthub-web/src/stores/dashboardStore.ts \
        agenthub-web/src/components/layout/ChatArea.tsx
git commit -m "feat: Phase 8 — Agent 仪表盘 (AgentDashboard)
- AgentDashboard 组件: 可展开面板展示 Agent 详情
- 支持委派层级缩进展示 (最多 5 层)
- dashboardStore: 集中管理 AgentStatuses + 展开/收起状态
- AgentProgressBar 点击展开仪表盘
- ChatArea 从 useState 迁移至 dashboardStore

源自 OpenAkita 的 Agent 状态仪表盘设计"
```
