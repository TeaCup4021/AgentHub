import { useConversations, useCreateConversation } from "@/hooks";
import { useChatStore } from "@/stores/chatStore";
import { Sidebar } from "./Sidebar";
import { ChatArea } from "./ChatArea";

export function AppLayout() {
  const { data: conversations = [] } = useConversations();
  const createConversation = useCreateConversation();
  const setActive = useChatStore((s) => s.setActiveConversation);

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0">
        <Sidebar
          conversations={conversations}
          onCreateConversation={(title, type, agentIds) => {
            createConversation.mutate({ title, type, agentIds }, { onSuccess: (conv) => setActive(conv.id) });
          }}
        />
      </div>
      <main className="flex-1 bg-chat-bg">
        <ChatArea conversations={conversations} />
      </main>
    </div>
  );
}
