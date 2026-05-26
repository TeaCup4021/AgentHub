import { useCallback, useRef, useState } from "react";
import { Layout, Button } from "@douyinfe/semi-ui";
import { IconMenu } from "@douyinfe/semi-icons";
import { useConversations, useCreateConversation, useAgents } from "@/hooks";
import { useChatStore } from "@/stores/chatStore";
import { useUIStore } from "@/stores/uiStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { IconSidebar } from "./IconSidebar";
import { ConversationList } from "./ConversationList";
import { ChatArea } from "./ChatArea";

export function AppLayout() {
  const { data: conversationsData, isLoading } = useConversations();
  const conversations = conversationsData?.list ?? [];
  const { data: agents = [] } = useAgents();
  const createConversation = useCreateConversation();
  const setActive = useChatStore((s) => s.setActiveConversation);

  const isMobile = useMediaQuery("(max-width: 767px)");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const dragRef = useRef<HTMLDivElement>(null);
  const convListWidth = useUIStore((s) => s.sidebarWidth);
  const setConvListWidth = useUIStore((s) => s.setSidebarWidth);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = convListWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const next = Math.min(500, Math.max(200, startWidth + delta));
      setConvListWidth(next);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      try { localStorage.setItem("agenthub-conv-width", String(useUIStore.getState().sidebarWidth)); } catch { /* */ }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [convListWidth, setConvListWidth]);

  const conversationListEl = (
    <ConversationList
      conversations={conversations}
      agents={agents}
      isLoading={isLoading}
      onCreateConversation={(title, type, agentIds) => {
        createConversation.mutate(
          { title, type, agentIds },
          { onSuccess: (conv) => { setActive(conv.id); setMobileDrawerOpen(false); } },
        );
      }}
    />
  );

  return (
    <Layout style={{ height: "100%", display: "flex", flexDirection: "row" }}>
      <IconSidebar />

      {isMobile ? (
        <>
          {mobileDrawerOpen && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 50,
                background: "var(--color-bg-mask)",
              }}
              onClick={() => setMobileDrawerOpen(false)}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: Math.min(convListWidth, window.innerWidth - 60),
                  zIndex: 51,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {conversationListEl}
              </div>
            </div>
          )}
          <Layout.Content style={{
            flex: 1,
            background: "var(--color-bg-chat)",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              padding: "4px 16px",
              borderBottom: "1px solid var(--color-border-light)",
              background: "var(--color-bg-elevated)",
            }}>
              <Button
                icon={<IconMenu />}
                theme="borderless"
                onClick={() => setMobileDrawerOpen(true)}
              />
            </div>
            <ChatArea conversations={conversations} />
          </Layout.Content>
        </>
      ) : (
        <>
          <div style={{ width: convListWidth, flexShrink: 0 }}>
            {conversationListEl}
          </div>

          <div
            ref={dragRef}
            onMouseDown={handleDragStart}
            style={{
              width: 4,
              flexShrink: 0,
              cursor: "col-resize",
              background: "transparent",
              transition: "background var(--duration-fast) var(--ease-out)",
              zIndex: 5,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
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
        </>
      )}
    </Layout>
  );
}
