import { useState, useCallback } from "react";
import { toast } from "sonner";
import { DiffEditor } from "@monaco-editor/react";
import type { InfiniteData } from "@tanstack/react-query";
import type { Artifact, DiffArtifactContent, ConflictEntry, MessageListData, CodeArtifactContent } from "@/types";
import { getArtifactContent } from "@/types";
import { useResizable } from "@/hooks/useResizable";
import { useBlobDownload } from "@/hooks/useBlobDownload";
import { fileApi, messageApi } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import { useChatStore } from "@/stores/chatStore";
import { queryClient } from "@/lib/queryClient";
import { findApplyTarget, type CodeCandidate } from "@/lib/diffApply";
import { ConflictResolver } from "./ConflictResolver";

/**
 * Collect every code card in the active conversation from the messages cache,
 * newest-first, as candidates for "apply diff back to source". Read via the
 * queryClient singleton (not a hook) so this works from a card buried deep in
 * the message tree — same pattern as CodeCard's write-back.
 */
function gatherCodeCandidates(convId: string): CodeCandidate[] {
  const data = queryClient.getQueryData<InfiniteData<MessageListData>>(["messages", convId]);
  if (!data) return [];
  const out: CodeCandidate[] = [];
  for (const page of data.pages) {
    for (const msg of page.items) {
      for (const a of msg.artifacts ?? []) {
        if (a.artifactType !== "code") continue;
        const cc = a.content as unknown as CodeArtifactContent;
        out.push({
          id: a.id,
          fileName: cc.fileName,
          language: cc.language,
          code: cc.code ?? "",
          persistable: !a.id.startsWith("fallback-"),
        });
      }
    }
  }
  return out;
}

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

  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  // Apply this diff back onto the source code card it was derived from.
  // Candidates are every code card currently in the conversation cache; the
  // diff carries no source id, so diffApply matches by file name + snippet.
  const handleApply = useCallback(async () => {
    const convId = useChatStore.getState().activeConversationId;
    if (!convId) {
      toast.error("无法定位会话");
      return;
    }

    // The messages cache is newest-first (backend ORDER BY created_at DESC),
    // so gatherCodeCandidates yields newest-first — the most recent matching
    // code card wins when several could match.
    const candidates = gatherCodeCandidates(convId);

    const result = findApplyTarget(
      { fileName: c.fileName, oldCode: c.oldCode, newCode: c.newCode },
      candidates,
    );

    if ("error" in result) {
      toast.error(
        result.error === "no-candidates"
          ? "会话中没有可应用的代码卡"
          : "未找到匹配的源代码卡（文件名/片段都对不上），可手动复制改后代码",
      );
      return;
    }

    if (!result.target.persistable) {
      toast.error("源代码卡是临时解析卡（无法写库），请手动复制改后代码");
      return;
    }

    setApplying(true);
    try {
      await messageApi.updateArtifact(result.target.id, {
        ...(result.target.fileName ? { fileName: result.target.fileName } : {}),
        ...(result.target.language ? { language: result.target.language } : {}),
        code: result.newFullCode,
      });
      queryClient.invalidateQueries({ queryKey: ["messages", convId] });
      setApplied(true);
      const where = result.target.fileName ? `「${result.target.fileName}」` : "源代码卡";
      toast.success(`已应用到${where}（追加为新版本）`);
    } catch {
      toast.error("应用失败");
    } finally {
      setApplying(false);
    }
  }, [c.fileName, c.oldCode, c.newCode]);

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
          onClick={handleApply}
          disabled={applying || applied}
          title="把改动写回会话里匹配的源代码卡（追加新版本）"
          style={{
            fontSize: 11, background: "none", border: "none",
            color: applied ? "var(--color-success)" : "var(--color-primary)",
            cursor: applying || applied ? "default" : "pointer", fontWeight: 600,
          }}
        >
          {applying ? "应用中…" : applied ? "✓ 已应用" : "应用到源文件"}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || saved}
          title="把改后代码作为新文件保存/下载"
          style={{
            fontSize: 11, background: "none", border: "none",
            color: saved ? "var(--color-success)" : "var(--color-text-tertiary)",
            cursor: saving || saved ? "default" : "pointer", fontWeight: 600,
          }}
        >
          {saving ? "保存中…" : saved ? "✓ 已保存" : "另存为文件"}
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
