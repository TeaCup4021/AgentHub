import { IconDownload, IconFile } from "@douyinfe/semi-icons";
import { formatFileSize } from "@/lib/utils";
import type { Artifact, FileArtifactContent } from "@/types";
import { useResizable } from "@/hooks/useResizable";

interface FileCardProps {
  artifact: Artifact;
}

const DEFAULT_HEIGHT = 160;

export function FileCard({ artifact }: FileCardProps) {
  const c = artifact.content as unknown as FileArtifactContent;
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({ defaultHeight: DEFAULT_HEIGHT });

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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>
        </svg>
        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>
          下载文件
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

      <div className="artifact-card__body" style={{ flex: 1, display: "flex", alignItems: "center", gap: 14, padding: "16px 18px" }}>
        <a
          href={c.fileUrl}
          download
          style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none", color: "inherit", flex: 1, minWidth: 0 }}
        >
          <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 8, background: "rgba(51,112,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IconFile style={{ fontSize: 20, color: "var(--color-primary)" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
              {c.fileName}
            </p>
            <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 2, margin: "2px 0 0 0" }}>
              {formatFileSize(c.fileSize)} · {c.fileType}
            </p>
          </div>
        </a>
        <a
          href={c.fileUrl}
          download
          style={{
            flexShrink: 0, padding: "6px 14px", borderRadius: 6,
            border: "1px solid var(--color-card-border)", background: "var(--color-bg-elevated)",
            color: "var(--color-text-secondary)", cursor: "pointer",
            fontSize: 11, fontWeight: 600, textDecoration: "none",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.color = "var(--color-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-card-border)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
        >
          <IconDownload style={{ marginRight: 4, verticalAlign: "middle" }} />
          下载
        </a>
      </div>

      <div ref={resizeRef} className="artifact-card__resize" title="拖拽调整大小">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
          <line x1={19} y1={5} x2={5} y2={19}/><line x1={19} y1={11} x2={11} y2={19}/><line x1={19} y1={17} x2={17} y2={19}/>
        </svg>
      </div>
    </div>
  );
}
