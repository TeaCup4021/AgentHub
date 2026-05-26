import { useMemo } from "react";
import { Card, Typography } from "@douyinfe/semi-ui";
import { useTokenUsageStore } from "@/stores/tokenUsageStore";
import { TokenCharts } from "./TokenCharts";

export function TokenUsagePanel() {
  const usageMap = useTokenUsageStore((s) => s.usageMap);
  const usages = useMemo(() => Object.values(usageMap), [usageMap]);

  const { totalInput, totalOutput, totalCost } = useMemo(() => {
    let input = 0;
    let output = 0;
    let cost = 0;
    for (const u of usages) {
      input += u.inputTokens;
      output += u.outputTokens;
      cost += u.estimatedCost;
    }
    return { totalInput: input, totalOutput: output, totalCost: cost };
  }, [usages]);

  return (
    <section>
      <Typography.Title heading={6} style={{ marginBottom: 8, color: "var(--color-text-primary)" }}>
        Token 用量
      </Typography.Title>
      <Typography.Text type="tertiary" size="small" style={{ display: "block", marginBottom: 16 }}>
        统计各会话的 Token 消耗和预估成本。数据从每次会话完成后累积。
      </Typography.Text>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <Card style={{ textAlign: "center" }}>
          <Typography.Text type="tertiary" size="small">输入 Token</Typography.Text>
          <Typography.Title heading={4} style={{ margin: "4px 0 0", color: "var(--color-text-primary)" }}>
            {(totalInput / 1000).toFixed(1)}k
          </Typography.Title>
        </Card>
        <Card style={{ textAlign: "center" }}>
          <Typography.Text type="tertiary" size="small">输出 Token</Typography.Text>
          <Typography.Title heading={4} style={{ margin: "4px 0 0", color: "var(--color-text-primary)" }}>
            {(totalOutput / 1000).toFixed(1)}k
          </Typography.Title>
        </Card>
        <Card style={{ textAlign: "center" }}>
          <Typography.Text type="tertiary" size="small">预估成本</Typography.Text>
          <Typography.Title heading={4} style={{ margin: "4px 0 0", color: "var(--color-text-primary)" }}>
            ${totalCost.toFixed(4)}
          </Typography.Title>
        </Card>
      </div>

      {usages.length > 0 && (
        <Card bodyStyle={{ padding: 0 }} style={{ marginBottom: 16 }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 120px 120px 120px",
            gap: 8,
            padding: "8px 16px",
            background: "var(--color-bg-hover)",
            fontSize: "var(--font-size-xs)",
            fontWeight: 500,
            color: "var(--color-text-tertiary)",
          }}>
            <span>会话</span>
            <span style={{ textAlign: "right" }}>输入</span>
            <span style={{ textAlign: "right" }}>输出</span>
            <span style={{ textAlign: "right" }}>成本</span>
          </div>
          {usages
            .slice()
            .sort((a, b) => b.totalTokens - a.totalTokens)
            .map((u) => (
              <div
                key={u.conversationId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 120px 120px",
                  gap: 8,
                  padding: "8px 16px",
                  borderTop: "1px solid var(--color-border-light)",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                <span style={{ color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.conversationTitle}
                </span>
                <span style={{ textAlign: "right", color: "var(--color-text-tertiary)" }}>
                  {(u.inputTokens / 1000).toFixed(1)}k
                </span>
                <span style={{ textAlign: "right", color: "var(--color-text-tertiary)" }}>
                  {(u.outputTokens / 1000).toFixed(1)}k
                </span>
                <span style={{ textAlign: "right", color: "var(--color-text-secondary)" }}>
                  ${u.estimatedCost.toFixed(4)}
                </span>
              </div>
            ))}
        </Card>
      )}

      <TokenCharts />
    </section>
  );
}
