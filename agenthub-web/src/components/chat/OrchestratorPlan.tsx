import { useState } from "react";
import { Button, TextArea, Tag } from "@douyinfe/semi-ui";
import { IconEdit, IconPlus, IconSend } from "@douyinfe/semi-icons";
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

function copyPlan(task: PlanSubtask): PlanSubtask {
  return {
    ...task,
    recommended_capabilities: [...(task.recommended_capabilities ?? [])],
    acceptance_criteria: [...(task.acceptance_criteria ?? [])],
    depends_on: [...(task.depends_on ?? [])],
  };
}

function StageMeta({ task }: { task: PlanSubtask }) {
  const caps = task.recommended_capabilities ?? [];
  const criteria = task.acceptance_criteria ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 5 }}>
      <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
        <Tag size="small" color={task.can_parallel === false ? "orange" : "green"}>
          {task.can_parallel === false ? "Sequential" : "Parallel OK"}
        </Tag>
        {caps.length > 0 ? (
          caps.map((cap) => (
            <Tag key={cap} size="small" color="blue">
              {cap}
            </Tag>
          ))
        ) : (
          <Tag size="small" color="grey">
            Capability TBD
          </Tag>
        )}
      </div>
      {criteria.length > 0 && (
        <div style={{ color: GRAY_400, fontSize: 11, lineHeight: 1.45 }}>
          Acceptance: {criteria.join("; ")}
        </div>
      )}
    </div>
  );
}

export function OrchestratorPlan({
  planId,
  subtasks: initialSubtasks,
  plannerAgentName,
  onConfirm,
  onAdjust,
  onRefine,
}: OrchestratorPlanProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PlanSubtask[]>(() => initialSubtasks.map(copyPlan));

  if (initialSubtasks.length === 0) return null;

  const planBy = plannerAgentName ? `Planned by @${plannerAgentName}` : "Planned by default Orchestrator";

  const handleStartEdit = () => {
    setDraft(initialSubtasks.map(copyPlan));
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSaveEdit = () => {
    onAdjust?.(draft);
    setEditing(false);
  };

  const handleUpdateInstruction = (i: number, instruction: string) => {
    setDraft((prev) => prev.map((t, idx) => (idx === i ? { ...t, instruction } : t)));
  };

  const handleDelete = (i: number) => {
    setDraft((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleAdd = () => {
    const newId = `stage-${Date.now()}`;
    setDraft((prev) => [
      ...prev,
      {
        subtask_id: newId,
        instruction: "",
        recommended_capabilities: [],
        acceptance_criteria: [],
        can_parallel: true,
        depends_on: [],
        priority: prev.length + 1,
      },
    ]);
  };

  const taskRows = editing ? draft : initialSubtasks;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <PlanIcon />
        <span style={{ fontSize: 13, fontWeight: 600, color: GRAY_950 }}>Execution Plan</span>
        {editing && (
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            color: GRAY_400,
            background: GRAY_200,
            borderRadius: 3,
            padding: "1px 6px",
          }}>
            Editing
          </span>
        )}
      </div>

      <div style={{
        fontSize: 11,
        color: GRAY_400,
        marginBottom: 6,
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}>
        <span>{planBy}</span>
        <span>/</span>
        <span>{initialSubtasks.length} stages</span>
        <span style={{
          fontSize: 10,
          fontWeight: 500,
          color: GRAY_600,
          background: GRAY_200,
          borderRadius: 3,
          padding: "1px 5px",
        }}>
          Dynamic assignment
        </span>
      </div>

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
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <span>Review the staged plan. Agents are assigned after confirmation.</span>
      </div>

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
            key={editing ? i : `${planId}-${task.subtask_id || i}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 12,
              color: GRAY_600,
              background: editing ? "#fff" : "transparent",
              borderRadius: 5,
              padding: editing ? "6px 8px" : "6px 0",
              borderBottom: editing ? "none" : i < taskRows.length - 1 ? `1px solid ${GRAY_100}` : "none",
            }}
          >
            <span style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              marginTop: 2,
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
                <AgentConfigPreviewCard
                  artifact={{
                    id: task.subtask_id,
                    artifactType: "code" as const,
                    content: task.agent_config as unknown as Record<string, unknown>,
                    version: 1,
                    createdAt: new Date().toISOString(),
                  }}
                />
              </div>
            ) : editing ? (
              <>
                <TextArea
                  value={task.instruction}
                  onChange={(v) => handleUpdateInstruction(i, v)}
                  rows={2}
                  autosize
                  style={{ flex: 1, fontSize: 12 }}
                />
                <Button
                  size="small"
                  theme="borderless"
                  onClick={() => handleDelete(i)}
                  style={{
                    flexShrink: 0,
                    minWidth: 24,
                    height: 24,
                    color: GRAY_400,
                    fontSize: 14,
                  }}
                >
                  x
                </Button>
              </>
            ) : (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ lineHeight: 1.5, color: GRAY_600 }}>{task.instruction}</div>
                <StageMeta task={task} />
              </div>
            )}
          </div>
        ))}
        {editing && (
          <button
            type="button"
            onClick={handleAdd}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "4px 0",
              marginTop: 2,
              borderRadius: 4,
              border: `1px dashed ${GRAY_200}`,
              background: "transparent",
              color: GRAY_400,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            <IconPlus size="small" />
            Add stage
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button size="small" theme="borderless" onClick={handleCancelEdit} style={{ color: GRAY_400 }}>
            Cancel
          </Button>
          <Button
            size="small"
            onClick={handleSaveEdit}
            style={{
              background: GRAY_950,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontWeight: 500,
            }}
          >
            Save
          </Button>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Button
            size="small"
            theme="borderless"
            onClick={onRefine}
            style={{
              color: GRAY_400,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M2 8h8M2 12h6" strokeLinecap="round" />
            </svg>
            Refine
          </Button>
          <Button
            size="small"
            theme="light"
            icon={<IconEdit />}
            onClick={handleStartEdit}
            style={{
              color: GRAY_600,
              borderColor: GRAY_200,
              borderRadius: 6,
              fontWeight: 500,
            }}
          >
            Edit
          </Button>
          <Button
            size="small"
            icon={<IconSend />}
            onClick={onConfirm}
            style={{
              background: GRAY_950,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontWeight: 500,
            }}
          >
            Confirm
          </Button>
        </div>
      )}
    </div>
  );
}
