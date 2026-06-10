import { Popover, Tag, Button, Space } from "@douyinfe/semi-ui";
import { useChatStore } from "@/stores/chatStore";
import type { Agent } from "@/types";

interface AgentDetailPopoverProps {
  agent: Agent;
  position: { top: number; left: number };
  onClose: () => void;
}

export function AgentDetailPopover({ agent, position, onClose }: AgentDetailPopoverProps) {
  const setPendingMention = useChatStore((s) => s.setPendingMention);

  const handleMention = () => {
    setPendingMention(agent.name);
    onClose();
  };

  const tools = agent.toolConfig?.tools as string[] | undefined;

  return (
    <Popover
      visible
      trigger="custom"
      position="bottomLeft"
      onClickOutSide={onClose}
      content={
        <div style={{ width: 260, padding: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--color-success)",
              color: "#fff",
              fontSize: "var(--font-size-md)",
              fontWeight: 500,
              flexShrink: 0,
            }}>
              {agent.name.charAt(0)}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: "var(--font-size-md)", fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {agent.name}
              </p>
              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)" }}>{agent.model}</p>
            </div>
          </div>

          <Space vertical spacing="tight" style={{ width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)" }}>提供商</span>
              <Tag size="small" color="grey">{agent.provider}</Tag>
            </div>
            {agent.capabilities && agent.capabilities.length > 0 && (
              <div>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)" }}>能力</span>
                <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {agent.capabilities.map((c) => (
                    <Tag key={c} size="small" color="blue" type="ghost">{c}</Tag>
                  ))}
                </div>
              </div>
            )}
            {tools && tools.length > 0 && (
              <div>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)" }}>工具</span>
                <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {tools.map((t) => (
                    <Tag key={t} size="small" color="grey" type="ghost">{t}</Tag>
                  ))}
                </div>
              </div>
            )}
            {agent.systemPrompt && (
              <div>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)" }}>系统提示词</span>
                <p style={{
                  marginTop: 4,
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-text-secondary)",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                }}>
                  {agent.systemPrompt}
                </p>
              </div>
            )}
          </Space>

          <Button
            block
            theme="solid"
            type="primary"
            size="small"
            onClick={handleMention}
            style={{ marginTop: 12 }}
          >
            提及此 Agent
          </Button>
        </div>
      }
    >
      <div style={{ position: "fixed", top: position.top, left: position.left, width: 0, height: 0 }} />
    </Popover>
  );
}
