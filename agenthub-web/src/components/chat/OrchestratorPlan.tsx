import type { PlanSubtask } from "@/types";

interface OrchestratorPlanProps {
  planId: string;
  subtasks: PlanSubtask[];
  plannerAgentName?: string | null;
  onConfirm?: () => void;
  onAdjust?: (subtasks: PlanSubtask[]) => void;
  onRefine?: (feedback: string) => void;
}

export function OrchestratorPlan({
  planId,
  subtasks,
  plannerAgentName,
  onConfirm,
  onAdjust,
  onRefine,
}: OrchestratorPlanProps) {
  if (subtasks.length === 0) return null;

  const planBy = plannerAgentName
    ? `由 @${plannerAgentName} 制定`
    : "由系统自动制定";

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    } else {
      window.dispatchEvent(new CustomEvent("orchestrator-confirm", { detail: { planId, subtasks } }));
    }
  };

  const handleAdjust = () => {
    if (onAdjust) {
      onAdjust(subtasks);
    } else {
      window.dispatchEvent(new CustomEvent("orchestrator-adjust", { detail: { subtasks } }));
    }
  };

  return (
    <div style={{ padding: "8px 16px" }}>
      <div style={{
        border: "1px solid var(--color-border-light)",
        background: "var(--color-bg-elevated)",
        borderRadius: "var(--radius-lg)",
        padding: 16,
        maxWidth: "75%",
        margin: "0 auto",
        boxShadow: "var(--shadow-card)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>
            执行计划
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 10 }}>
          {planBy} · {subtasks.length} 个子任务
          <span style={{ marginLeft: 8, color: "var(--color-primary)" }}>
            {plannerAgentName ? "→ DAG 模式执行" : "→ Coordinator 模式执行"}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {subtasks.map((task, i) => (
            <div key={`${planId}-${i}`} style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "var(--font-size-xs)",
              color: "var(--color-text-secondary)",
              background: "var(--color-bg-hover)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 10px",
            }}>
              <span style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "var(--color-primary)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {i + 1}
              </span>
              <span style={{ flex: 1 }}>{task.instruction}</span>
              <span style={{ color: "var(--color-primary)", flexShrink: 0, fontWeight: 500 }}>
                @{task.agent.name}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={handleAdjust}
            style={{
              border: "1px solid var(--color-border-medium)",
              borderRadius: "var(--radius-sm)",
              background: "transparent",
              padding: "4px 12px",
              fontSize: "var(--font-size-xs)",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            调整分派
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              border: "none",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-primary)",
              padding: "4px 12px",
              fontSize: "var(--font-size-xs)",
              color: "#fff",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            确认执行
          </button>
        </div>
      </div>
    </div>
  );
}
