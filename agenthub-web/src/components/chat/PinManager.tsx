import { useState, useEffect, useCallback } from "react";
import { Popover, Button, Spin, Empty } from "@douyinfe/semi-ui";
import { IconBookmark, IconDeleteStroked } from "@douyinfe/semi-icons";
import { conversationApi } from "@/lib/api";
import type { PinInfo } from "@/types";

interface PinManagerProps {
  conversationId: string;
  onJumpToMessage?: (messageId: string) => void;
  onPinChanged?: () => void;
}

export function PinManager({
  conversationId,
  onJumpToMessage,
  onPinChanged,
}: PinManagerProps) {
  const [pins, setPins] = useState<PinInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPins = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const res = await conversationApi.getPins(conversationId);
      const data = (res.data.data ?? []) as PinInfo[];
      setPins(Array.isArray(data) ? data : []);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    loadPins();
  }, [loadPins]);

  const handleUnpin = async (messageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await conversationApi.unpinMessage(conversationId, messageId);
      setPins((prev) => prev.filter((p) => p.message_id !== messageId));
      onPinChanged?.();
    } catch {
      // silently ignore
    }
  };

  const content = (
    <div style={{ width: 320, maxHeight: 360, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "8px 12px",
          fontSize: "var(--font-size-sm)",
          fontWeight: 600,
          color: "var(--color-text-primary)",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        已 Pin 消息 ({pins.length})
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
            <Spin size="small" />
          </div>
        ) : pins.length === 0 ? (
          <Empty description="暂无 Pin 消息" style={{ padding: 16 }} />
        ) : (
          pins.map((pin) => (
            <div
              key={pin.pin_id}
              onClick={() => onJumpToMessage?.(pin.message_id)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 10px",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                transition: "background var(--duration-fast)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--color-bg-hover)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <IconBookmark
                style={{
                  color: "var(--color-warning)",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pin.content_preview || "(empty)"}
                </p>
                <span
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-text-disabled)",
                  }}
                >
                  {pin.sender_type === "user" ? "You" : "Agent"}
                  {" · "}
                  {pin.pinned_at
                    ? new Date(pin.pinned_at).toLocaleString()
                    : ""}
                </span>
              </div>
              <Button
                size="small"
                theme="borderless"
                type="tertiary"
                icon={<IconDeleteStroked />}
                onClick={(e) => handleUnpin(pin.message_id, e)}
                style={{ flexShrink: 0 }}
              />
            </div>
          ))
        )}
      </div>
      <div
        style={{
          padding: "6px 12px",
          fontSize: "var(--font-size-xs)",
          color: "var(--color-text-disabled)",
          borderTop: "1px solid var(--color-border-light)",
          textAlign: "center",
        }}
      >
        Pin 的消息自动注入到每次对话上下文
      </div>
    </div>
  );

  return (
    <Popover
      trigger="click"
      position="bottomRight"
      content={content}
      onClickOutSide={() => {}}
      onVisibleChange={(visible) => {
        if (visible) loadPins();
      }}
    >
      <Button
        size="small"
        theme="borderless"
        icon={<IconBookmark />}
        style={{
          color: pins.length > 0 ? "var(--color-warning)" : "var(--color-text-tertiary)",
          position: "relative",
        }}
      >
        {pins.length > 0 && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 14,
              height: 14,
              borderRadius: 7,
              background: "var(--color-warning)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {pins.length}
          </span>
        )}
      </Button>
    </Popover>
  );
}
