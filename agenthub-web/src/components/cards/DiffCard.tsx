import { useRef, useEffect } from "react";
import type { Artifact, DiffArtifactContent } from "@/types";
import { computeDiff, countDiffStats } from "@/lib/diff";
import { useResizable } from "@/hooks/useResizable";

interface DiffCardProps {
  artifact: Artifact;
}

const PANE_MIN = 140;
const DEFAULT_HEIGHT = 320;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function DiffCard({ artifact }: DiffCardProps) {
  const c = artifact.content as unknown as DiffArtifactContent;
  const diff = computeDiff(c.oldCode, c.newCode);
  const stats = countDiffStats(diff);

  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({
    minW: 420, minH: 200,
    defaultHeight: DEFAULT_HEIGHT,
  });

  const leftLines = diff
    .filter((d) => d.type !== "add")
    .map((d) => ({ type: d.type as "del" | "ctx", ln: d.oldLn!, text: d.text }));

  const rightLines = diff
    .filter((d) => d.type !== "del")
    .map((d) => ({ type: d.type as "add" | "ctx", ln: d.newLn!, text: d.text }));

  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const divider = dividerRef.current;
    const left = leftPaneRef.current;
    const right = rightPaneRef.current;
    if (!divider || !left || !right) return;

    let dragging = false;
    let sx = 0;
    let sw0 = 0;
    let sw1 = 0;

    const onDown = (e: MouseEvent) => {
      e.preventDefault();
      dragging = true;
      sx = e.clientX;
      sw0 = left.getBoundingClientRect().width;
      sw1 = right.getBoundingClientRect().width;
    };

    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - sx;
      const total = sw0 + sw1;
      const w0 = clamp(sw0 + dx, PANE_MIN, total - PANE_MIN);
      const w1 = total - w0;
      left.style.flex = "none";
      left.style.width = (w0 / total) * 100 + "%";
      right.style.flex = "none";
      right.style.width = (w1 / total) * 100 + "%";
    };

    const onUp = () => { dragging = false; };

    divider.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      divider.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div ref={cardRef} className="artifact-card diff-card" style={{ height: DEFAULT_HEIGHT, minWidth: 420 }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "9px 16px", borderBottom: "1px solid var(--color-card-border)",
          flexShrink: 0, background: "var(--color-bg-elevated)",
        }}
      >
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, color: "var(--color-text-tertiary)" }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>
        </svg>
        <span style={{ fontFamily: "monospace", fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>
          {c.fileName || "diff"}
        </span>
        {c.language && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: "1.5px 7px", borderRadius: 10, background: "rgba(51,112,255,0.1)", color: "var(--color-primary)", textTransform: "uppercase" }}>
            {c.language}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--color-success)" }}>+{stats.added}</span>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 11, margin: "0 1px" }}>/</span>
        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--color-danger)" }}>−{stats.removed}</span>
        <span ref={sizeLabelRef} className="artifact-card__size-label">{"100% × " + DEFAULT_HEIGHT}</span>
        <button className="artifact-card__reset" onClick={resetSize} title="恢复默认大小">
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </button>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative", background: "var(--color-bg-elevated)" }}>
        <div ref={leftPaneRef} className="diff-card-pane" style={{ flex: 1, minWidth: PANE_MIN, overflow: "auto", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6, background: "var(--color-bg-elevated)" }}>
          {leftLines.map((line, i) => (
            <div key={i} style={{
              display: "flex",
              background: line.type === "del" ? "rgba(213,73,65,0.1)" : undefined,
              boxShadow: line.type === "del" ? "inset 3px 0 0 var(--color-danger)" : undefined,
            }}>
              <div style={{ display: "flex", flexShrink: 0, alignItems: "center", width: 56, paddingRight: 8, userSelect: "none", fontSize: 10.5, color: "var(--color-text-tertiary)", background: line.type === "del" ? "rgba(213,73,65,0.16)" : undefined }}>
                <span style={{ width: 32, textAlign: "right", opacity: 0.5 }}>{line.ln}</span>
                <span style={{ width: 16, textAlign: "center", fontWeight: 700, fontSize: 11, color: line.type === "del" ? "var(--color-danger)" : undefined, opacity: line.type === "ctx" ? 0.3 : undefined }}>
                  {line.type === "del" ? "−" : " "}
                </span>
              </div>
              <span style={{ flex: 1, whiteSpace: "pre", paddingRight: 16, overflowWrap: "anywhere", color: line.type === "del" ? "var(--color-danger)" : "var(--color-text-secondary)" }}>
                {line.text}
              </span>
            </div>
          ))}
        </div>

        <div ref={dividerRef} className="diff-card-divider"
          style={{ flexShrink: 0, width: 8, cursor: "col-resize", background: "var(--color-card-border)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s ease", position: "relative", zIndex: 10 }}>
          <div className="diff-card-divider-dots" style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center", opacity: 0, transition: "opacity 0.12s ease", pointerEvents: "none" }}>
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#fff" }} />
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#fff" }} />
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#fff" }} />
          </div>
        </div>

        <div ref={rightPaneRef} className="diff-card-pane" style={{ flex: 1, minWidth: PANE_MIN, overflow: "auto", fontFamily: "monospace", fontSize: 12, lineHeight: 1.6, background: "var(--color-bg-elevated)" }}>
          {rightLines.map((line, i) => (
            <div key={i} style={{
              display: "flex",
              background: line.type === "add" ? "rgba(0,168,112,0.1)" : undefined,
              boxShadow: line.type === "add" ? "inset 3px 0 0 var(--color-success)" : undefined,
            }}>
              <div style={{ display: "flex", flexShrink: 0, alignItems: "center", width: 56, paddingRight: 8, userSelect: "none", fontSize: 10.5, color: "var(--color-text-tertiary)", background: line.type === "add" ? "rgba(0,168,112,0.16)" : undefined }}>
                <span style={{ width: 32, textAlign: "right", opacity: 0.5 }}>{line.ln}</span>
                <span style={{ width: 16, textAlign: "center", fontWeight: 700, fontSize: 11, color: line.type === "add" ? "var(--color-success)" : undefined, opacity: line.type === "ctx" ? 0.3 : undefined }}>
                  {line.type === "add" ? "+" : " "}
                </span>
              </div>
              <span style={{ flex: 1, whiteSpace: "pre", paddingRight: 16, overflowWrap: "anywhere", color: line.type === "add" ? "var(--color-success)" : "var(--color-text-secondary)" }}>
                {line.text}
              </span>
            </div>
          ))}
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
