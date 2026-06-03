import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, Button, Empty, Spin } from "@douyinfe/semi-ui";
import { IconMapPin, IconClose } from "@douyinfe/semi-icons";
import { conversationApi } from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { toast } from "sonner";
import type { PinnedMessage } from "@/types";

interface PinnedMessagesProps {
  conversationId: string;
  onJumpTo: (messageId: string) => void;
}

export function PinnedMessages({ conversationId, onJumpTo }: PinnedMessagesProps) {
  const [visible, setVisible] = useState(false);
  const pinnedIds = useChatStore((s) => s.pinnedMessageIds);
  const removePinned = useChatStore((s) => s.removePinnedMessage);

  const { data, isLoading } = useQuery({
    queryKey: ["pins", conversationId],
    queryFn: () => conversationApi.getPins(conversationId),
    enabled: visible,
  });

  const pins = data?.data?.data ?? [];

  const handleUnpin = useCallback(async (messageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await conversationApi.unpinMessage(conversationId, messageId);
      removePinned(messageId);
      toast.success("已取消固定");
    } catch {
      toast.error("取消固定失败");
    }
  }, [conversationId, removePinned]);

  const content = (
    <div style={{ width: 300, maxHeight: 360, overflowY: "auto" }}>
      {isLoading ? (
        <div style={{ padding: 24, textAlign: "center" }}><Spin /></div>
      ) : pins.length === 0 ? (
        <Empty title="暂无固定消息" description="右键消息可将其固定为上下文" />
      ) : (
        pins.map((pin: PinnedMessage) => (
          <div
            key={pin.messageId}
            onClick={() => { onJumpTo(pin.messageId); setVisible(false); }}
            style={{
              padding: "10px 12px",
              cursor: "pointer",
              borderBottom: "1px solid var(--color-border-light)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--color-text-tertiary)",
                marginBottom: 4,
              }}>
                {pin.senderName}
              </div>
              <div style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {pin.content}
              </div>
            </div>
            <Button
              icon={<IconClose />}
              theme="borderless"
              size="small"
              onClick={(e) => handleUnpin(pin.messageId, e)}
            />
          </div>
        ))
      )}
    </div>
  );

  if (pinnedIds.length === 0) return null;

  return (
    <Popover
      content={content}
      trigger="click"
      position="bottomRight"
      visible={visible}
      onVisibleChange={setVisible}
    >
      <Button
        size="small"
        theme="light"
        icon={<IconMapPin />}
        style={{ fontSize: 12 }}
      >
        已固定 ({pinnedIds.length})
      </Button>
    </Popover>
  );
}
