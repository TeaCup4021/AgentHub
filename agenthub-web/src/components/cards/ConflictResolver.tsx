import { useState, useCallback } from "react";
import { Button, TextArea } from "@douyinfe/semi-ui";
import type { ConflictEntry } from "@/types";

interface ConflictResolverProps {
  fileName: string;
  conflicts: ConflictEntry[];
  onResolve: (acceptedIds: string[]) => void;
  onCancel: () => void;
}

export function ConflictResolver({ fileName, conflicts, onResolve, onCancel }: ConflictResolverProps) {
  const [decisions, setDecisions] = useState<Record<string, "accepted" | "rejected">>(
    Object.fromEntries(conflicts.map((c) => [c.agent_id, "accepted"])),
  );
  const [mergedCode, setMergedCode] = useState("");

  const toggleDecision = useCallback((agentId: string) => {
    setDecisions((prev) => ({ ...prev, [agentId]: prev[agentId] === "accepted" ? "rejected" : "accepted" }));
  }, []);

  const handleAcceptAll = useCallback(() => {
    onResolve(conflicts.filter((c) => decisions[c.agent_id] !== "rejected").map((c) => c.agent_id));
  }, [decisions, conflicts, onResolve]);

  return (
    <div style={{
      border: "2px solid var(--color-warning)", borderRadius: "var(--radius-md)",
      background: "var(--color-bg-elevated)", marginTop: 8, overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 14px", background: "color-mix(in srgb, var(--color-warning) 10%, transparent)",
        borderBottom: "1px solid var(--color-border-light)", fontSize: "var(--font-size-sm)",
        fontWeight: 600, color: "var(--color-text-primary)",
      }}>
        代码冲突 — {fileName}
      </div>

      <div style={{ padding: "8px 14px", maxHeight: 360, overflowY: "auto" }}>
        {conflicts.map((conflict) => {
          const accepted = decisions[conflict.agent_id] !== "rejected";
          return (
            <div key={conflict.agent_id} style={{
              marginBottom: 12, padding: "10px 12px",
              border: `1px solid ${accepted ? "var(--color-border-medium)" : "var(--color-border-light)"}`,
              borderRadius: "var(--radius-sm)", background: accepted ? "var(--color-bg-elevated)" : "var(--color-bg-hover)",
              opacity: accepted ? 1 : 0.5,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                  {conflict.agent_name} (0 条修改)
                </span>
                <Button size="small" theme={accepted ? "solid" : "borderless"} type={accepted ? "primary" : "tertiary"} onClick={() => toggleDecision(conflict.agent_id)}>
                  {accepted ? "接受此版本" : "已跳过"}
                </Button>
              </div>
              {accepted && (
                <div style={{ fontSize: "var(--font-size-xs)", fontFamily: "monospace", whiteSpace: "pre-wrap", background: "var(--color-bg-hover)", padding: "6px 10px", borderRadius: "var(--radius-xs)" }}>
                  {conflict.diff.newCode ? conflict.diff.newCode.split("\n").map((l, i) => (
                    <div key={i} style={{ color: l.startsWith("+") ? "var(--color-success)" : l.startsWith("-") ? "var(--color-danger)" : "var(--color-text-secondary)" }}>
                      {l}
                    </div>
                  )) : conflict.diff.oldCode}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "8px 14px", borderTop: "1px solid var(--color-border-light)", background: "var(--color-bg-hover)" }}>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)", marginBottom: 6 }}>合并结果（可手动编辑）:</div>
        <TextArea value={mergedCode} onChange={setMergedCode} placeholder="编辑合并后的代码…" rows={4} style={{ fontSize: "var(--font-size-xs)", fontFamily: "monospace", marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button size="small" theme="borderless" onClick={onCancel}>取消</Button>
          <Button size="small" theme="solid" type="primary" onClick={handleAcceptAll}>全部接受</Button>
        </div>
      </div>
    </div>
  );
}
