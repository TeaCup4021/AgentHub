import { useChatStore } from "@/stores/chatStore";
import { CardRenderer } from "@/components/cards";
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
            return <CardRenderer key={i} content={c} />;
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
            return <CardRenderer key={i} content={c} />;
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
