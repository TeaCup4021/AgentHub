import { useState, useCallback } from "react";
import { Modal } from "@douyinfe/semi-ui";
import type { Artifact, PreviewArtifactContent } from "@/types";
import { useResizable } from "@/hooks/useResizable";

interface PreviewCardProps {
  artifact: Artifact;
}

const DEFAULT_HEIGHT = 260;

export function PreviewCard({ artifact }: PreviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const c = artifact.content as unknown as PreviewArtifactContent;
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({ defaultHeight: DEFAULT_HEIGHT });

  const openFullscreen = useCallback(() => setExpanded(true), []);

  return (
    <>
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
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>
          </svg>
          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>
            {c.title || "预览"}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1.5px 7px", borderRadius: 10,
            background: "rgba(158,158,173,0.1)", color: "var(--color-text-secondary)", textTransform: "uppercase",
          }}>
            {c.previewType}
          </span>
          <div style={{ flex: 1 }} />
          <span ref={sizeLabelRef} className="artifact-card__size-label" />
          <button className="artifact-card__reset" onClick={resetSize} title="恢复默认大小">
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
          </button>
          <button className="artifact-card__reset" onClick={openFullscreen} title="全屏查看">
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </button>
        </div>

        <div className="artifact-card__body" style={{ flex: 1, minHeight: 0, background: "#fff" }}>
          <iframe
            src={c.url}
            title={c.title || "preview"}
            style={{ width: "100%", height: "100%", border: "none" }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>

        <div ref={resizeRef} className="artifact-card__resize" title="拖拽调整大小">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
            <line x1={19} y1={5} x2={5} y2={19}/><line x1={19} y1={11} x2={11} y2={19}/><line x1={19} y1={17} x2={17} y2={19}/>
          </svg>
        </div>
      </div>

      <Modal
        visible={expanded}
        fullScreen
        onCancel={() => setExpanded(false)}
        footer={null}
        title={c.title || "全屏预览"}
        bodyStyle={{ padding: 0, height: "calc(100% - 48px)" }}
      >
        <iframe
          src={c.url}
          title={c.title || "preview"}
          style={{ width: "100%", height: "100%", border: "none" }}
          sandbox="allow-scripts allow-same-origin"
        />
      </Modal>
    </>
  );
}
