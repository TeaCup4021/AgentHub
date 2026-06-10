import { Popover, Button } from "@douyinfe/semi-ui";
import { IconBookmark, IconBookmarkDeleteStroked } from "@douyinfe/semi-icons";

interface MessageContextMenuProps {
  isPinned: boolean;
  position: { top: number; left: number };
  onPin: () => void;
  onUnpin: () => void;
  onClose: () => void;
}

export function MessageContextMenu({
  isPinned,
  position,
  onPin,
  onUnpin,
  onClose,
}: MessageContextMenuProps) {
  return (
    <Popover
      visible
      trigger="custom"
      position="bottomLeft"
      onClickOutSide={onClose}
      content={
        <div style={{ minWidth: 140, padding: 4 }}>
          {isPinned ? (
            <Button
              theme="borderless"
              block
              type="danger"
              icon={<IconBookmarkDeleteStroked />}
              onClick={() => {
                onUnpin();
                onClose();
              }}
              style={{ justifyContent: "flex-start" }}
            >
              取消 Pin
            </Button>
          ) : (
            <Button
              theme="borderless"
              block
              icon={<IconBookmark />}
              onClick={() => {
                onPin();
                onClose();
              }}
              style={{ justifyContent: "flex-start" }}
            >
              Pin 为长期上下文
            </Button>
          )}
        </div>
      }
    >
      <div
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          width: 0,
          height: 0,
        }}
      />
    </Popover>
  );
}
