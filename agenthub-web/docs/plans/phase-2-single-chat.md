## Phase 2: P0 单聊核心链路

### Task 2.1: 重构 ChatArea — 拆分为 ChatHeader + MessageList + ChatInput

**Files:**
- Create: `src/components/chat/ChatHeader.tsx`
- Create: `src/components/chat/MessageList.tsx`
- Create: `src/components/chat/ChatInput.tsx`
- Create: `src/components/chat/index.ts`
- Modify: `src/components/layout/ChatArea.tsx`

- [ ] **Step 1: 创建 ChatHeader**

```typescript
// src/components/chat/ChatHeader.tsx
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
```

- [ ] **Step 2: 创建 MessageList（含流式消息渲染 + Pending 状态）**

```typescript
// src/components/chat/MessageList.tsx
import { useChatStore } from "@/stores/chatStore";
import type { Message } from "@/types";

function TextBubble({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap">{text}</p>;
}

function StreamingTextBubble({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap">
      {text}
      <span className="ml-0.5 inline-block w-1.5 h-4 bg-blue-500 animate-pulse align-text-bottom" />
    </p>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 px-4 py-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${
        isUser ? "bg-blue-500" : "bg-emerald-500"}`}>
        {isUser ? "我" : (message.agentName || "A").charAt(0)}
      </div>
      <div className={`max-w-[75%] ${isUser ? "text-right" : ""}`}>
        {!isUser && <p className="mb-1 text-xs font-medium text-gray-500">{message.agentName || "Agent"}</p>}
        <div className={`inline-block rounded-2xl px-4 py-2 text-sm leading-relaxed ${
          isUser ? "bg-chat-bubble-user text-gray-900" : "bg-chat-bubble-agent text-gray-800"}`}>
          {message.content.map((c, i) => {
            if (c.type === "text") return <TextBubble key={i} text={c.text} />;
            if (c.type === "code") {
              return (
                <div key={i} className="my-2 overflow-hidden rounded-md bg-gray-900 text-left">
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-xs text-gray-400">{c.fileName || c.language}</span>
                    <button className="text-xs text-gray-400 hover:text-gray-200"
                      onClick={() => navigator.clipboard.writeText(c.code)}>复制</button>
                  </div>
                  <pre className="overflow-x-auto px-3 pb-3 text-xs text-gray-200"><code>{c.code}</code></pre>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}

function StreamingMessageBubble({ messageId, agentName }: { messageId: string; agentName: string }) {
  const content = useChatStore((s) => s.streamingContent[messageId] || []);
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-medium text-white">
        {(agentName || "A").charAt(0)}
      </div>
      <div className="max-w-[75%]">
        <p className="mb-1 text-xs font-medium text-gray-500">{agentName || "Agent"}</p>
        <div className="inline-block rounded-2xl px-4 py-2 text-sm leading-relaxed bg-chat-bubble-agent text-gray-800">
          {content.map((c, i) => {
            if (c.type === "text") return <StreamingTextBubble key={i} text={c.text} />;
            if (c.type === "code") {
              return (
                <div key={i} className="my-2 overflow-hidden rounded-md bg-gray-900 text-left">
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-xs text-gray-400">{c.fileName || c.language}</span>
                    <button className="text-xs text-gray-400 hover:text-gray-200"
                      onClick={() => navigator.clipboard.writeText(c.code)}>复制</button>
                  </div>
                  <pre className="overflow-x-auto px-3 pb-3 text-xs text-gray-200"><code>{c.code}</code></pre>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}

function PendingMessageBubble() {
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-medium text-white">A</div>
      <div className="max-w-[75%]">
        <div className="inline-block rounded-2xl px-4 py-2 bg-chat-bubble-agent">
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        </div>
      </div>
    </div>
  );
}

interface MessageListProps {
  messages: Message[];
  streamingMessageId?: string | null;
  streamingAgentName?: string;
  isWaiting?: boolean;
}

export function MessageList({ messages, streamingMessageId, streamingAgentName, isWaiting }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
      {streamingMessageId && streamingAgentName && (
        <StreamingMessageBubble messageId={streamingMessageId} agentName={streamingAgentName} />
      )}
      {isWaiting && !streamingMessageId && <PendingMessageBubble />}
    </div>
  );
}
```

- [ ] **Step 3: 创建 ChatInput**

```typescript
// src/components/chat/ChatInput.tsx
import { useState, useCallback, useRef, useEffect } from "react";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!disabled) textareaRef.current?.focus(); }, [disabled]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [text, disabled, onSend]);

  return (
    <div className="border-t border-gray-200 p-4">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef} rows={1} value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行, @ 提及Agent)"
          disabled={disabled}
          className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-400 disabled:bg-gray-100"
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 200) + "px";
          }}
        />
        <button onClick={handleSend} disabled={disabled || !text.trim()}
          className="rounded-lg bg-blue-600 p-2.5 text-white hover:bg-blue-700 disabled:opacity-50">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 创建 chat barrel 导出**

