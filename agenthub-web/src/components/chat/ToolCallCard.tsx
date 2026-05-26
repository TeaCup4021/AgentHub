import { Card, Spin, Tag } from "@douyinfe/semi-ui";
import { IconSearch, IconEdit, IconPlay, IconFile } from "@douyinfe/semi-icons";
import type { ThinkingStep } from "@/types";

interface ToolCallCardProps {
  step: ThinkingStep;
}

const toolIcons: Record<string, React.ReactNode> = {
  grep: <IconSearch />,
  read: <IconFile />,
  edit: <IconEdit />,
  run: <IconPlay />,
};

export function ToolCallCard({ step }: ToolCallCardProps) {
  const isRunning = step.status === "running";
  const isDone = step.status === "done";
  const isFailed = step.status === "error";

  return (
    <Card
      style={{
        margin: "8px 0",
        borderLeft: `3px solid ${
          isRunning ? "var(--color-primary)" :
          isFailed ? "var(--color-danger)" :
          "var(--color-success)"
        }`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {step.toolName ? toolIcons[step.toolName] ?? <IconPlay /> : <IconPlay />}
        <span style={{ fontWeight: 500, color: "var(--color-text-primary)", fontSize: "var(--font-size-md)" }}>
          {step.toolName}
        </span>
        {isRunning && <Spin size="small" />}
        {isDone && (
          <Tag size="small" type="solid" color="green">完成</Tag>
        )}
        {isFailed && (
          <Tag size="small" type="solid" color="red">失败</Tag>
        )}
      </div>
      {step.text && (
        <div style={{
          marginTop: 8,
          fontSize: "var(--font-size-sm)",
          color: "var(--color-text-secondary)",
          whiteSpace: "pre-wrap",
          lineHeight: 1.5,
        }}>
          {step.text}
        </div>
      )}
    </Card>
  );
}
