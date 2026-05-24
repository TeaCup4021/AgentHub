import { useEffect, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import type { Agent } from "@/types";

interface AgentDetailPopoverProps {
  agent: Agent;
  position: { top: number; left: number };
  onClose: () => void;
}

export function AgentDetailPopover({ agent, position, onClose }: AgentDetailPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const setPendingMention = useChatStore((s) => s.setPendingMention);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleMention = () => {
    setPendingMention(agent.name);
    onClose();
  };

  return (
    <div
      ref={ref}
      className="fixed z-40 w-64 rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm font-medium text-white">
          {agent.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{agent.name}</p>
          <p className="truncate text-xs text-gray-500">{agent.model}</p>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-gray-500">提供商</span>
          <span className="rounded bg-gray-100 px-2 py-0.5 font-medium">{agent.provider}</span>
        </div>
        <div>
          <span className="text-gray-500">能力</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {agent.capabilities.map((c) => (
              <span key={c} className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{c}</span>
            ))}
          </div>
        </div>
        {agent.systemPrompt && (
          <div>
            <span className="text-gray-500">系统提示词</span>
            <p className="mt-0.5 text-gray-600 line-clamp-3">{agent.systemPrompt}</p>
          </div>
        )}
      </div>

      <button
        onClick={handleMention}
        className="mt-3 w-full rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
      >
        提及此 Agent
      </button>
    </div>
  );
}
