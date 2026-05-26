import { useState } from "react";
import { Card, Modal, Button } from "@douyinfe/semi-ui";
import type { Artifact, PreviewArtifactContent } from "@/types";

interface PreviewCardProps {
  artifact: Artifact;
}

export function PreviewCard({ artifact }: PreviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const c = artifact.content as unknown as PreviewArtifactContent;

  return (
    <>
      <Card
        style={{ margin: "8px 0", overflow: "hidden" }}
        title={
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-primary)" }}>
            {c.title || "预览"} ({c.previewType})
          </span>
        }
        headerExtraContent={
          <Button size="small" theme="borderless" onClick={() => setExpanded(true)}>
            展开
          </Button>
        }
      >
        <div style={{ height: 192, background: "#fff" }}>
          <iframe
            src={c.url}
            title={c.title || "preview"}
            style={{ width: "100%", height: "100%", border: "none" }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </Card>

      <Modal
        visible={expanded}
        fullScreen
        onCancel={() => setExpanded(false)}
        footer={null}
        title={c.title || "全屏预览"}
        bodyStyle={{ padding: 0, height: "calc(100% - 48px)" }}
      >
        <iframe
          src={c.url}
          title={c.title || "preview"}
          style={{ width: "100%", height: "100%", border: "none" }}
          sandbox="allow-scripts allow-same-origin"
        />
      </Modal>
    </>
  );
}
