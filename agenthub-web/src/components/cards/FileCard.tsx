import type { Artifact, FileArtifactContent } from "@/types";
import { useResizable } from "@/hooks/useResizable";
import { useBlobDownload } from "@/hooks/useBlobDownload";
import { formatFileSize } from "@/lib/utils";

interface FileCardProps {
  artifact: Artifact;
}

const DEFAULT_HEIGHT = 180;

const FILE_ICON_COLORS: Record<string, { bg: string; fg: string }> = {
  pdf: { bg: "rgba(213,73,65,0.1)", fg: "#d54941" },
  zip: { bg: "rgba(140,100,60,0.1)", fg: "#8c643c" },
  gzip: { bg: "rgba(140,100,60,0.1)", fg: "#8c643c" },
  xlsx: { bg: "rgba(31,191,117,0.1)", fg: "#1fbf75" },
  xls: { bg: "rgba(31,191,117,0.1)", fg: "#1fbf75" },
  csv: { bg: "rgba(31,191,117,0.1)", fg: "#1fbf75" },
  pptx: { bg: "rgba(240,140,48,0.1)", fg: "#f08c30" },
  ppt: { bg: "rgba(240,140,48,0.1)", fg: "#f08c30" },
  docx: { bg: "rgba(51,112,255,0.1)", fg: "#3370ff" },
  doc: { bg: "rgba(51,112,255,0.1)", fg: "#3370ff" },
};

function getFileExt(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function getFileIconColor(fileName: string) {
  return FILE_ICON_COLORS[getFileExt(fileName)] ?? { bg: "rgba(51,112,255,0.1)", fg: "var(--color-primary)" };
}

function isImage(mimeType: string) {
  return mimeType?.startsWith("image/");
}

export function FileCard({ artifact }: FileCardProps) {
  const c = artifact.content as unknown as FileArtifactContent & { code?: string };
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({ defaultHeight: DEFAULT_HEIGHT });
  const { downloadUrl } = useBlobDownload();
  const { download: downloadBlob } = useBlobDownload();
  const iconColor = getFileIconColor(c.fileName);

  const handleDownload = () => {
    if (c.fileUrl) {
      downloadUrl(c.fileUrl, c.fileName);
    } else if (c.code) {
      downloadBlob(c.code, c.fileName, c.fileType || "text/plain");
    }
  };

  return (
    <div ref={cardRef} className="artifact-card" style={{ height: DEFAULT_HEIGHT }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderBottom: "1px solid var(--color-card-border)",
          flexShrink: 0, background: "var(--color-bg-elevated)",
        }}
      >
        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>
          {c.fileName || "文件"}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "1.5px 7px", borderRadius: 10,
          background: iconColor.bg, color: iconColor.fg, textTransform: "uppercase",
        }}>
          {getFileExt(c.fileName) || "FILE"}
        </span>
        <div style={{ flex: 1 }} />
        <span ref={sizeLabelRef} className="artifact-card__size-label" />
        <button className="artifact-card__reset" onClick={resetSize} title="恢复默认大小">
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </button>
      </div>

      <div className="artifact-card__body" style={{ flex: 1, display: "flex", alignItems: "center", gap: 14, padding: "12px 18px" }}>
        {isImage(c.fileType) && c.fileUrl ? (
          <img
            src={c.fileUrl}
            alt={c.fileName}
            style={{
              maxWidth: "100%", maxHeight: 120, objectFit: "contain",
              borderRadius: "var(--radius-sm)", cursor: "pointer",
            }}
            onClick={handleDownload}
          />
        ) : c.fileUrl || c.code ? (
          <>
            <div style={{
              flexShrink: 0, width: 40, height: 40, borderRadius: 8,
              background: iconColor.bg, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: iconColor.fg,
            }}>
              {getFileExt(c.fileName).slice(0, 4).toUpperCase() || "FILE"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
                {c.fileName}
              </p>
              <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: "2px 0 0 0" }}>
                {(c.fileSize ?? 0) > 0 ? formatFileSize(c.fileSize) : ""}{c.fileType ? ` · ${c.fileType}` : ""}
              </p>
            </div>
            <button
              onClick={handleDownload}
              style={{
                flexShrink: 0, padding: "5px 12px", borderRadius: 6,
                border: "1px solid var(--color-card-border)", background: "var(--color-bg-elevated)",
                color: "var(--color-primary)", cursor: "pointer",
                fontSize: 11, fontWeight: 600,
              }}
            >
              下载
            </button>
          </>
        ) : (
          <div style={{ textAlign: "center", flex: 1, color: "var(--color-text-tertiary)", fontSize: 12 }}>
            文件暂未生成
          </div>
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
