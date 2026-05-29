import { useMemo } from "react";
import { useTokenUsageStore } from "@/stores/tokenUsageStore";
import { TokenCharts } from "./TokenCharts";

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toLocaleString();
}

function StatItem({ value, label, sub, color }: { value: string; label: string; sub: string; color: string }) {
  return (
    <div style={{
      flex: 1,
      padding: "14px 16px",
      borderRight: "1px solid var(--color-border-light)",
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-disabled)", marginTop: 1 }}>{sub}</div>
    </div>
  );
}

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
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>
        Token 用量
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
        本月累计消耗统计，每月 1 日重置
      </div>

      {/* Stats row */}
      <div style={{
        display: "flex",
        border: "1px solid var(--color-card-border)",
        borderRadius: 8,
        background: "var(--color-bg-sidebar)",
        overflow: "hidden",
      }}>
        <StatItem
          value={formatNum(totalInput)}
          label="输入 Token"
          sub="本月累计"
          color="var(--color-primary)"
        />
        <StatItem
          value={formatNum(totalOutput)}
          label="输出 Token"
          sub="本月累计"
          color="var(--color-success)"
        />
        <StatItem
          value={"$" + totalCost.toFixed(2)}
          label="预估费用"
          sub="按官方定价估算"
          color="var(--color-text-primary)"
        />
      </div>

      {/* Charts */}
      <div style={{ marginTop: 16 }}>
        <TokenCharts />
      </div>
    </section>
  );
}
