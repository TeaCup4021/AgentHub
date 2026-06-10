import { useState, useEffect } from "react";
import { Spin, Empty } from "@douyinfe/semi-ui";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import type { Artifact, DocumentArtifactContent } from "@/types";
import { useResizable } from "@/hooks/useResizable";
import { useBlobDownload } from "@/hooks/useBlobDownload";
import { formatFileSize } from "@/lib/utils";
import { FullscreenModal } from "./FullscreenModal";

const DEFAULT_HEIGHT = 320;
const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  ppt: "PPT",
  pptx: "PPT",
};

function normalizeFileType(fileType: string | undefined): string {
  return String(fileType || "").toLowerCase();
}

function fileTypeLabel(fileType: string): string {
  return FILE_TYPE_LABELS[fileType] || fileType.toUpperCase() || "FILE";
}

function isPresentation(fileType: string): boolean {
  return fileType === "ppt" || fileType === "pptx";
}

function withFilenameParam(url: string, fileName: string): string {
  if (!url || !fileName || /(?:\?|&)filename=/.test(url)) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}filename=${encodeURIComponent(fileName)}`;
}

function getPreviewUrl(content: DocumentArtifactContent, fileType: string): string {
  if (content.previewUrl) {
    return isPresentation(fileType)
      ? withFilenameParam(content.previewUrl, content.fileName)
      : content.previewUrl;
  }
  if (fileType === "pdf") return content.fileUrl;
  if (!isPresentation(fileType) || !content.fileUrl) return "";
  const previewUrl = content.fileUrl.replace(/\/download(?:\?.*)?$/, "/preview");
  if (previewUrl === content.fileUrl) return "";
  return withFilenameParam(previewUrl, content.fileName);
}

function DocumentDownloadFallback({
  content,
  fileType,
  reason,
  onDownload,
}: {
  content: DocumentArtifactContent;
  fileType: string;
  reason?: string;
  onDownload: () => void;
}) {
  const label = fileTypeLabel(fileType);
  const sizeLabel = (content.fileSize ?? 0) > 0 ? formatFileSize(content.fileSize) : "";
  const description = reason || (isPresentation(fileType)
    ? "点击下载查看演示文稿。"
    : "暂时无法预览，请下载后查看。");

  return (
    <div
      data-testid="document-download-fallback"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{
        width: "100%",
        maxWidth: 460,
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}>
        <div style={{
          flexShrink: 0,
          width: 48,
          height: 48,
          borderRadius: 8,
          background: "rgba(240,140,48,0.12)",
          color: "#d97000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
        }}>
          {label}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {content.fileName}
          </p>
          <p style={{
            margin: "3px 0 0 0",
            fontSize: 11,
            color: "var(--color-text-tertiary)",
          }}>
            {[sizeLabel, label].filter(Boolean).join(" / ")}
          </p>
          <p style={{
            margin: "6px 0 0 0",
            fontSize: 12,
            color: "var(--color-text-secondary)",
          }}>
            {description}
          </p>
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={!content.fileUrl}
          style={{
            flexShrink: 0,
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-card-border)",
            background: "var(--color-bg-chat)",
            color: "var(--color-primary)",
            cursor: content.fileUrl ? "pointer" : "not-allowed",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          下载
        </button>
      </div>
    </div>
  );
}

export function DocumentCard({ artifact }: { artifact: Artifact }) {
  const c = artifact.content as unknown as DocumentArtifactContent;
  const fileType = normalizeFileType(c.fileType);
  const label = fileTypeLabel(fileType);
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({ defaultHeight: DEFAULT_HEIGHT });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [docHtml, setDocHtml] = useState("");
  const [tableHtml, setTableHtml] = useState("");
  const { downloadUrl } = useBlobDownload();
  const previewUrl = getPreviewUrl(c, fileType);

  const handleDownload = () => {
    if (c.fileUrl) downloadUrl(c.fileUrl, c.fileName);
  };

  useEffect(() => {
    setLoading(true);
    setError(false);
    setPreviewError("");
    setDocHtml("");
    setTableHtml("");

    if (fileType === "pdf" || isPresentation(fileType)) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(c.fileUrl);
        if (!res.ok) throw new Error("Fetch failed");
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        if (fileType === "docx") {
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (cancelled) return;
          setDocHtml(result.value);
        } else if (fileType === "xlsx") {
          const wb = XLSX.read(buffer, { type: "array" });
          const sheetName = wb.SheetNames[0];
          if (!sheetName) throw new Error("No sheets in workbook");
          const html = XLSX.utils.sheet_to_html(wb.Sheets[sheetName]);
          if (cancelled) return;
          setTableHtml(html);
        }

        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [c.fileUrl, fileType, previewUrl]);

  const renderBody = (isFullscreen = false) => {
    if (loading) return <Spin />;
    if (error) {
      return (
        <Empty
          title="暂时无法预览"
          description={`${label} 文件暂时无法在线预览，请下载后查看。`}
        />
      );
    }
    if (fileType === "pdf") {
      return (
        <iframe
          src={previewUrl || c.fileUrl}
          style={{ width: "100%", height: "100%", border: "none" }}
          title={c.fileName}
          onError={() => setError(true)}
        />
      );
    }
    if (isPresentation(fileType)) {
      return (
        <DocumentDownloadFallback
          content={c}
          fileType={fileType}
          reason={previewError}
          onDownload={handleDownload}
        />
      );
    }
    if (fileType === "docx") {
      return (
        <div
          className="document-card__docx"
          dangerouslySetInnerHTML={{ __html: docHtml }}
          style={{
            width: "100%",
            height: "100%",
            overflow: "auto",
            padding: isFullscreen ? 16 : "16px",
            fontSize: "var(--font-size-md)",
            lineHeight: 1.7,
            color: "var(--color-text-primary)",
            background: isFullscreen ? undefined : "var(--color-bg-chat)",
          }}
        />
      );
    }
    if (fileType === "xlsx") {
      return (
        <div
          className="document-card__xlsx"
          dangerouslySetInnerHTML={{ __html: tableHtml }}
          style={{
            width: "100%",
            height: "100%",
            overflow: "auto",
            padding: 8,
            color: "var(--color-text-primary)",
          }}
        />
      );
    }
    return (
      <DocumentDownloadFallback
        content={c}
        fileType={fileType}
        reason={previewError}
        onDownload={handleDownload}
      />
    );
  };

  return (
    <div ref={cardRef} className="artifact-card artifact-card-document" style={{ height: DEFAULT_HEIGHT }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderBottom: "1px solid var(--color-card-border)",
        flexShrink: 0,
        background: "var(--color-bg-elevated)",
      }}>
        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>
          {c.fileName}
        </span>
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          padding: "1.5px 7px",
          borderRadius: 10,
          background: "rgba(51,112,255,0.1)",
          color: "var(--color-primary)",
        }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
          {formatFileSize(c.fileSize ?? 0)}
        </span>
        <div style={{ flex: 1 }} />
        <span ref={sizeLabelRef} className="artifact-card__size-label" />
        <button className="artifact-card__reset" onClick={handleDownload} title="下载文档" aria-label="下载文档" disabled={!c.fileUrl}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1={12} y1={15} x2={12} y2={3}/>
          </svg>
        </button>
        {!isPresentation(fileType) && (
          <button className="artifact-card__reset" onClick={() => setFullscreen(true)} title="放大预览" aria-label="放大预览">
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </button>
        )}
        <button className="artifact-card__reset" onClick={resetSize} title="恢复默认大小" aria-label="恢复默认大小">
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </button>
      </div>

      <div className="artifact-card__body" style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {renderBody()}
      </div>

      <div ref={resizeRef} className="artifact-card__resize" title="拖拽调整大小">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
          <line x1={19} y1={5} x2={5} y2={19}/><line x1={19} y1={11} x2={11} y2={19}/><line x1={19} y1={17} x2={17} y2={19}/>
        </svg>
      </div>

      <FullscreenModal
        visible={fullscreen}
        onClose={() => setFullscreen(false)}
        title={c.fileName}
      >
        <div className="artifact-card__body" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {renderBody(true)}
        </div>
      </FullscreenModal>
    </div>
  );
}
