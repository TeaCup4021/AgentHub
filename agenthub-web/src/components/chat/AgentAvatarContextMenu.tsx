import { useEffect, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";

interface AgentAvatarContextMenuProps {
  agentName: string;
  position: { top: number; left: number };
  onClose: () => void;
}

export function AgentAvatarContextMenu({ agentName, position, onClose }: AgentAvatarContextMenuProps) {
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

  return (
    <div
      ref={ref}
      className="fixed z-40 w-44 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
      style={{ top: position.top, left: position.left }}
    >
      <button
        onClick={() => {
          setPendingMention(agentName);
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
      >
        提及 @{agentName}
      </button>
    </div>
  );
}
