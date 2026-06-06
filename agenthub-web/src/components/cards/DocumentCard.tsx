import { useState, useEffect } from "react";
import { Spin, Empty } from "@douyinfe/semi-ui";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import type { Artifact, DocumentArtifactContent } from "@/types";
import { useResizable } from "@/hooks/useResizable";
import { formatFileSize } from "@/lib/utils";

const DEFAULT_HEIGHT = 320;
const FILE_TYPE_LABELS: Record<string, string> = { pdf: "PDF", docx: "Word", xlsx: "Excel", pptx: "PPT" };

export function DocumentCard({ artifact }: { artifact: Artifact }) {
  const c = artifact.content as unknown as DocumentArtifactContent;
  const { cardRef, resizeRef, sizeLabelRef, resetSize } = useResizable({ defaultHeight: DEFAULT_HEIGHT });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [docHtml, setDocHtml] = useState("");
  const [tableHtml, setTableHtml] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(false);
    setDocHtml("");
    setTableHtml("");

    if (c.fileType === "pdf" || c.fileType === "pptx") {
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

        if (c.fileType === "docx") {
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (cancelled) return;
          setDocHtml(result.value);
        } else if (c.fileType === "xlsx") {
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

    return () => { cancelled = true; };
  }, [c.fileUrl, c.fileType]);

  return (
    <div ref={cardRef} className="artifact-card artifact-card-document" style={{ height: DEFAULT_HEIGHT }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 14px", borderBottom: "1px solid var(--color-card-border)",
        flexShrink: 0, background: "var(--color-bg-elevated)",
      }}>
        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>
          {c.fileName}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "1.5px 7px", borderRadius: 10,
          background: "rgba(51,112,255,0.1)", color: "var(--color-primary)",
        }}>
          {FILE_TYPE_LABELS[c.fileType] || c.fileType}
        </span>
        <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
          {formatFileSize(c.fileSize)}
        </span>
        <div style={{ flex: 1 }} />
        <span ref={sizeLabelRef} className="artifact-card__size-label" />
        <button className="artifact-card__reset" onClick={resetSize} title="恢复默认大小">
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </button>
      </div>

      <div className="artifact-card__body" style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {loading ? (
          <Spin />
        ) : error ? (
          <Empty title="预览不可用" description={`${FILE_TYPE_LABELS[c.fileType] || "此"} 文件暂不支持内联预览，请下载查看`} />
        ) : (c.fileType === "pdf" || c.fileType === "pptx") ? (
          <iframe src={c.fileUrl} style={{ width: "100%", height: "100%", border: "none" }} title={c.fileName} onError={() => setError(true)} />
        ) : c.fileType === "docx" ? (
          <div
            className="document-card__docx"
            dangerouslySetInnerHTML={{ __html: docHtml }}
            style={{
              width: "100%", height: "100%", overflow: "auto", padding: "16px",
              fontSize: "var(--font-size-md)", lineHeight: 1.7,
              color: "var(--color-text-primary)", background: "var(--color-bg-chat)",
            }}
          />
        ) : c.fileType === "xlsx" ? (
          <div
            className="document-card__xlsx"
            dangerouslySetInnerHTML={{ __html: tableHtml }}
            style={{
              width: "100%", height: "100%", overflow: "auto", padding: "8px",
              color: "var(--color-text-primary)",
            }}
          />
        ) : (
          <div style={{ textAlign: "center" }}>
            <Empty title={FILE_TYPE_LABELS[c.fileType] || "文档"} description="点击下载查看完整内容" />
            <a href={c.fileUrl} download={c.fileName} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-primary)", marginTop: 8, display: "inline-block" }}>
              下载文件
            </a>
          </div>
        )}
      </div>

      <div ref={resizeRef} className="artifact-card__resize" title="拖拽调整大小">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
          <line x1={19} y1={5} x2={5} y2={19}/><line x1={19} y1={11} x2={11} y2={19}/><line x1={19} y1={17} x2={17} y2={19}/>
        </svg>
      </div>
    </div>
  );
}
