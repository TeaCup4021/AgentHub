import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Artifact, CodeArtifactContent } from "@/types";
import { HighlightedCode } from "@/components/chat/HighlightedCode";
import { MonacoCodeEditor } from "@/components/editor/MonacoCodeEditor";
import { useResizable } from "@/hooks/useResizable";
import { artifactApi } from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { VersionSelector } from "./VersionSelector";
import { FullscreenModal } from "./FullscreenModal";

interface CodeCardProps {
  artifact: Artifact;
  convId?: string;
}

const DEFAULT_HEIGHT = 260;

interface SnippetSelection {
  snippet: string;
  top: number;
  left: number;
}

export function CodeCard({ artifact, convId }: CodeCardProps) {
  const queryClient = useQueryClient();
  const [currentArtifact, setCurrentArtifact] = useState(artifact);
  const [editing, setEditing] = useState(false);
  const [editedCode, setEditedCode] = useState((currentArtifact.content as unknown as CodeArtifactContent).code);
  const [fullscreen, setFullscreen] = useState(false);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SnippetSelection | null>(null);

  useEffect(() => {
    setCurrentArtifact(artifact);
    setEditedCode((artifact.content as unknown as CodeArtifactContent).code);
  }, [artifact.id, artifact.version]);

  const c = currentArtifact.content as unknown as CodeArtifactContent;
  const mergeKey = (currentArtifact.content as Record<string, unknown>)._mergeKey as string | undefined;
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({ defaultHeight: DEFAULT_HEIGHT });

  const isPersistable = !artifact.id.startsWith("fallback-");

  const downloadCode = useCallback((code: string) => {
    const fileName = c.fileName || `code.${c.language || "txt"}`;
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [c.fileName, c.language]);

  const handleSave = useCallback(async (code: string) => {
    if (!isPersistable) {
      try {
        downloadCode(code);
        setEditing(false);
        toast.success(`已下载到 ${c.fileName || "文件"}`);
      } catch {
        toast.error("下载失败");
      }
      return;
    }

    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  }, [convId, currentArtifact, mergeKey, queryClient, isPersistable, downloadCode, c.fileName]);

  const handleDownload = useCallback(() => {
    downloadCode(c.code);
    toast.success(`已下载 ${c.fileName || "文件"}`);
  }, [c.fileName, c.code, downloadCode]);

  const handleCancel = useCallback(() => {
    setEditedCode(c.code);
    setEditing(false);
  }, [c.code]);

  const handleSelect = useCallback(() => {
    if (editing) return;
    const sel = window.getSelection();
    const body = bodyRef.current;
    if (!sel || sel.isCollapsed || !body) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!body.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    const snippet = sel.toString();
    if (!snippet.trim()) {
      setSelection(null);
      return;
    }
    const rangeRect = range.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    setSelection({
      snippet,
      top: rangeRect.top - bodyRect.top,
      left: Math.max(0, rangeRect.left - bodyRect.left + rangeRect.width / 2),
    });
  }, [editing]);

  const handleQuoteSnippet = useCallback(() => {
    if (!selection) return;
    useChatStore.getState().setPendingQuote({
      messageId: artifact.id,
      content: selection.snippet,
      codeRange: {
        fileName: c.fileName,
        language: c.language,
        snippet: selection.snippet,
      },
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    toast.success("已引用代码片段，在输入框中描述修改");
  }, [selection, artifact.id, c.fileName, c.language]);

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
              <button onClick={handleCancel} disabled={saving} style={{ fontSize: 11, background: "none", border: "none", color: "var(--color-text-tertiary)", cursor: saving ? "default" : "pointer" }}>取消</button>
              {isPersistable && (
                <button onClick={() => downloadCode(editedCode)} disabled={saving} style={{ fontSize: 11, background: "none", border: "none", color: "var(--color-text-tertiary)", cursor: saving ? "default" : "pointer" }}>下载</button>
              )}
              <button onClick={() => handleSave(editedCode)} disabled={saving} style={{ fontSize: 11, background: "none", border: "none", color: "var(--color-primary)", cursor: saving ? "default" : "pointer", fontWeight: 600 }}>
                {saving ? "保存中…" : isPersistable ? "保存" : "下载"}
              </button>
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

        <div
          ref={bodyRef}
          className="artifact-card__body"
          style={{ flex: 1, minHeight: 0, position: "relative" }}
          onMouseUp={handleSelect}
        >
          {codeContent}
          {selection && !editing && (
            <button
              onMouseDown={(e) => { e.preventDefault(); handleQuoteSnippet(); }}
              style={{
                position: "absolute",
                top: Math.max(0, selection.top - 30),
                left: selection.left,
                transform: "translateX(-50%)",
                zIndex: 10,
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: 6,
                border: "none", cursor: "pointer", whiteSpace: "nowrap",
                fontSize: 11, fontWeight: 600,
                background: "var(--color-primary)", color: "#fff",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21c3 0 7-1 7-8V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3M14 21c3 0 7-1 7-8V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3"/>
              </svg>
              引用此片段修改
            </button>
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
