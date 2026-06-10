import { Modal, Button } from "@douyinfe/semi-ui";

interface MentionSwitchDialogProps {
  currentAgentName: string;
  mentionedAgentNames: string[];
  onSwitchToSingle: () => void;
  onConvertToGroup: () => void;
  onIgnore: () => void;
  onClose: () => void;
}

export function MentionSwitchDialog({
  currentAgentName,
  mentionedAgentNames,
  onSwitchToSingle,
  onConvertToGroup,
  onIgnore,
  onClose,
}: MentionSwitchDialogProps) {
  const mentionedList = mentionedAgentNames.join(", ");
  const isMulti = mentionedAgentNames.length > 1;

  return (
    <Modal
      visible
      title="检测到 @提及"
      onCancel={onClose}
      footer={null}
      maskClosable
      style={{ width: 400 }}
    >
      <p style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)" }}>
        你 @ 了 <span style={{ fontWeight: 500, color: "var(--color-primary)" }}>@{mentionedList}</span>，
        但当前对话绑定的 Agent 是 <span style={{ fontWeight: 500 }}>{currentAgentName}</span>。
      </p>
      <p style={{ marginTop: 4, fontSize: "var(--font-size-md)", color: "var(--color-text-tertiary)" }}>
        你想怎么处理？
      </p>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {isMulti ? (
          <Button
            block
            theme="light"
            onClick={onConvertToGroup}
            style={{ justifyContent: "flex-start", textAlign: "left" }}
          >
            <span style={{ fontWeight: 500, color: "var(--color-primary)" }}>转为群聊</span>
            <span style={{ marginLeft: 8, color: "var(--color-text-tertiary)" }}>
              — 将 {currentAgentName} 和 {mentionedList} 加入群聊
            </span>
          </Button>
        ) : (
          <Button
            block
            theme="light"
            onClick={onSwitchToSingle}
            style={{ justifyContent: "flex-start", textAlign: "left" }}
          >
            <span style={{ fontWeight: 500, color: "var(--color-primary)" }}>切换为 @{mentionedAgentNames[0]} 的单聊</span>
            <span style={{ marginLeft: 8, color: "var(--color-text-tertiary)" }}>
              — 创建新对话并发送
            </span>
          </Button>
        )}

        {!isMulti && (
          <Button
            block
            theme="light"
            onClick={onConvertToGroup}
            style={{ justifyContent: "flex-start", textAlign: "left" }}
          >
            <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>转为群聊</span>
            <span style={{ marginLeft: 8, color: "var(--color-text-tertiary)" }}>
              — 将 {currentAgentName} 和 {mentionedList} 加入同一群聊
            </span>
          </Button>
        )}

        <Button
          block
          theme="light"
          onClick={onIgnore}
          style={{ justifyContent: "flex-start", textAlign: "left" }}
        >
          <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>仅发送给 {currentAgentName}</span>
          <span style={{ marginLeft: 8, color: "var(--color-text-tertiary)" }}>
            — 忽略 @提及，保持现有对话
          </span>
        </Button>
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button theme="borderless" onClick={onClose}>取消</Button>
      </div>
    </Modal>
  );
}
