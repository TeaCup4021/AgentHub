export interface SubTask {
  agentId: string;
  agentName: string;
  instruction: string;
}

interface OrchestratorPlanProps {
  planId: string;
  subtasks: SubTask[];
  onConfirm: () => void;
  onAdjust: (subtasks: SubTask[]) => void;
}

export function OrchestratorPlan({ planId, subtasks, onConfirm, onAdjust }: OrchestratorPlanProps) {
  if (subtasks.length === 0) return null;

  return (
    <div className="px-4 py-3">
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 max-w-[75%] mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span className="text-sm font-semibold text-purple-800">Orchestrator 任务拆解</span>
        </div>

        <div className="space-y-2">
          {subtasks.map((task, i) => (
            <div key={`${planId}-${i}`} className="flex items-center gap-2 text-xs text-purple-700 bg-white rounded px-3 py-2">
              <span className="w-5 h-5 rounded-full bg-purple-200 text-purple-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                {i + 1}
              </span>
              <span className="flex-1">{task.instruction}</span>
              <span className="text-purple-500 shrink-0">@{task.agentName}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <button
            type="button"
            onClick={() => onAdjust(subtasks)}
            className="rounded-md px-3 py-1 text-xs text-purple-600 hover:bg-purple-100"
          >
            调整分派
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-purple-600 px-3 py-1 text-xs text-white hover:bg-purple-700"
          >
            确认执行
          </button>
        </div>
      </div>
    </div>
  );
}
