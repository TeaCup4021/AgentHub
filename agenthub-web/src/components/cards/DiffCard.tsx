import { useState, useCallback } from "react";
import { toast } from "sonner";
import { DiffEditor } from "@monaco-editor/react";
import type { Artifact, DiffArtifactContent, ConflictEntry } from "@/types";
import { getArtifactContent } from "@/types";
import { useResizable } from "@/hooks/useResizable";
import { useBlobDownload } from "@/hooks/useBlobDownload";
import { fileApi } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import { ConflictResolver } from "./ConflictResolver";

interface DiffCardProps {
  artifact: Artifact;
}

const DEFAULT_HEIGHT = 340;

export function DiffCard({ artifact }: DiffCardProps) {
  const c = getArtifactContent<DiffArtifactContent>(artifact);
  const [splitView, setSplitView] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictEntry[] | null>(null);
  const { downloadUrl } = useBlobDownload();
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({
    minW: 420, minH: 200,
    defaultHeight: DEFAULT_HEIGHT,
  });

  const added = c.newCode.split("\n").length;
  const removed = c.oldCode.split("\n").length;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fileApi.applyDiff({
        fileName: c.fileName || "modified.txt",
        code: c.newCode,
        language: c.language || "text",
      });
      const { downloadUrl: url } = res.data.data;
      await downloadUrl(url, c.fileName || "modified.txt");
      setSaved(true);
      toast.success("文件已保存");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { conflicts?: ConflictEntry[] } } };
      if (axiosErr?.response?.status === 409 && axiosErr.response.data?.conflicts) {
        setConflicts(axiosErr.response.data.conflicts);
      } else {
        toast.error("保存失败");
      }
    } finally {
      setSaving(false);
    }
  }, [c.fileName, c.newCode, c.language, downloadUrl]);

  const themeSetting = useUIStore((s) => s.theme);
  const isDark = themeSetting === "system"
    ? typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches
    : themeSetting === "dark";

  if (conflicts) {
    return (
      <div ref={cardRef} className="artifact-card diff-card" style={{ height: DEFAULT_HEIGHT, minWidth: 420 }}>
        <ConflictResolver
          fileName={c.fileName || ""}
          conflicts={conflicts}
          onResolve={() => { toast.success("冲突已解决"); setConflicts(null); }}
          onCancel={() => setConflicts(null)}
        />
      </div>
    );
  }

  return (
    <div ref={cardRef} className="artifact-card diff-card" style={{ height: DEFAULT_HEIGHT, minWidth: 420 }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "9px 16px", borderBottom: "1px solid var(--color-card-border)",
          flexShrink: 0, background: "var(--color-bg-elevated)",
        }}
      >
        <span style={{ fontFamily: "monospace", fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>
          {c.fileName || "diff"}
        </span>
        {c.language && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: "1.5px 7px", borderRadius: 10, background: "rgba(51,112,255,0.1)", color: "var(--color-primary)", textTransform: "uppercase" }}>
            {c.language}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--color-success)" }}>+{added}</span>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 11, margin: "0 1px" }}>/</span>
        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--color-danger)" }}>−{removed}</span>
        <button
          onClick={() => setSplitView(!splitView)}
          style={{ fontSize: 11, background: "none", border: "none", color: "var(--color-text-tertiary)", cursor: "pointer", marginLeft: 8 }}
        >
          {splitView ? "统一" : "并排"}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || saved}
          style={{
            fontSize: 11, background: "none", border: "none",
            color: saved ? "var(--color-success)" : "var(--color-primary)",
            cursor: saving || saved ? "default" : "pointer", fontWeight: 600,
          }}
        >
          {saving ? "保存中…" : saved ? "✓ 已保存" : "保存文件"}
        </button>
        <span ref={sizeLabelRef} className="artifact-card__size-label" />
        <button className="artifact-card__reset" onClick={resetSize} title="恢复默认大小">
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </button>
      </div>

      <div className="artifact-card__body" style={{ flex: 1, minHeight: 0 }}>
        <DiffEditor
          key={`${artifact.id}-${splitView ? "split" : "unified"}`}
          height="100%"
          original={c.oldCode}
          modified={c.newCode}
          language={c.language || "text"}
          theme={isDark ? "vs-dark" : "vs"}
          options={{
            renderSideBySide: splitView,
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: "on",
            padding: { top: 8 },
          }}
          keepCurrentOriginalModel={true}
          keepCurrentModifiedModel={true}
        />
      </div>

      <div ref={resizeRef} className="artifact-card__resize" title="拖拽调整大小">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
          <line x1={19} y1={5} x2={5} y2={19}/><line x1={19} y1={11} x2={11} y2={19}/><line x1={19} y1={17} x2={17} y2={19}/>
        </svg>
      </div>
    </div>
  );
}
