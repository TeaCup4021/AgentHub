import { Card, Button } from "@douyinfe/semi-ui";
import { IconDownload, IconFile } from "@douyinfe/semi-icons";
import { formatFileSize } from "@/lib/utils";
import type { Artifact, FileArtifactContent } from "@/types";

interface FileCardProps {
  artifact: Artifact;
}

export function FileCard({ artifact }: FileCardProps) {
  const c = artifact.content as unknown as FileArtifactContent;
  return (
    <Card style={{ margin: "8px 0" }}>
      <a
        href={c.fileUrl}
        download
        style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}
      >
        <IconFile style={{ fontSize: 20, color: "var(--color-text-tertiary)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.fileName}
          </p>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>
            {formatFileSize(c.fileSize)} · {c.fileType}
          </p>
        </div>
        <Button
          theme="borderless"
          icon={<IconDownload />}
          size="small"
          style={{ flexShrink: 0 }}
        />
      </a>
    </Card>
  );
}
