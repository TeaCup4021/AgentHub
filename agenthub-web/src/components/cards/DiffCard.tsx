import { Card, Tag } from "@douyinfe/semi-ui";
import type { Artifact, DiffArtifactContent } from "@/types";

interface DiffCardProps {
  artifact: Artifact;
}

export function DiffCard({ artifact }: DiffCardProps) {
  const c = artifact.content as unknown as DiffArtifactContent;
  return (
    <Card
      style={{ margin: "8px 0", overflow: "hidden" }}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-primary)" }}>
            {c.fileName || "diff"}
          </span>
          {c.language && <Tag size="small" color="grey">{c.language}</Tag>}
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, fontSize: "var(--font-size-sm)" }}>
        <div style={{
          background: "rgba(245, 63, 63, 0.06)",
          padding: "8px 12px",
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          color: "var(--color-text-primary)",
        }}>
          <div style={{ marginBottom: 4, fontSize: "var(--font-size-xs)", color: "var(--color-danger)", fontWeight: 600 }}>
            旧版本
          </div>
          {c.oldCode}
        </div>
        <div style={{
          background: "rgba(0, 181, 120, 0.06)",
          padding: "8px 12px",
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          color: "var(--color-text-primary)",
        }}>
          <div style={{ marginBottom: 4, fontSize: "var(--font-size-xs)", color: "var(--color-success)", fontWeight: 600 }}>
            新版本
          </div>
          {c.newCode}
        </div>
      </div>
    </Card>
  );
}
