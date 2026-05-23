import type { Conversation, Agent } from "@/types";

interface ChatHeaderProps {
  conversation: Conversation;
  agents: Agent[];
}

export function ChatHeader({ conversation, agents }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{conversation.title}</h2>
        {conversation.type === "group" && (
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-600">群聊</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {conversation.agentIds.map((aid) => {
          const agent = agents.find((a) => a.id === aid);
          return agent ? (
            <span key={aid} className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] text-gray-600">
              {agent.name}
            </span>
          ) : null;
        })}
      </div>
    </div>
  );
}
