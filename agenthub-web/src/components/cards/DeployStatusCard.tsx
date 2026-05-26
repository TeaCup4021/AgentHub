import { Card, Tag, Spin, Button } from "@douyinfe/semi-ui";
import { IconTickCircle, IconClear } from "@douyinfe/semi-icons";
import type { Artifact, DeployStatusArtifactContent } from "@/types";

interface DeployStatusCardProps {
  artifact: Artifact;
}

export function DeployStatusCard({ artifact }: DeployStatusCardProps) {
  const c = artifact.content as unknown as DeployStatusArtifactContent;

  if (c.status === "building") {
    return (
      <Card style={{ margin: "8px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Spin size="small" />
          <span style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)" }}>
            构建中...
          </span>
          <Tag size="small" color="orange" type="solid">构建中</Tag>
        </div>
      </Card>
    );
  }

  if (c.status === "deployed") {
    return (
      <Card style={{ margin: "8px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <IconTickCircle style={{ color: "var(--color-success)" }} />
          <span style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)" }}>
            部署成功
          </span>
          <Tag size="small" color="green" type="solid">已部署</Tag>
        </div>
        {c.url && (
          <div style={{ marginTop: 8 }}>
            <Button theme="borderless" size="small" onClick={() => window.open(c.url, "_blank", "noopener,noreferrer")}>
              {c.url}
            </Button>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card style={{ margin: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <IconClear style={{ color: "var(--color-danger)" }} />
        <span style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)" }}>
          部署失败
        </span>
        <Tag size="small" color="red" type="solid">失败</Tag>
      </div>
    </Card>
  );
}
