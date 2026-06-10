import { Popover, Button } from "@douyinfe/semi-ui";
import { IconAt } from "@douyinfe/semi-icons";
import { useChatStore } from "@/stores/chatStore";

interface AgentAvatarContextMenuProps {
  agentName: string;
  position: { top: number; left: number };
  onClose: () => void;
}

export function AgentAvatarContextMenu({ agentName, position, onClose }: AgentAvatarContextMenuProps) {
  const setPendingMention = useChatStore((s) => s.setPendingMention);

  return (
    <Popover
      visible
      trigger="custom"
      position="bottomLeft"
      onClickOutSide={onClose}
      content={
        <div style={{ minWidth: 160, padding: 4 }}>
          <Button
            theme="borderless"
            block
            icon={<IconAt />}
            onClick={() => {
              setPendingMention(agentName);
              onClose();
            }}
            style={{ justifyContent: "flex-start" }}
          >
            提及 @{agentName}
          </Button>
        </div>
      }
    >
      <div style={{ position: "fixed", top: position.top, left: position.left, width: 0, height: 0 }} />
    </Popover>
  );
}
