export interface AgentProgress {
  agentId: string;
  agentName: string;
  status: "queued" | "running" | "success" | "failed" | "timeout";
  progress: number;
}

interface AgentProgressBarProps {
  agents: AgentProgress[];
}

const statusColors: Record<AgentProgress["status"], string> = {
  queued: "bg-gray-300",
  running: "bg-blue-400",
  success: "bg-emerald-500",
  failed: "bg-red-500",
  timeout: "bg-yellow-500",
};

const statusLabels: Record<AgentProgress["status"], string> = {
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
            <div
              className={`w-2 h-2 rounded-full ${statusColors[a.status]} ${a.status === "running" ? "animate-pulse" : ""}`}
            />
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
