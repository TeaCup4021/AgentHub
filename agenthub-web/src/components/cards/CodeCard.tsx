import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { Artifact, CodeArtifactContent } from "@/types";
import { HighlightedCode } from "@/components/chat/HighlightedCode";
import { MonacoCodeEditor } from "@/components/editor/MonacoCodeEditor";
import { useResizable } from "@/hooks/useResizable";
import { useChatStore } from "@/stores/chatStore";
import { messageApi } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

interface CodeCardProps {
  artifact: Artifact;
}

const DEFAULT_HEIGHT = 260;

/** A floating "quote this snippet" affordance positioned over the selection. */
interface SnippetSelection {
  snippet: string;
  top: number;
  left: number;
}

export function CodeCard({ artifact }: CodeCardProps) {
  const c = artifact.content as unknown as CodeArtifactContent;
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({ defaultHeight: DEFAULT_HEIGHT });
  const [editing, setEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(c.code);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SnippetSelection | null>(null);

  // Fallback cards (parsed client-side from message text) have synthetic ids
  // and no DB row, so they can only be downloaded, not persisted.
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
    // No DB row to write back to — degrade to local download.
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
      await messageApi.updateArtifact(artifact.id, { ...c, code });
      const convId = useChatStore.getState().activeConversationId;
      if (convId) {
        queryClient.invalidateQueries({ queryKey: ["messages", convId] });
      }
      setEditing(false);
      toast.success("已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }, [artifact.id, c, isPersistable, downloadCode]);

  const handleCancel = useCallback(() => {
    setEditedCode(c.code);
    setEditing(false);
  }, [c.code]);

  // Capture a text selection inside the read-only code view and surface a
  // floating "quote this snippet" button positioned just above the selection.
  const handleSelect = useCallback(() => {
    if (editing) return;
    const sel = window.getSelection();
    const body = bodyRef.current;
    if (!sel || sel.isCollapsed || !body) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    // Only react to selections that live inside this card's code body.
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
            <button onClick={handleCancel} disabled={saving} style={{ fontSize: 11, background: "none", border: "none", color: "var(--color-text-tertiary)", cursor: saving ? "default" : "pointer" }}>取消</button>
            {isPersistable && (
              <button onClick={() => downloadCode(editedCode)} disabled={saving} style={{ fontSize: 11, background: "none", border: "none", color: "var(--color-text-tertiary)", cursor: saving ? "default" : "pointer" }}>下载</button>
            )}
            <button onClick={() => handleSave(editedCode)} disabled={saving} style={{ fontSize: 11, background: "none", border: "none", color: "var(--color-primary)", cursor: saving ? "default" : "pointer", fontWeight: 600 }}>
              {saving ? "保存中…" : isPersistable ? "保存" : "下载"}
            </button>
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

      <div
        ref={bodyRef}
        className="artifact-card__body"
        style={{ flex: 1, minHeight: 0, position: "relative" }}
        onMouseUp={handleSelect}
      >
        {editing ? (
          <MonacoCodeEditor code={editedCode} language={c.language} fileName={c.fileName} onChange={(v) => setEditedCode(v ?? "")} onSave={handleSave} />
        ) : (
          <HighlightedCode code={c.code} language={c.language} showHeader={false} />
        )}
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
  );
}
