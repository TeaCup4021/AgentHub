import { Layout } from "@douyinfe/semi-ui";
import { useConversations, useCreateConversation, useAgents } from "@/hooks";
import { useChatStore } from "@/stores/chatStore";
import { IconSidebar } from "./IconSidebar";
import { ConversationList } from "./ConversationList";
import { ChatArea } from "./ChatArea";

export function AppLayout() {
  const { data: conversationsData } = useConversations();
  const conversations = conversationsData?.list ?? [];
  const { data: agents = [] } = useAgents();
  const createConversation = useCreateConversation();
  const setActive = useChatStore((s) => s.setActiveConversation);

  return (
    <Layout style={{ height: "100%", display: "flex", flexDirection: "row" }}>
      <IconSidebar />
      <ConversationList
        conversations={conversations}
        agents={agents}
        onCreateConversation={(title, type, agentIds) => {
          createConversation.mutate(
            { title, type, agentIds },
            { onSuccess: (conv) => setActive(conv.id) },
          );
        }}
      />
      <Layout.Content style={{
        flex: 1,
        background: "var(--color-bg-chat)",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}>
        <ChatArea conversations={conversations} />
      </Layout.Content>
    </Layout>
  );
}
