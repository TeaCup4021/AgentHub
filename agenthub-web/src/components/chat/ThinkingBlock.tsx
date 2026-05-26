import { useState, useEffect } from "react";
import type { ThinkingStep } from "@/types";

interface ThinkingBlockProps {
  steps: ThinkingStep[];
  isStreaming?: boolean;
}

const phaseConfig: Record<ThinkingStep["phase"], { color: string; bg: string; border: string; label: string }> = {
  thought: { color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", label: "思考" },
  action: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", label: "行动" },
  observation: { color: "text-green-700", bg: "bg-green-50", border: "border-green-200", label: "观察" },
};

const statusDot: Record<string, string> = {
  pending: "bg-gray-300",
  running: "bg-blue-400 animate-pulse",
  done: "bg-emerald-500",
  error: "bg-red-500",
};

function PhaseIcon({ phase }: { phase: ThinkingStep["phase"] }) {
  switch (phase) {
    case "thought":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
          <path d="M12 2a7 7 0 017 7c0 2.4-1.2 4.5-3 5.7V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.3c-1.8-1.2-3-3.3-3-5.7a7 7 0 017-7z" />
          <circle cx="9" cy="10" r="1" fill="currentColor" />
          <circle cx="15" cy="10" r="1" fill="currentColor" />
          <path d="M10 14h4" />
        </svg>
      );
    case "action":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
          <path d="M14.7 6.3a1 1 0 000-1.4l-1.4-1.4a1 1 0 00-1.4 0l-1.4 1.4a1 1 0 000 1.4l1.4 1.4a1 1 0 001.4 0l1.4-1.4z" />
          <path d="M6.3 14.7a1 1 0 000 1.4l1.4 1.4a1 1 0 001.4 0l1.4-1.4a1 1 0 000-1.4l-1.4-1.4a1 1 0 00-1.4 0l-1.4 1.4z" />
          <path d="M21 7l-8.6 8.6" />
        </svg>
      );
    case "observation":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

export function ThinkingBlock({ steps, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isStreaming) setExpanded(true);
  }, [isStreaming]);

  if (steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <div className="my-2 rounded-lg border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-gray-500">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="text-xs font-medium text-gray-700 flex-1 text-left">
          {isStreaming ? "推理中..." : `推理过程 (${doneCount}/${steps.length} 步)`}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 py-2 space-y-2">
          {steps.map((step, i) => {
            const cfg = phaseConfig[step.phase];
            return (
              <div key={i} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                <span className="shrink-0 mt-0.5"><PhaseIcon phase={step.phase} /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{cfg.label}</span>
                    {step.toolName && (
                      <span className="rounded bg-white/60 px-1 text-[10px] font-mono">{step.toolName}</span>
                    )}
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[step.status ?? "pending"]}`} />
                  </div>
                  <p className="mt-0.5 text-gray-600 whitespace-pre-wrap">{step.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
