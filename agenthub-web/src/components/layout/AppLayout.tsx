import { useCallback, useRef, useState } from "react";
import { Layout, Button } from "@douyinfe/semi-ui";
import { IconMenu } from "@douyinfe/semi-icons";
import { useConversations, useCreateConversation, useAgents, useKeyboardShortcut } from "@/hooks";
import { useChatStore } from "@/stores/chatStore";
import { useUIStore } from "@/stores/uiStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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

  const triggerNewConv = useUIStore((s) => s.triggerNewConv);

  useKeyboardShortcut("n", triggerNewConv, { ctrl: true, meta: true });
  useKeyboardShortcut("f", () => {
    const wrapper = document.querySelector<HTMLElement>("[data-search-input-wrapper]");
    if (wrapper) {
      const input = wrapper.querySelector("input");
      input?.focus();
    } else {
      const toggleBtn = document.querySelector<HTMLElement>("[data-search-toggle]");
      toggleBtn?.click();
      setTimeout(() => {
        const w = document.querySelector<HTMLElement>("[data-search-input-wrapper]");
        w?.querySelector("input")?.focus();
      }, 50);
    }
  }, { ctrl: true, meta: true });

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
    <ErrorBoundary label="对话列表">
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
    </ErrorBoundary>
  );

  return (
    <Layout style={{
      height: "100%",
      display: "flex",
      flexDirection: "row",
      padding: "var(--app-padding)",
      gap: "var(--app-padding)",
      background: "var(--color-bg-app)",
    }}>
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
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-card)",
            overflow: "hidden",
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
            <ErrorBoundary label="聊天区域">
              <ChatArea conversations={conversations} />
            </ErrorBoundary>
          </Layout.Content>
        </>
      ) : (
        <>
          <div style={{
            width: convListWidth,
            flexShrink: 0,
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-card)",
            overflow: "hidden",
          }}>
            {conversationListEl}
          </div>

          <div
            ref={dragRef}
            onMouseDown={handleDragStart}
            style={{
              width: 8,
              flexShrink: 0,
              cursor: "col-resize",
              background: "transparent",
              zIndex: 5,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(51, 112, 255, 0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          />

          <Layout.Content style={{
            flex: 1,
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-card)",
            overflow: "hidden",
            background: "var(--color-bg-chat)",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}>
            <ErrorBoundary label="聊天区域">
              <ChatArea conversations={conversations} />
            </ErrorBoundary>
          </Layout.Content>
        </>
      )}
    </Layout>
  );
}
