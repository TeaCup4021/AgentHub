import { useState, useCallback } from "react";
import { toast } from "sonner";
import type { Artifact, CodeArtifactContent } from "@/types";
import { HighlightedCode } from "@/components/chat/HighlightedCode";
import { MonacoCodeEditor } from "@/components/editor/MonacoCodeEditor";
import { useResizable } from "@/hooks/useResizable";
import { fileApi } from "@/lib/api";

interface CodeCardProps {
  artifact: Artifact;
}

const DEFAULT_HEIGHT = 260;

export function CodeCard({ artifact }: CodeCardProps) {
  const c = artifact.content as unknown as CodeArtifactContent;
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({ defaultHeight: DEFAULT_HEIGHT });
  const [editing, setEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(c.code);

  const handleSave = useCallback(async (code: string) => {
    try {
      await fileApi.updateContent(artifact.id, code);
      toast.success("已保存");
      setEditing(false);
    } catch {
      toast.error("保存失败");
    }
  }, [artifact.id]);

  const handleCancel = useCallback(() => {
    setEditedCode(c.code);
    setEditing(false);
  }, [c.code]);

  return (
    <div ref={cardRef} className="artifact-card artifact-card-code" style={{ height: editing ? "auto" : DEFAULT_HEIGHT }}>
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
          {c.fileName || "code"}
        </span>
        {c.language && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1.5px 7px", borderRadius: 10,
            background: "rgba(51,112,255,0.1)", color: "var(--color-primary)", textTransform: "uppercase",
          }}>
            {c.language}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {editing ? (
          <>
            <button onClick={handleCancel} style={{ fontSize: 11, background: "none", border: "none", color: "var(--color-text-tertiary)", cursor: "pointer" }}>取消</button>
            <button onClick={() => handleSave(editedCode)} style={{ fontSize: 11, background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontWeight: 600 }}>保存</button>
          </>
        ) : (
          <button onClick={() => { setEditedCode(c.code); setEditing(true); }} style={{ fontSize: 11, background: "none", border: "none", color: "var(--color-text-tertiary)", cursor: "pointer" }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -2, marginRight: 3 }}>
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
            编辑
          </button>
        )}
        <span ref={sizeLabelRef} className="artifact-card__size-label" />
        {!editing && (
          <button className="artifact-card__reset" onClick={resetSize} title="恢复默认大小">
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
          </button>
        )}
      </div>

      <div className="artifact-card__body" style={{ flex: 1, minHeight: 0 }}>
        {editing ? (
          <MonacoCodeEditor code={editedCode} language={c.language} fileName={c.fileName} onChange={(v) => setEditedCode(v ?? "")} onSave={handleSave} />
        ) : (
          <HighlightedCode code={c.code} language={c.language} showHeader={false} />
        )}
      </div>

      {!editing && (
        <div ref={resizeRef} className="artifact-card__resize" title="拖拽调整大小">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
            <line x1={19} y1={5} x2={5} y2={19}/><line x1={19} y1={11} x2={11} y2={19}/><line x1={19} y1={17} x2={17} y2={19}/>
          </svg>
        </div>
      )}
    </div>
  );
}
