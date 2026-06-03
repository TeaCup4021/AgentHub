import type { Artifact, LinkPreviewArtifactContent } from "@/types";
import { useResizable } from "@/hooks/useResizable";

interface LinkPreviewCardProps {
  artifact: Artifact;
}

const DEFAULT_HEIGHT = 140;

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function LinkPreviewCard({ artifact }: LinkPreviewCardProps) {
  const c = artifact.content as unknown as LinkPreviewArtifactContent;
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({ defaultHeight: DEFAULT_HEIGHT });
  const hostname = getHostname(c.url);
  const hasOgData = !!c.title || !!c.description || !!c.image;
  const isInternal = hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.startsWith("172.16.");
  const faviconSrc = c.favicon || (isInternal ? "" : `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`);

  const handleClick = () => {
    window.open(c.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div ref={cardRef} className="artifact-card" style={{ height: DEFAULT_HEIGHT, cursor: "pointer" }} onClick={handleClick}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderBottom: "1px solid var(--color-card-border)",
          flexShrink: 0, background: "var(--color-bg-elevated)",
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, color: "var(--color-text-tertiary)" }}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        <span style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-tertiary)" }}>
          {hostname}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "1.5px 7px", borderRadius: 10,
          background: "rgba(51,112,255,0.1)", color: "var(--color-primary)",
        }}>
          链接
        </span>
        <div style={{ flex: 1 }} />
        <span ref={sizeLabelRef} className="artifact-card__size-label" />
        <button className="artifact-card__reset" onClick={(e) => { e.stopPropagation(); resetSize(); }} title="恢复默认大小">
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </button>
      </div>

      <div className="artifact-card__body" style={{
        flex: 1, display: "flex", gap: 12, padding: "10px 14px",
        alignItems: "center", minHeight: 0,
      }}>
        {c.image && (
          <img
            src={c.image}
            alt=""
            style={{
              width: 100, height: 64, objectFit: "cover",
              borderRadius: "var(--radius-sm)", flexShrink: 0,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasOgData ? (
            <>
              {c.title && (
                <p style={{
                  fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0,
                }}>
                  {c.title}
                </p>
              )}
              {c.description && (
                <p style={{
                  fontSize: 10, color: "var(--color-text-tertiary)",
                  overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  margin: "2px 0 0 0", lineHeight: 1.4,
                }}>
                  {c.description}
                </p>
              )}
            </>
          ) : (
            <p style={{
              fontSize: 12, color: "var(--color-text-secondary)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0,
            }}>
              {c.url}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
            {faviconSrc ? (
              <img
                src={faviconSrc}
                alt=""
                style={{ width: 14, height: 14, flexShrink: 0 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : null}
            <span style={{ fontSize: 10, color: "var(--color-text-disabled)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.siteName || hostname}
            </span>
          </div>
        </div>
      </div>

      <div ref={resizeRef} className="artifact-card__resize" title="拖拽调整大小">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
          <line x1={19} y1={5} x2={5} y2={19}/><line x1={19} y1={11} x2={11} y2={19}/><line x1={19} y1={17} x2={17} y2={19}/>
        </svg>
      </div>
    </div>
  );
}
