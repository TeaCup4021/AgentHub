import type { AgentProgress } from "./AgentProgressBar";

// TODO: fields for backend integration once delegation chain data is available:
// - delegationLevel: 0 = direct execution, 1+ = delegated
// - parentAgentId: parent agent in delegation chain
// - taskDescription: human-readable task summary
// - tokensUsed: token consumption for this agent
// - startedAt / elapsedMs: execution timing

export interface AgentDetail extends AgentProgress {
  taskDescription?: string;
  delegationLevel?: number;
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
  queued: "排队中",
  running: "执行中",
  success: "已完成",
  failed: "失败",
  timeout: "超时",
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
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-700">
          Agent 仪表盘 ({agents.length} 个 Agent)
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-sm leading-none"
        >
          ✕
        </button>
      </div>

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
              {agent.delegationLevel != null && agent.delegationLevel > 0 && (
                <span className="text-gray-300 text-xs">└</span>
              )}

              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-[10px] font-bold text-white">
                {agent.agentName.charAt(0)}
              </div>

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
