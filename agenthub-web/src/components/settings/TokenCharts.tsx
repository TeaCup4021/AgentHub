import { useMemo } from "react";
import { Card } from "@douyinfe/semi-ui";
import { useTokenUsageStore } from "@/stores/tokenUsageStore";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const COLORS = {
  input: "#3370ff",
  output: "#00b578",
  cost: "#f5a623",
};

const PIE_COLORS = ["#3370ff", "#00b578", "#f5a623", "#e04f8b", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];

function formatNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--color-bg-elevated)",
      border: "1px solid var(--color-border-light)",
      borderRadius: 8,
      padding: "8px 12px",
      boxShadow: "var(--shadow-md)",
      fontSize: 12,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--color-text-primary)" }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.color, display: "inline-block", flexShrink: 0 }} />
          {entry.name}: {formatNum(entry.value)}
        </div>
      ))}
    </div>
  );
}

export function TokenCharts() {
  const events = useTokenUsageStore((s) => s.events);

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
    const map = new Map<string, { name: string; input: number; output: number }>();
    for (const e of events) {
      const entry = map.get(e.agentName);
      if (entry) {
        entry.input += e.inputTokens;
        entry.output += e.outputTokens;
      } else {
        map.set(e.agentName, { name: e.agentName, input: e.inputTokens, output: e.outputTokens });
      }
    }
    return Array.from(map.values())
      .map((a) => ({ name: a.name, value: a.input + a.output }))
      .sort((a, b) => b.value - a.value);
  }, [events]);

  const conversationData = useMemo(() => {
    const map = new Map<string, { title: string; input: number; output: number; cost: number }>();
    for (const e of events) {
      const entry = map.get(e.conversationId);
      if (entry) {
        entry.input += e.inputTokens;
        entry.output += e.outputTokens;
        entry.cost += e.estimatedCost;
      } else {
        map.set(e.conversationId, {
          title: e.conversationTitle,
          input: e.inputTokens,
          output: e.outputTokens,
          cost: e.estimatedCost,
        });
      }
    }
    return Array.from(map.values())
      .map((c) => ({ ...c, total: c.input + c.output }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [events]);

  if (events.length === 0) {
    return (
      <div style={{
        padding: "12px 16px",
        background: "var(--color-bg-sidebar)",
        borderRadius: 8,
        border: "1px solid var(--color-card-border)",
        fontSize: 13,
        color: "var(--color-text-tertiary)",
        textAlign: "center",
      }}>
        暂无近期对话记录 — 开始对话后将在此展示 Token 消耗明细
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 每日 Token 消耗面积图 */}
      <Card bodyStyle={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>
          每日 Token 消耗趋势
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 10 }}>
          输入 / 输出 Token 随时间变化
        </div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <AreaChart data={dailyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="inputGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.input} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLORS.input} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="outputGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.output} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLORS.output} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickFormatter={formatNum} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(v: string) => <span style={{ color: "var(--color-text-secondary)" }}>{v}</span>}
              />
              <Area type="monotone" dataKey="input" name="输入 Token" stroke={COLORS.input} fill="url(#inputGradient)" strokeWidth={2} />
              <Area type="monotone" dataKey="output" name="输出 Token" stroke={COLORS.output} fill="url(#outputGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Agent 分布饼图 + 对话排名柱状图 并排 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Agent Token 占比饼图 */}
        <Card bodyStyle={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>
            Agent Token 占比
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 10 }}>
            各 Agent 消耗 Token 比例
          </div>
          <div style={{ width: "100%", height: 220 }}>
            {agentData.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-tertiary)", fontSize: 13 }}>
                暂无数据
              </div>
            ) : (
              <ResponsiveContainer>
                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <Pie
                    data={agentData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    outerRadius={70}
                    innerRadius={36}
                    paddingAngle={2}
                    label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={{ stroke: "var(--color-border-medium)", strokeWidth: 1 }}
                  >
                    {agentData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 4, justifyContent: "center" }}>
            {agentData.slice(0, 4).map((a, i) => (
              <span key={a.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: PIE_COLORS[i % PIE_COLORS.length], display: "inline-block", flexShrink: 0 }} />
                {a.name}
              </span>
            ))}
          </div>
        </Card>

        {/* 对话 Token 消耗排名柱状图 */}
        <Card bodyStyle={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>
            对话 Token 排名
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 10 }}>
            Top {conversationData.length} 对话消耗
          </div>
          <div style={{ width: "100%", height: 220 }}>
            {conversationData.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-tertiary)", fontSize: 13 }}>
                暂无数据
              </div>
            ) : (
              <ResponsiveContainer>
                <BarChart data={conversationData} layout="vertical" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }} tickFormatter={formatNum} />
                  <YAxis
                    type="category"
                    dataKey="title"
                    tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }}
                    width={80}
                    tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + "…" : v}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="input" name="输入 Token" fill={COLORS.input} stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="output" name="输出 Token" fill={COLORS.output} stackId="a" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
