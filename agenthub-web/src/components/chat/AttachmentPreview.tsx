import { Button } from "@douyinfe/semi-ui";
import { IconClose } from "@douyinfe/semi-icons";
import { formatFileSize } from "@/lib/utils";
import type { Attachment } from "@/types";

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div style={{
      display: "flex",
      gap: 8,
      marginBottom: 8,
      flexWrap: "wrap",
    }}>
      {attachments.map((att) => (
        <div
          key={att.id}
          style={{
            position: "relative",
            width: 72,
            height: 72,
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border-light)",
            overflow: "hidden",
            background: "var(--color-bg-hover)",
            flexShrink: 0,
          }}
        >
          {att.fileType.startsWith("image/") ? (
            <img src={att.fileUrl} alt={att.fileName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "100%", padding: 4,
            }}>
              <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", textAlign: "center", wordBreak: "break-all", lineHeight: 1.2 }}>
                {att.fileName}
              </span>
              <span style={{ fontSize: 9, color: "var(--color-text-disabled)", marginTop: 2 }}>
                {formatFileSize(att.fileSize)}
              </span>
            </div>
          )}
          <Button
            icon={<IconClose />}
            theme="borderless"
            size="small"
            onClick={() => onRemove(att.id)}
            style={{
              position: "absolute", top: 0, right: 0,
              padding: 2, minWidth: 18, height: 18,
              background: "rgba(0,0,0,0.5)", color: "#fff",
              borderRadius: 0,
            }}
          />
        </div>
      ))}
    </div>
  );
}
