import { useCallback, memo } from "react";
import { toast } from "sonner";
import { Button } from "@douyinfe/semi-ui";
import { IconCopy, IconQuote, IconRefresh, IconMapPin } from "@douyinfe/semi-icons";
import { useChatStore } from "@/stores/chatStore";
import { conversationApi } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { Message } from "@/types";

interface MessageActionsProps {
  message: Message;
  isStreaming?: boolean;
  isFailed?: boolean;
  onRegenerate?: (convId: string, msgId: string) => void;
}

export const MessageActions = memo(function MessageActions({ message, isStreaming, isFailed, onRegenerate }: MessageActionsProps) {
  const setPendingQuote = useChatStore((s) => s.setPendingQuote);
  const pinnedIds = useChatStore((s) => s.pinnedMessageIds);
  const addPinned = useChatStore((s) => s.addPinnedMessage);
  const removePinned = useChatStore((s) => s.removePinnedMessage);
  const isPinned = pinnedIds.includes(message.id);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      toast.success("已复制到剪贴板");
    }).catch(() => {
      toast.error("复制失败");
    });
  }, [message.content]);

  const handleQuote = useCallback(() => {
    setPendingQuote({ messageId: message.id, content: message.content });
    toast.success("已引用，在输入框中继续编辑");
  }, [message.id, message.content, setPendingQuote]);

  const handlePin = useCallback(async () => {
    const { activeConversationId } = useChatStore.getState();
    if (!activeConversationId) return;
    try {
      if (isPinned) {
        await conversationApi.unpinMessage(activeConversationId, message.id);
        removePinned(message.id);
        toast.success("已取消固定");
      } else {
        await conversationApi.pinMessage(activeConversationId, message.id);
        addPinned(message.id);
        toast.success("已固定消息");
      }
      queryClient.invalidateQueries({ queryKey: ["messages", activeConversationId] });
      queryClient.invalidateQueries({ queryKey: ["pins", activeConversationId] });
    } catch {
      toast.error("操作失败");
    }
  }, [isPinned, message.id, addPinned, removePinned]);

  if (isStreaming) return null;

  if (isFailed) {
    return (
      <div style={{ marginTop: 4, textAlign: "right" }}>
        <Button
          size="small"
          theme="borderless"
          type="danger"
          icon={<IconRefresh />}
          onClick={() => {
            const { activeConversationId } = useChatStore.getState();
            if (activeConversationId && onRegenerate) {
              onRegenerate(activeConversationId, message.id);
            }
          }}
        >
          重新生成
        </Button>
      </div>
    );
  }

  return (
    <div
      className="message-actions"
      style={{
        position: "absolute",
        bottom: -28,
        right: 0,
        display: "flex",
        gap: 2,
        opacity: 0,
        transition: "opacity 150ms ease",
        zIndex: 5,
      }}
    >
      <Button
        size="small"
        theme="borderless"
        icon={<IconCopy />}
        onClick={handleCopy}
        style={{ color: "var(--color-text-tertiary)" }}
      />
      <Button
        size="small"
        theme="borderless"
        icon={<IconQuote />}
        onClick={handleQuote}
        style={{ color: "var(--color-text-tertiary)" }}
      />
      <Button
        size="small"
        theme="borderless"
        icon={<IconMapPin />}
        onClick={handlePin}
        style={{ color: isPinned ? "var(--color-primary)" : "var(--color-text-tertiary)" }}
      />
    </div>
  );
});