```typescript
// src/components/chat/index.ts
export { ChatHeader } from "./ChatHeader";
export { MessageList } from "./MessageList";
export { ChatInput } from "./ChatInput";
```

- [ ] **Step 5: 重写 ChatArea.tsx — 对接真实 API + SSE 流式**

```typescript
// src/components/layout/ChatArea.tsx
import { useCallback, useRef, useEffect } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useMessages } from "@/hooks/useMessages";
import { useAgents } from "@/hooks/useAgents";
import { createSSEStream } from "@/lib/sse";
import { messageApi } from "@/lib/api";
import { ChatHeader, MessageList, ChatInput } from "@/components/chat";
import type { SSEMessageStart, SSEToken, SSEArtifact, SSEMessageEnd, SSEError, MessageContent, Conversation } from "@/types";

interface ChatAreaProps {
  conversations: Conversation[];
}

export function ChatArea({ conversations }: ChatAreaProps) {
  const activeId = useChatStore((s) => s.activeConversationId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const setIsStreaming = useChatStore((s) => s.setIsStreaming);
  const initStreaming = useChatStore((s) => s.initStreamingMessage);
  const appendToken = useChatStore((s) => s.appendStreamToken);
  const appendArtifact = useChatStore((s) => s.appendStreamArtifact);
  const finalizeStreaming = useChatStore((s) => s.finalizeStreamingMessage);

  const disconnectRef = useRef<(() => void) | null>(null);
  const streamMsgIdRef = useRef<string | null>(null);
  const streamAgentRef = useRef<string>("");

  const { data: rawMessages = [] } = useMessages(activeId);
  const { data: agents = [] } = useAgents();

  const conversation = conversations.find((c) => c.id === activeId);

  useEffect(() => { return () => disconnectRef.current?.(); }, [activeId]);

  const handleSend = useCallback(async (content: string) => {
    if (!activeId) return;
    try {
      await messageApi.send(activeId, { content, mode: "direct" });
    } catch (err) {
      console.error("消息发送失败:", err);
      setIsStreaming(false);
      return;
    }

    disconnectRef.current?.();
    setIsStreaming(true);

    disconnectRef.current = createSSEStream(activeId, {
      onMessageStart: (data: SSEMessageStart) => {
        streamMsgIdRef.current = data.message_id;
        streamAgentRef.current = data.sender.name;
        initStreaming(data.message_id);
      },
      onToken: (data: SSEToken) => {
        if (streamMsgIdRef.current) appendToken(streamMsgIdRef.current, data.delta);
      },
      onArtifact: (data: SSEArtifact) => {
        if (streamMsgIdRef.current) {
          appendArtifact(streamMsgIdRef.current, mapArtifactToContent(data.artifact));
        }
      },
      onMessageEnd: (_data: SSEMessageEnd) => {
        if (streamMsgIdRef.current) {
          finalizeStreaming(streamMsgIdRef.current);
          streamMsgIdRef.current = null;
        }
        setIsStreaming(false);
      },
      onError: (data: SSEError) => {
        console.error("SSE 错误:", data.message);
        setIsStreaming(false);
      },
    });
  }, [activeId, setIsStreaming, initStreaming, appendToken, appendArtifact, finalizeStreaming]);

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-400">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 opacity-40">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        <p className="text-lg">选择或创建一个对话开始</p>
        <p className="mt-1 text-sm">与 AI Agent 协作，生成代码、文档和更多产出</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader conversation={conversation} agents={agents} />
      <MessageList
        messages={rawMessages}
        streamingMessageId={streamMsgIdRef.current}
        streamingAgentName={streamAgentRef.current}
        isWaiting={isStreaming && !streamMsgIdRef.current}
      />
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}

function mapArtifactToContent(artifact: import("@/types").Artifact): MessageContent {
  switch (artifact.type) {
    case "code": {
      const c = artifact.content as import("@/types").CodeArtifactContent;
      return { type: "code", language: c.language, code: c.code, fileName: c.fileName };
    }
    case "diff": {
      const c = artifact.content as import("@/types").DiffArtifactContent;
      return { type: "diff", language: c.language, oldCode: c.oldCode, newCode: c.newCode, fileName: c.fileName };
    }
    case "preview": {
      const c = artifact.content as import("@/types").PreviewArtifactContent;
      return { type: "preview", url: c.url, title: c.title, previewType: c.previewType };
    }
    case "file": {
      const c = artifact.content as import("@/types").FileArtifactContent;
      return { type: "file", fileName: c.fileName, fileUrl: c.fileUrl, fileType: c.fileType, fileSize: c.fileSize };
    }
    case "deploy_status": {
      const c = artifact.content as import("@/types").DeployStatusArtifactContent;
      return { type: "deploy_status", status: c.status, url: c.url };
    }
    default:
      return { type: "text", text: JSON.stringify(artifact.content) };
  }
}
```

