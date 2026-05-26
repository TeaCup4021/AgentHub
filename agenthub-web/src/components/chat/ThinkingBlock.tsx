import { useState, useEffect } from "react";
import { Collapse, Spin, Tag } from "@douyinfe/semi-ui";
import { IconBulb, IconWrench, IconEyeOpened } from "@douyinfe/semi-icons";
import type { ThinkingStep } from "@/types";

interface ThinkingBlockProps {
  steps: ThinkingStep[];
  isStreaming?: boolean;
}

const phaseConfig: Record<ThinkingStep["phase"], { icon: React.ReactNode; label: string; color: string }> = {
  thought: { icon: <IconBulb />, label: "思考", color: "var(--color-primary)" },
  action: { icon: <IconWrench />, label: "行动", color: "#7c3aed" },
  observation: { icon: <IconEyeOpened />, label: "观察", color: "var(--color-success)" },
};

const statusDotStyle: Record<string, React.CSSProperties> = {
  pending: { background: "var(--color-text-disabled)" },
  running: { background: "var(--color-primary)", animation: "pulse 1.5s infinite" },
  done: { background: "var(--color-success)" },
  error: { background: "var(--color-danger)" },
};

export function ThinkingBlock({ steps, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isStreaming) setExpanded(true);
  }, [isStreaming]);

  if (steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <Collapse
      activeKey={expanded ? ["thinking"] : []}
      onChange={() => setExpanded(!expanded)}
      style={{ margin: "8px 0" }}
    >
      <Collapse.Panel
        header={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconBulb style={{ color: "var(--color-text-secondary)" }} />
            <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--color-text-primary)" }}>
              {isStreaming ? "推理中..." : `推理过程 (${doneCount}/${steps.length} 步)`}
            </span>
            {isStreaming && <Spin size="small" />}
          </div>
        }
        itemKey="thinking"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {steps.map((step, i) => {
            const cfg = phaseConfig[step.phase];
            const dotStyle = statusDotStyle[step.status ?? "pending"] ?? statusDotStyle.pending;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-bg-hover)",
                  fontSize: "var(--font-size-sm)",
                  borderLeft: `3px solid ${cfg.color}`,
                }}
              >
                <span style={{ marginTop: 2, flexShrink: 0, color: cfg.color }}>{cfg.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{cfg.label}</span>
                    {step.toolName && (
                      <Tag size="small" color="grey" type="ghost">{step.toolName}</Tag>
                    )}
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      flexShrink: 0,
                      ...dotStyle,
                    }} />
                  </div>
                  <p style={{
                    marginTop: 4,
                    color: "var(--color-text-secondary)",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                  }}>
                    {step.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Collapse.Panel>
    </Collapse>
  );
}
