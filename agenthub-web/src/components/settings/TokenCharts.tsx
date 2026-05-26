import { useMemo } from "react";
import { Card, Typography, Empty } from "@douyinfe/semi-ui";
import { useTokenUsageStore } from "@/stores/tokenUsageStore";

// recharts is loaded dynamically to avoid Vite CJS pre-bundling issues
// Charts will be available when data exists

export function TokenCharts() {
  const events = useTokenUsageStore((s) => s.events);
  const usageMap = useTokenUsageStore((s) => s.usageMap);
  const usages = useMemo(() => Object.values(usageMap), [usageMap]);

  const dailyData = useMemo(() => {
    const map = new Map<string, { date: string; input: number; output: number }>();
    for (const e of events) {
      const date = e.timestamp.slice(0, 10);
      const entry = map.get(date);
      if (entry) {
        entry.input += e.inputTokens;
        entry.output += e.outputTokens;
      } else {
        map.set(date, { date, input: e.inputTokens, output: e.outputTokens });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [events]);

  const agentData = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) {
      map.set(e.agentName, (map.get(e.agentName) || 0) + e.inputTokens + e.outputTokens);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [events]);

  const top10 = useMemo(() =>
    usages.slice().sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 10),
    [usages],
  );

  if (events.length === 0) {
    return (
      <Empty
        title="暂无 Token 用量数据"
        description="完成对话后自动生成统计图表"
        style={{ padding: "24px 0" }}
      />
    );
  }

  const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <Typography.Title heading={6} style={{ marginBottom: 8, color: "var(--color-text-primary)" }}>
          每日 Token 消耗
        </Typography.Title>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {dailyData.map((d) => (
            <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)", width: 80 }}>{d.date}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--color-bg-hover)", overflow: "hidden", display: "flex" }}>
                <div style={{ height: "100%", background: "#3370ff", width: `${Math.min(100, (d.input / Math.max(...dailyData.map(x => x.input + x.output))) * 100)}%` }} />
              </div>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>{formatNum(d.input + d.output)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Typography.Title heading={6} style={{ marginBottom: 8, color: "var(--color-text-primary)" }}>
          Agent Token 分布
        </Typography.Title>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {agentData.map((a) => {
            const maxVal = Math.max(...agentData.map(x => x.value));
            return (
              <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-primary)", width: 100 }}>{a.name}</span>
                <div style={{ flex: 1, height: 12, borderRadius: 6, background: "var(--color-bg-hover)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 6, background: "#00b578", width: `${(a.value / maxVal) * 100}%` }} />
                </div>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>{formatNum(a.value)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <Typography.Title heading={6} style={{ marginBottom: 8, color: "var(--color-text-primary)" }}>
          会话 Token 排名 (Top 10)
        </Typography.Title>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {top10.map((u, i) => (
            <div key={u.conversationTitle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)", width: 20, textAlign: "right" }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: "var(--font-size-sm)", color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.conversationTitle}</span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>{formatNum(u.totalTokens)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
