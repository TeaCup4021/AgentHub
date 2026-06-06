import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { artifactApi } from "@/lib/api";
import type { Artifact } from "@/types";

interface VersionSelectorProps {
  convId: string;
  mergeKey: string;
  currentVersion: number;
  onVersionChange: (artifact: Artifact) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
}

const badgeStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, padding: "1.5px 7px", borderRadius: 10,
  background: "rgba(51,112,255,0.1)", color: "var(--color-primary)",
  textTransform: "uppercase", lineHeight: "13px", display: "inline-block",
};

export function VersionSelector({ convId, mergeKey, currentVersion, onVersionChange }: VersionSelectorProps) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["artifact-versions", convId, mergeKey],
    queryFn: async () => {
      const res = await artifactApi.getVersions(convId, mergeKey);
      return res.data.data;
    },
  });

  if (!data || data.total <= 1) {
    return <span style={badgeStyle}>v{currentVersion}</span>;
  }

  const versions = data.list;

  return (
    <span style={{ position: "relative" }}>
      <span
        style={{ ...badgeStyle, cursor: "pointer" }}
        onClick={() => setOpen(!open)}
      >
        v{currentVersion} ▾
      </span>
      {open && (
        <>
          <span
            style={{ position: "fixed", inset: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          <span style={{
            position: "absolute", top: "100%", left: 0, marginTop: 2, zIndex: 100,
            minWidth: 140, background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-card-border)", borderRadius: 8,
            boxShadow: "var(--shadow-lg)", overflow: "hidden",
          }}>
            {versions.map((v) => (
              <span
                key={v.id}
                onClick={() => {
                  const selected = v as Artifact;
                  selected.artifactType = (selected.content.artifactType as Artifact["artifactType"]) || "code";
                  selected.title = (selected.content.title as string) || "";
                  onVersionChange(selected);
                  setOpen(false);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                  fontSize: 11, fontFamily: "monospace", cursor: "pointer",
                  color: v.version === currentVersion ? "var(--color-primary)" : "var(--color-text-primary)",
                  background: v.version === currentVersion ? "rgba(51,112,255,0.06)" : "transparent",
                  borderBottom: "1px solid var(--color-card-border)",
                }}
                onMouseEnter={(e) => {
                  if (v.version !== currentVersion) e.currentTarget.style.background = "var(--color-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (v.version !== currentVersion) e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ fontWeight: 600 }}>v{v.version}</span>
                <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
                  {formatTime(v.createdAt)}
                </span>
              </span>
            ))}
          </span>
        </>
      )}
    </span>
  );
}
