import { Spin, Button } from "@douyinfe/semi-ui";
import { IconTickCircle, IconClear } from "@douyinfe/semi-icons";
import type { Artifact, DeployStatusArtifactContent } from "@/types";
import { useResizable } from "@/hooks/useResizable";

interface DeployStatusCardProps {
  artifact: Artifact;
}

const DEFAULT_HEIGHT = 160;

export function DeployStatusCard({ artifact }: DeployStatusCardProps) {
  const c = artifact.content as unknown as DeployStatusArtifactContent;
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({ defaultHeight: DEFAULT_HEIGHT });

  const statusConfig = {
    building: { icon: <Spin size="small" />, text: "构建中...", badge: "构建中", badgeColor: "orange" as const, iconColor: undefined },
    deployed: { icon: <IconTickCircle style={{ color: "var(--color-success)" }} />, text: "部署成功", badge: "已部署", badgeColor: "green" as const, iconColor: undefined },
    failed: { icon: <IconClear style={{ color: "var(--color-danger)" }} />, text: "部署失败", badge: "失败", badgeColor: "red" as const, iconColor: undefined },
  };

  const cfg = statusConfig[c.status] ?? statusConfig.building;

  return (
    <div ref={cardRef} className="artifact-card" style={{ height: DEFAULT_HEIGHT }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderBottom: "1px solid var(--color-card-border)",
          flexShrink: 0, background: "var(--color-bg-elevated)",
        }}
      >
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, color: "var(--color-text-tertiary)" }}>
          <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3"/>
        </svg>
        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>
          部署状态
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "1.5px 7px", borderRadius: 10, textTransform: "uppercase",
          background: cfg.badgeColor === "green" ? "rgba(31,191,117,0.1)" : cfg.badgeColor === "red" ? "rgba(245,79,79,0.1)" : "rgba(240,160,48,0.1)",
          color: cfg.badgeColor === "green" ? "var(--color-success)" : cfg.badgeColor === "red" ? "var(--color-danger)" : "var(--color-warning)",
        }}>
          {cfg.badge}
        </span>
        <div style={{ flex: 1 }} />
        <span ref={sizeLabelRef} className="artifact-card__size-label" />
        <button className="artifact-card__reset" onClick={resetSize} title="恢复默认大小">
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </button>
      </div>

      <div className="artifact-card__body" style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: 20, gap: 6, textAlign: "center" as const,
      }}>
        <div style={{ fontSize: 28, lineHeight: 1 }}>{cfg.icon}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{cfg.text}</div>
        {c.url && (
          <Button theme="borderless" size="small" onClick={() => window.open(c.url, "_blank", "noopener,noreferrer")}
            style={{ fontSize: 10, color: "var(--color-primary)" }}>
            {c.url}
          </Button>
        )}
      </div>

      <div ref={resizeRef} className="artifact-card__resize" title="拖拽调整大小">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
          <line x1={19} y1={5} x2={5} y2={19}/><line x1={19} y1={11} x2={11} y2={19}/><line x1={19} y1={17} x2={17} y2={19}/>
        </svg>
      </div>
    </div>
  );
}
