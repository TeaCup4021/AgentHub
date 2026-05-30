import type { SummaryResult } from "@/types";

interface OrchestratorSummaryProps {
  total: number;
  success: number;
  failed: number;
  results: SummaryResult[];
}

export function OrchestratorSummary({ total, success, failed, results }: OrchestratorSummaryProps) {
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: failed > 0 ? "var(--color-warning)" : "var(--color-success)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
          }}>
            {failed > 0 ? "!" : "✓"}
          </span>
          <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>
            任务执行完毕
          </span>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)" }}>
            {success}/{total} 成功{failed > 0 && `，${failed} 失败`}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {results.map((r) => (
            <div key={r.subtask_id} style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "var(--font-size-xs)",
              padding: "4px 0",
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: r.status === "success" ? "var(--color-success)" : "var(--color-danger)",
                flexShrink: 0,
              }} />
              <span style={{ color: "var(--color-text-secondary)", flex: 1 }}>
                {r.subtask_id}
              </span>
              <span style={{
                color: r.status === "success" ? "var(--color-success)" : "var(--color-danger)",
                fontWeight: 500,
              }}>
                {r.status === "success" ? "完成" : "失败"}
              </span>
              {r.error && (
                <span style={{ color: "var(--color-text-tertiary)" }}>{r.error}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