---

### Task 2.2: 重构 AppLayout — 数据获取层 + 向下传递

**Files:**
- Modify: `src/components/layout/AppLayout.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: 重写 AppLayout**

```typescript
// src/components/layout/AppLayout.tsx
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
```

- [ ] **Step 2: 重写 Sidebar — 接受 props 替代直接从 store 取数据**

```typescript
// src/components/layout/Sidebar.tsx
import { useState, useCallback, useMemo } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useUIStore } from "@/stores/uiStore";
import { useUpdateConversation, useDeleteConversation } from "@/hooks";
import { formatRelativeTime, truncate } from "@/lib/utils";
import type { Conversation } from "@/types";

interface SidebarProps {
  conversations: Conversation[];
  onCreateConversation: (title: string, type: "single" | "group", agentIds: string[]) => void;
}

export function Sidebar({ conversations, onCreateConversation }: SidebarProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const activeId = useChatStore((s) => s.activeConversationId);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return conversations
      .filter((c) => !c.isArchived && (!q || c.title.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
      });
  }, [conversations, searchQuery]);

  const handleNewConversation = useCallback(() => {
    if (!newTitle.trim()) return;
    onCreateConversation(newTitle.trim(), "single", ["agent-claude-code"]);
    setNewTitle("");
    setShowNewDialog(false);
  }, [newTitle, onCreateConversation]);

  return (
    <aside className="flex h-full flex-col border-r border-gray-200 bg-sidebar-bg">
      <div className="flex items-center gap-2 px-4 py-3">
        <button onClick={toggleSidebar} className="rounded-md p-1.5 text-gray-500 hover:bg-sidebar-hover" title="收起侧边栏">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="flex-1 text-base font-semibold">AgentHub</h1>
        <button onClick={() => setShowNewDialog(true)} className="rounded-md p-1.5 text-gray-500 hover:bg-sidebar-hover" title="新建对话">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="px-3 pb-3">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索对话..."
            className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            {searchQuery ? "没有找到匹配的对话" : "暂无对话，点击 + 创建"}
          </p>
        ) : (
          filtered.map((conv) => (
            <button key={conv.id} onClick={() => setActiveConversation(conv.id)}
              className={`w-full px-4 py-3 text-left transition-colors ${conv.id === activeId ? "bg-sidebar-active" : "hover:bg-sidebar-hover"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {conv.isPinned && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-gray-400">
                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                      </svg>
                    )}
                    <span className="truncate text-sm font-medium">{truncate(conv.title, 20)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {conv.type === "group" && <span className="mr-1 rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-600">群聊</span>}
                    {conv.lastMessage ? truncate(conv.lastMessage, 30) : "新对话"}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-gray-400">{formatRelativeTime(conv.lastActiveAt)}</span>
              </div>
            </button>
          ))
        )}
      </nav>

      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowNewDialog(false)}>
          <div className="w-96 rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">新建对话</h2>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNewConversation()}
              placeholder="输入对话标题..." autoFocus
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowNewDialog(false)} className="rounded-md px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">取消</button>
              <button onClick={handleNewConversation} disabled={!newTitle.trim()}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">创建</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
```

---

### Task 2.3: 提交 Phase 1+2

```bash
cd agenthub-web && npx tsc -b --noEmit
# 修复所有类型错误后:

git add agenthub-web/src/
git commit -m "feat: Phase 1+2 — 类型对齐、React Query hooks、SSE 重构、单聊链路"
```

---

