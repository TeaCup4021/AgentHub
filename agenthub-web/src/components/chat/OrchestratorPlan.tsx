import { useState } from "react";
import { Button, TextArea, Select } from "@douyinfe/semi-ui";
import { IconEdit, IconSend } from "@douyinfe/semi-icons";
import { AgentConfigPreviewCard } from "@/components/cards/AgentConfigPreviewCard";
import type { PlanSubtask } from "@/types";

interface OrchestratorPlanProps {
  planId: string;
  subtasks: PlanSubtask[];
  plannerAgentName?: string | null;
  agents?: { id: string; name: string }[];
  onConfirm?: () => void;
  onAdjust?: (subtasks: PlanSubtask[]) => void;
  onRefine?: () => void;
}

function PlanIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-gray-600)" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

const GRAY_950 = "var(--color-gray-950)";
const GRAY_600 = "var(--color-gray-600)";
const GRAY_400 = "var(--color-gray-400)";
const GRAY_200 = "var(--color-gray-200)";
const GRAY_100 = "var(--color-gray-100)";
const GRAY_50 = "var(--color-gray-50)";

export function OrchestratorPlan({
  planId,
  subtasks: initialSubtasks,
  plannerAgentName,
  agents = [],
  onConfirm,
  onAdjust,
  onRefine,
}: OrchestratorPlanProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PlanSubtask[]>(() =>
    initialSubtasks.map((t) => ({ ...t, agent: { ...t.agent } })),
  );

  if (initialSubtasks.length === 0) return null;

  const planBy = plannerAgentName
    ? `由 @${plannerAgentName} 制定`
    : "由 Orchestrator 制定";
  const modeLabel = plannerAgentName ? "DAG" : "Coordinator";

  const handleStartEdit = () => {
    setDraft(initialSubtasks.map((t) => ({ ...t, agent: { ...t.agent } })));
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSaveEdit = () => {
    if (onAdjust) onAdjust(draft);
    setEditing(false);
  };

  const handleUpdateInstruction = (i: number, instruction: string) => {
    setDraft((prev) => prev.map((t, idx) => (idx === i ? { ...t, instruction } : t)));
  };

  const handleUpdateAgent = (i: number, agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setDraft((prev) =>
      prev.map((t, idx) => (idx === i ? { ...t, agent: { id: agent.id, name: agent.name } } : t)),
    );
  };

  const handleDelete = (i: number) => {
    setDraft((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleAdd = () => {
    const newId = `subtask-${Date.now()}`;
    setDraft((prev) => [
      ...prev,
      {
        subtask_id: newId,
        agent: { id: agents[0]?.id ?? "", name: agents[0]?.name ?? "" },
        instruction: "",
        priority: prev.length + 1,
      },
    ]);
  };

  const taskRows = editing ? draft : initialSubtasks;

  return (
    <div>
      {/* 标题行 */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <PlanIcon />
        <span style={{ fontSize: 13, fontWeight: 600, color: GRAY_950 }}>
          执行计划
        </span>
        {editing && (
          <span style={{
            fontSize: 10, fontWeight: 500, color: GRAY_400,
            background: GRAY_200, borderRadius: 3, padding: "1px 6px",
          }}>
            编辑中
          </span>
        )}
      </div>

      {/* 来源 + 模式 */}
      <div style={{
        fontSize: 11, color: GRAY_400,
        marginBottom: 6,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span>{planBy}</span>
        <span>·</span>
        <span>{initialSubtasks.length} 个子任务</span>
        <span style={{
          fontSize: 10, fontWeight: 500, color: GRAY_600,
          background: GRAY_200, borderRadius: 3, padding: "1px 5px",
        }}>
          {modeLabel}
        </span>
      </div>

      {/* 审核提示横幅 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        marginBottom: 10,
        borderRadius: 6,
        background: "var(--color-warning-bg, #FFF8E1)",
        border: "1px solid var(--color-warning-border, #FFB300)",
        fontSize: 11,
        fontWeight: 500,
        color: "var(--color-warning-text, #E65100)",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
        <span>请审核执行计划，确认后开始执行</span>
      </div>

      {/* 任务列表 */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        background: editing ? GRAY_50 : "transparent",
        borderRadius: 6,
        padding: editing ? 8 : 0,
        marginBottom: 10,
      }}>
        {taskRows.map((task, i) => (
          <div
            key={editing ? i : `${planId}-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: GRAY_600,
              background: editing ? "#fff" : "transparent",
              borderRadius: 5,
              padding: editing ? "6px 8px" : "5px 0",
              borderBottom: editing ? "none" : i < taskRows.length - 1 ? `1px solid ${GRAY_100}` : "none",
            }}
          >
            {/* 序号 */}
            <span style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: GRAY_200,
              color: GRAY_600,
              fontSize: 10,
              fontWeight: 600,
              flexShrink: 0,
            }}>
              {i + 1}
            </span>

            {task.type === "create_agent" && task.agent_config ? (
              <div style={{ flex: 1 }}>
                <AgentConfigPreviewCard artifact={{ id: task.subtask_id, artifactType: "code" as const, content: task.agent_config as unknown as Record<string, unknown>, version: 1, createdAt: new Date().toISOString() }} />
              </div>
            ) : editing ? (
              <>
                <TextArea
                  value={task.instruction}
                  onChange={(v) => handleUpdateInstruction(i, v)}
                  rows={1}
                  style={{ flex: 1, fontSize: 12 }}
                />
                <Select
                  value={task.agent.id}
                  onChange={(v) => handleUpdateAgent(i, String(v))}
                  size="small"
                  style={{ width: 120, flexShrink: 0 }}
                >
                  {agents.map((a) => (
                    <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>
                  ))}
                </Select>
                <Button
                  size="small"
                  theme="borderless"
                  onClick={() => handleDelete(i)}
                  style={{
                    flexShrink: 0, minWidth: 24, height: 24,
                    color: GRAY_400, fontSize: 14,
                  }}
                >
                  ×
                </Button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, lineHeight: 1.5 }}>{task.instruction}</span>
                <span style={{
                  color: GRAY_600, flexShrink: 0, fontWeight: 500,
                  fontSize: 11,
                }}>
                  @{task.agent.name}
                </span>
              </>
            )}
          </div>
        ))}
        {editing && (
          <div
            onClick={handleAdd}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "4px 0", marginTop: 2,
              borderRadius: 4, border: `1px dashed ${GRAY_200}`,
              color: GRAY_400, fontSize: 11, cursor: "pointer",
            }}
          >
            ＋ 添加子任务
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      {editing ? (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button
            size="small"
            theme="borderless"
            onClick={handleCancelEdit}
            style={{ color: GRAY_400 }}
          >
            取消
          </Button>
          <Button
            size="small"
            onClick={handleSaveEdit}
            style={{
              background: GRAY_950, color: "#fff",
              border: "none", borderRadius: 6, fontWeight: 500,
            }}
          >
            保存修改
          </Button>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
          <Button
            size="small"
            theme="borderless"
            onClick={onRefine}
            style={{
              color: GRAY_400, fontSize: 12,
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M2 8h8M2 12h6" strokeLinecap="round"/>
            </svg>
            对话修改
          </Button>
          <Button
            size="small"
            theme="light"
            icon={<IconEdit />}
            onClick={handleStartEdit}
            style={{
              color: GRAY_600, borderColor: GRAY_200,
              borderRadius: 6, fontWeight: 500,
            }}
          >
            手动编辑
          </Button>
          <Button
            size="small"
            icon={<IconSend />}
            onClick={onConfirm}
            style={{
              background: GRAY_950, color: "#fff",
              border: "none", borderRadius: 6, fontWeight: 500,
            }}
          >
            确认执行
          </Button>
        </div>
      )}
    </div>
  );
}
