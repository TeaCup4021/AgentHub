import { useState, useCallback, useMemo } from "react";
import { Tooltip } from "@douyinfe/semi-ui";
import {
  IconDownload,
  IconExpand,
  IconRefresh,
  IconSave,
  IconSourceControl,
  IconTick,
} from "@douyinfe/semi-icons";
import { toast } from "sonner";
import type { InfiniteData } from "@tanstack/react-query";
import type { Artifact, DiffArtifactContent, ConflictEntry, MessageListData, CodeArtifactContent } from "@/types";
import { getArtifactContent } from "@/types";
import { useResizable } from "@/hooks/useResizable";
import { useBlobDownload } from "@/hooks/useBlobDownload";
import { fileApi, messageApi } from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { queryClient } from "@/lib/queryClient";
import { findApplyTarget, resolveDiffDisplay, type CodeCandidate } from "@/lib/diffApply";
import { ConflictResolver } from "./ConflictResolver";
import { FullscreenModal } from "./FullscreenModal";
import { SideBySideDiffViewer, getDiffStats } from "./SideBySideDiffViewer";

function gatherCodeCandidates(convId: string): CodeCandidate[] {
  const data = queryClient.getQueryData<InfiniteData<MessageListData>>(["messages", convId]);
  if (!data) return [];

  const out: CodeCandidate[] = [];
  for (const page of data.pages) {
    for (const msg of page.items) {
      for (const artifact of msg.artifacts ?? []) {
        if (artifact.artifactType !== "code") continue;
        const content = artifact.content as unknown as CodeArtifactContent;
        out.push({
          id: artifact.id,
          fileName: content.fileName,
          language: content.language,
          code: content.code ?? "",
          persistable: !artifact.id.startsWith("fallback-"),
        });
      }
    }
  }

  return out;
}

interface DiffCardProps {
  artifact: Artifact;
}

const DEFAULT_HEIGHT = 380;

export function DiffCard({ artifact }: DiffCardProps) {
  const content = getArtifactContent<DiffArtifactContent>(artifact);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictEntry[] | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const { downloadUrl } = useBlobDownload();
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({
    minW: 520,
    minH: 240,
    defaultHeight: DEFAULT_HEIGHT,
  });

  const candidates = useMemo(() => {
    const convId = useChatStore.getState().activeConversationId;
    return convId ? gatherCodeCandidates(convId) : [];
  }, [artifact.id, applied]);

  const displayDiff = useMemo(
    () => resolveDiffDisplay(
      { fileName: content.fileName, oldCode: content.oldCode, newCode: content.newCode },
      candidates,
    ),
    [content.fileName, content.oldCode, content.newCode, candidates],
  );

  const stats = useMemo(
    () => getDiffStats(displayDiff.oldCode, displayDiff.newCode),
    [displayDiff.oldCode, displayDiff.newCode],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fileApi.applyDiff({
        fileName: content.fileName || "modified.txt",
        code: content.newCode,
        language: content.language || "text",
      });
      const { downloadUrl: url } = res.data.data;
      await downloadUrl(url, content.fileName || "modified.txt");
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
  }, [content.fileName, content.newCode, content.language, downloadUrl]);

  const handleApply = useCallback(async () => {
    const convId = useChatStore.getState().activeConversationId;
    if (!convId) {
      toast.error("无法定位会话");
      return;
    }

    const candidates = gatherCodeCandidates(convId);
    const result = findApplyTarget(
      { fileName: content.fileName, oldCode: content.oldCode, newCode: content.newCode },
      candidates,
    );

    if ("error" in result) {
      toast.error(
        result.error === "no-candidates"
          ? "会话中没有可应用的代码卡"
          : "未找到匹配的源代码卡，请手动复制修改后的代码",
      );
      return;
    }

    if (!result.target.persistable) {
      toast.error("源代码卡是临时解析卡，无法写回，请手动复制修改后的代码");
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
      queryClient.invalidateQueries({ queryKey: ["artifact-versions", convId] });
      setApplied(true);
      const targetName = result.target.fileName ? `「${result.target.fileName}」` : "源代码卡";
      toast.success(`已应用到${targetName}，并追加为新版本`);
    } catch {
      toast.error("应用失败");
    } finally {
      setApplying(false);
    }
  }, [content.fileName, content.oldCode, content.newCode]);

  const viewer = (
    <SideBySideDiffViewer
      oldCode={displayDiff.oldCode}
      newCode={displayDiff.newCode}
      compact={false}
    />
  );

  if (conflicts) {
    return (
      <div ref={cardRef} className="artifact-card diff-card" style={{ height: DEFAULT_HEIGHT, minWidth: 520 }}>
        <ConflictResolver
          fileName={content.fileName || ""}
          conflicts={conflicts}
          onResolve={() => {
            toast.success("冲突已解决");
            setConflicts(null);
          }}
          onCancel={() => setConflicts(null)}
        />
      </div>
    );
  }

  return (
    <div ref={cardRef} className="artifact-card diff-card" style={{ height: DEFAULT_HEIGHT, minWidth: 520 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 14px",
          borderBottom: "1px solid var(--color-card-border)",
          flexShrink: 0,
          background: "var(--color-bg-elevated)",
        }}
      >
        <span style={{ fontFamily: "monospace", fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>
          {content.fileName || "diff"}
        </span>
        {content.language && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: "1.5px 7px", borderRadius: 10, background: "rgba(51,112,255,0.1)", color: "var(--color-primary)", textTransform: "uppercase" }}>
            {content.language}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "var(--color-success)" }}>
          +{stats.added}
        </span>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 11, margin: "0 1px" }}>/</span>
        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "var(--color-danger)" }}>
          -{stats.removed}
        </span>

        <button
          className={`diff-card__toolbar-button ${applied ? "diff-card__toolbar-button--success" : "diff-card__toolbar-button--primary"}`}
          onClick={handleApply}
          disabled={applying || applied}
          title="应用到源文件"
        >
          {applied ? <IconTick /> : <IconSourceControl />}
          <span>{applying ? "应用中" : applied ? "已应用" : "应用"}</span>
        </button>

        <Tooltip content={saved ? "已另存为文件" : "另存为文件"}>
          <button
            className={`diff-card__toolbar-button diff-card__toolbar-icon ${saved ? "diff-card__toolbar-button--success" : ""}`}
            onClick={handleSave}
            disabled={saving || saved}
            title="另存为文件"
          >
            {saved ? <IconTick /> : saving ? <IconSave /> : <IconDownload />}
          </button>
        </Tooltip>
        <Tooltip content="恢复默认大小">
          <button className="artifact-card__reset" onClick={resetSize} title="恢复默认大小">
            <IconRefresh />
          </button>
        </Tooltip>
        <Tooltip content="全屏查看">
          <button className="artifact-card__reset" onClick={() => setFullscreen(true)} title="全屏查看">
            <IconExpand />
          </button>
        </Tooltip>
        <span ref={sizeLabelRef} className="artifact-card__size-label" />
      </div>

      <div className="artifact-card__body" style={{ flex: 1, minHeight: 0 }}>
        {viewer}
      </div>

      <div ref={resizeRef} className="artifact-card__resize" title="拖拽调整大小">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
          <line x1={19} y1={5} x2={5} y2={19} />
          <line x1={19} y1={11} x2={11} y2={19} />
          <line x1={19} y1={17} x2={17} y2={19} />
        </svg>
      </div>

      <FullscreenModal
        visible={fullscreen}
        onClose={() => setFullscreen(false)}
        title={content.fileName || "diff"}
      >
        {viewer}
      </FullscreenModal>
    </div>
  );
}
