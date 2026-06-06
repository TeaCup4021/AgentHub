import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Artifact, CodeArtifactContent } from "@/types";
import { HighlightedCode } from "@/components/chat/HighlightedCode";
import { MonacoCodeEditor } from "@/components/editor/MonacoCodeEditor";
import { useResizable } from "@/hooks/useResizable";
import { artifactApi } from "@/lib/api";
import { VersionSelector } from "./VersionSelector";
import { FullscreenModal } from "./FullscreenModal";

interface CodeCardProps {
  artifact: Artifact;
  convId?: string;
}

const DEFAULT_HEIGHT = 260;

export function CodeCard({ artifact, convId }: CodeCardProps) {
  const queryClient = useQueryClient();
  const [currentArtifact, setCurrentArtifact] = useState(artifact);
  const [editing, setEditing] = useState(false);
  const [editedCode, setEditedCode] = useState((currentArtifact.content as unknown as CodeArtifactContent).code);
  const [fullscreen, setFullscreen] = useState(false);
  const c = currentArtifact.content as unknown as CodeArtifactContent;
  const mergeKey = (currentArtifact.content as Record<string, unknown>)._mergeKey as string | undefined;
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({ defaultHeight: DEFAULT_HEIGHT });

  const handleSave = useCallback(async (code: string) => {
    try {
      const res = await artifactApi.updateContent(convId || "", currentArtifact.id, {
        ...currentArtifact.content,
        code,
      });
      const updated = res.data.data.artifact;
      setCurrentArtifact(updated);
      setEditedCode(code);
      setEditing(false);
      if (mergeKey) {
        queryClient.invalidateQueries({ queryKey: ["artifact-versions", convId, mergeKey] });
      }
      toast.success("已保存为新版本");
    } catch {
      toast.error("保存失败");
    }
  }, [convId, currentArtifact, mergeKey, queryClient]);

  const handleDownload = useCallback(() => {
    const fileName = c.fileName || `code.${c.language || "txt"}`;
    const blob = new Blob([c.code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`已下载 ${fileName}`);
  }, [c.fileName, c.language, c.code]);

  const handleCancel = useCallback(() => {
    setEditedCode(c.code);
    setEditing(false);
  }, [c.code]);

  const codeContent = editing ? (
    <MonacoCodeEditor
      code={editedCode}
      language={c.language}
      fileName={c.fileName}
      onChange={(v) => setEditedCode(v ?? "")}
      onSave={handleSave}
    />
  ) : (
    <HighlightedCode code={c.code} language={c.language} showHeader={false} />
  );

  return (
    <>
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
              lineHeight: "13px", display: "inline-block",
            }}>
              {c.language}
            </span>
          )}
          {mergeKey && convId && !editing && (
            <VersionSelector
              convId={convId}
              mergeKey={mergeKey}
              currentVersion={currentArtifact.version}
              onVersionChange={(a) => { setCurrentArtifact(a); setEditedCode((a.content as unknown as CodeArtifactContent).code); }}
            />
          )}
          <div style={{ flex: 1 }} />
          {editing ? (
            <>
              <button onClick={handleCancel} style={{ fontSize: 11, background: "none", border: "none", color: "var(--color-text-tertiary)", cursor: "pointer" }}>取消</button>
              <button onClick={() => handleSave(editedCode)} style={{ fontSize: 11, background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontWeight: 600 }}>保存</button>
            </>
          ) : (
            <>
              <button className="artifact-card__reset" onClick={() => { setEditedCode(c.code); setEditing(true); }} title="编辑">
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                </svg>
              </button>
              <button className="artifact-card__reset" onClick={handleDownload} title="下载文件">
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              <button className="artifact-card__reset" onClick={() => setFullscreen(true)} title="全屏查看">
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                </svg>
              </button>
              <button className="artifact-card__reset" onClick={resetSize} title="恢复默认大小">
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>
              </button>
              <span ref={sizeLabelRef} className="artifact-card__size-label" />
            </>
          )}
        </div>

        <div className="artifact-card__body" style={{ flex: 1, minHeight: 0 }}>
          {codeContent}
        </div>

        {!editing && (
          <div ref={resizeRef} className="artifact-card__resize" title="拖拽调整大小">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
              <line x1={19} y1={5} x2={5} y2={19}/><line x1={19} y1={11} x2={11} y2={19}/><line x1={19} y1={17} x2={17} y2={19}/>
            </svg>
          </div>
        )}
      </div>

      <FullscreenModal
        visible={fullscreen}
        onClose={() => setFullscreen(false)}
        title={c.fileName || "code"}
      >
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          {codeContent}
        </div>
      </FullscreenModal>
    </>
  );
}
