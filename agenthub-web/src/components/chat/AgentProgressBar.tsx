export interface AgentProgress {
  agentId: string;
  agentName: string;
  status: "queued" | "running" | "success" | "failed" | "timeout";
  progress: number;
}

interface AgentProgressBarProps {
  agents: AgentProgress[];
}

const statusColor: Record<AgentProgress["status"], string> = {
  queued: "var(--color-text-disabled)",
  running: "var(--color-status-running)",
  success: "var(--color-success)",
  failed: "var(--color-danger)",
  timeout: "var(--color-warning)",
};

const statusLabel: Record<AgentProgress["status"], string> = {
  queued: "等待中",
  running: "执行中",
  success: "完成",
  failed: "失败",
  timeout: "超时",
};

export function AgentProgressBar({ agents }: AgentProgressBarProps) {
  if (agents.length === 0) return null;

  return (
    <div style={{
      height: 28,
      display: "flex",
      alignItems: "center",
      gap: 4,
      padding: "0 16px",
      background: "var(--color-bg-elevated)",
      borderBottom: "1px solid var(--color-border-light)",
      fontSize: "var(--font-size-xs)",
      overflowX: "auto",
    }}>
      {agents.map((a, i) => (
        <div key={a.agentId} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: statusColor[a.status],
            animation: a.status === "running" ? "pulse 1.5s infinite" : undefined,
          }} />
          <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{a.agentName}</span>
          <span style={{ color: "var(--color-text-tertiary)" }}>{statusLabel[a.status]}</span>
          {a.status === "running" && (
            <span style={{ color: "var(--color-primary)", marginLeft: 2 }}>{a.progress}%</span>
          )}
          {i < agents.length - 1 && (
            <span style={{ color: "var(--color-text-disabled)", margin: "0 4px" }}>→</span>
          )}
        </div>
      ))}
    </div>
  );
}
