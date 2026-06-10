import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Modal, Input, Button, Tag, Empty } from "@douyinfe/semi-ui";
import { IconSearch, IconPlus, IconComment } from "@douyinfe/semi-icons";
import { useAgents, useDeleteAgent } from "@/hooks/useAgents";
import { useCreateConversation } from "@/hooks/useConversations";
import { useChatStore } from "@/stores/chatStore";
import { CreateAgentModal } from "./CreateAgentModal";
import type { Agent } from "@/types";

interface AgentManageModalProps {
  open: boolean;
  onClose: () => void;
}

export function AgentManageModal({ open, onClose }: AgentManageModalProps) {
  const { data: agents = [] } = useAgents();
  const [search, setSearch] = useState("");
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const deleteAgent = useDeleteAgent();
  const createConv = useCreateConversation();
  const qc = useQueryClient();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const handleConversationalCreate = useCallback(() => {
    createConv.mutate(
      { title: "创建新 Agent", type: "single", purpose: "agent_builder", agentIds: [] },
      {
        onSuccess: (conv) => {
          onClose();
          setActiveConversation(conv.id);
          qc.invalidateQueries({ queryKey: ["conversations"] });
        },
      },
    );
  }, [createConv, onClose, setActiveConversation, qc]);

  const filtered = agents.filter((a) =>
    !search || a.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = useCallback((id: string) => {
    setDeletingId(id);
    deleteAgent.mutate(id, {
      onSuccess: () => {
        toast.success("Agent 已删除");
        setDeletingId(null);
      },
      onError: () => {
        toast.error("删除失败，请重试");
        setDeletingId(null);
      },
    });
  }, [deleteAgent]);

  return (
    <>
      <Modal
        visible={open}
        title="Agent 管理"
        onCancel={onClose}
        footer={null}
        maskClosable
        style={{ width: 640 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              prefix={<IconSearch />}
              placeholder="搜索 Agent..."
              value={search}
              onChange={setSearch}
              style={{ flex: 1 }}
            />
            <Button
              icon={<IconPlus />}
              theme="solid"
              onClick={() => setShowCreate(true)}
            >
              创建
            </Button>
            <Button
              icon={<IconComment />}
              theme="light"
              onClick={handleConversationalCreate}
            >
              对话式创建
            </Button>
          </div>

          {filtered.length === 0 ? (
            <Empty title="没有匹配的 Agent" description="尝试其他关键词或创建新 Agent" />
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              maxHeight: 400,
              overflowY: "auto",
            }}>
              {filtered.map((agent) => (
                <div
                  key={agent.id}
                  style={{
                    padding: 16,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border-light)",
                    background: "var(--color-bg-elevated)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: agent.isActive ? "var(--color-success)" : "var(--color-text-disabled)",
                      color: "#fff",
                      fontSize: "var(--font-size-lg)",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      {agent.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)" }}>
                        {agent.name}
                      </div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)" }}>
                        {agent.provider} / {agent.model}
                      </div>
                      {agent.baseUrl && (
                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>
                          {agent.baseUrl}
                        </div>
                      )}
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>
                        Key: {agent.apiKey ? <span style={{color: "var(--color-success)"}}>已配置</span> : <span style={{color: "var(--color-text-disabled)"}}>未配置</span>}
                      </div>
                    </div>
                    {!agent.isActive && (
                      <Tag size="small" color="grey" type="ghost">已禁用</Tag>
                    )}
                  </div>

                  {agent.capabilities && agent.capabilities.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                      {agent.capabilities.map((cap) => (
                        <Tag key={cap} size="small" color="blue" type="ghost">{cap}</Tag>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <Button
                      size="small"
                      onClick={() => setEditingAgent(agent)}
                    >
                      编辑
                    </Button>
                    <Button
                      size="small"
                      type="danger"
                      theme="borderless"
                      loading={deletingId === agent.id}
                      onClick={() => handleDelete(agent.id)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {editingAgent && (
        <CreateAgentModal
          open={true}
          initialData={editingAgent}
          onClose={() => setEditingAgent(null)}
        />
      )}

      {showCreate && (
        <CreateAgentModal
          open={true}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  );
}
