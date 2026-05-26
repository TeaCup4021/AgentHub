import { useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Input,
  Modal,
  Dropdown,
  Badge,
  Empty,
  Typography,
} from "@douyinfe/semi-ui";
import {
  IconSearch,
  IconPlus,
  IconMapPin,
  IconEdit,
  IconDelete,
  IconArchive,
  IconRestore,
  IconUserGroup,
  IconSetting,
} from "@douyinfe/semi-icons";
import { useChatStore } from "@/stores/chatStore";
import { useUpdateAnyConversation, useDeleteConversation } from "@/hooks";
import { formatRelativeTime, truncate } from "@/lib/utils";
import { CreateAgentModal } from "@/components/agent";
import type { Agent, Conversation } from "@/types";

interface ConversationListProps {
  conversations: Conversation[];
  agents: Agent[];
  onCreateConversation: (title: string, type: "single" | "group", agentIds: string[]) => void;
}

export function ConversationList({ conversations, agents, onCreateConversation }: ConversationListProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"single" | "group">("single");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [agentSearch, setAgentSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);

  const activeId = useChatStore((s) => s.activeConversationId);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);

  const qc = useQueryClient();
  const updateConversation = useUpdateAnyConversation();
  const deleteConversation = useDeleteConversation();

  const { active, archived } = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const sorted = [...conversations].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
    });
    return {
      active: sorted.filter((c) => !c.isArchived && (!q || c.title.toLowerCase().includes(q))),
      archived: sorted.filter((c) => c.isArchived && (!q || c.title.toLowerCase().includes(q))),
    };
  }, [conversations, searchQuery]);

  const handleNewConversation = useCallback(() => {
    if (!newTitle.trim()) return;
    onCreateConversation(newTitle.trim(), newType, selectedAgentIds);
    setNewTitle("");
    setNewType("single");
    setSelectedAgentIds([]);
    setAgentSearch("");
    setShowNewDialog(false);
  }, [newTitle, newType, selectedAgentIds, onCreateConversation]);

  const openNewDialog = useCallback(() => {
    setNewTitle("");
    setNewType("single");
    setSelectedAgentIds(agents.length > 0 ? [agents[0].id] : []);
    setAgentSearch("");
    setShowNewDialog(true);
  }, [agents]);

  const handlePin = (conv: Conversation) => {
    updateConversation.mutate({ id: conv.id, isPinned: !conv.isPinned });
  };

  const handleRenameStart = (conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameTitle(conv.title);
  };

  const handleRenameSubmit = () => {
    if (renamingId && renameTitle.trim()) {
      updateConversation.mutate({ id: renamingId, title: renameTitle.trim() });
    }
    setRenamingId(null);
    setRenameTitle("");
  };

  const handleArchive = (id: string) => {
    updateConversation.mutate({ id, isArchived: true });
    if (activeId === id) setActiveConversation(null);
  };

  const handleUnarchive = (id: string) => {
    updateConversation.mutate({ id, isArchived: false });
  };

  const handleDeleteConfirm = useCallback(() => {
    if (!confirmDeleteId) return;
    const idToDelete = confirmDeleteId;
    setConfirmDeleteId(null);
    if (activeId === idToDelete) setActiveConversation(null);

    const prevData = qc.getQueryData(["conversations"]);

    qc.setQueryData(["conversations"], (old: Conversation[] | undefined) =>
      old ? old.filter((c) => c.id !== idToDelete) : old,
    );

    deleteConversation.mutate(idToDelete, {
      onError: () => {
        if (prevData) qc.setQueryData(["conversations"], prevData);
        toast.error("删除失败，请重试");
      },
    });
  }, [confirmDeleteId, activeId, qc, deleteConversation]);

  const renderConversationItem = (conv: Conversation, isArchived: boolean) => {
    return (
      <Dropdown
        key={conv.id}
        trigger="contextMenu"
        position="right"
        menu={
          isArchived
            ? [
                { node: "item", name: "取消归档", icon: <IconRestore /> },
                { node: "divider" },
                { node: "item", name: "删除", icon: <IconDelete />, className: "semi-dropdown-item-danger" },
              ]
            : [
                { node: "item", name: conv.isPinned ? "取消置顶" : "置顶", icon: <IconMapPin /> },
                { node: "item", name: "重命名", icon: <IconEdit /> },
                { node: "item", name: "归档", icon: <IconArchive /> },
                { node: "divider" },
                { node: "item", name: "删除", icon: <IconDelete />, className: "semi-dropdown-item-danger" },
              ]
        }
        onClick={(item: { name: string }) => {
          if (item.name === "置顶" || item.name === "取消置顶") handlePin(conv);
          if (item.name === "重命名") handleRenameStart(conv);
          if (item.name === "归档") handleArchive(conv.id);
          if (item.name === "取消归档") handleUnarchive(conv.id);
          if (item.name === "删除") { setConfirmDeleteId(conv.id); }
        }}
      >
        <div
          onClick={() => { if (!isArchived) setActiveConversation(conv.id); }}
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
            padding: "10px 16px",
            cursor: "pointer",
            background: conv.id === activeId ? "var(--color-bg-active)" : "transparent",
            opacity: isArchived ? 0.6 : 1,
            transition: "background var(--duration-fast) var(--ease-out)",
          }}
          onMouseEnter={(e) => {
            if (conv.id !== activeId) e.currentTarget.style.background = "var(--color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            if (conv.id !== activeId) e.currentTarget.style.background = "transparent";
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {conv.isPinned && !isArchived && (
                <IconMapPin style={{ fontSize: 12, color: "var(--color-text-tertiary)", flexShrink: 0 }} />
              )}
              <span style={{
                fontWeight: 500,
                fontSize: "var(--font-size-md)",
                color: "var(--color-text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {truncate(conv.title, 20)}
              </span>
            </div>
            <p style={{ marginTop: 2, fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)" }}>
              {conv.type === "group" ? "群聊" : "单聊"}
            </p>
          </div>
          <span style={{ flexShrink: 0, fontSize: 11, color: "var(--color-text-tertiary)" }}>
            {formatRelativeTime(conv.lastActiveAt)}
          </span>
        </div>
      </Dropdown>
    );
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      width: "var(--conv-list-width)",
      flexShrink: 0,
      background: "var(--color-bg-sidebar)",
      borderRight: "1px solid var(--color-border-light)",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 16px",
        borderBottom: "1px solid var(--color-border-light)",
      }}>
        <Typography.Title heading={6} style={{ flex: 1, margin: 0, color: "var(--color-text-primary)" }}>
          AgentHub
        </Typography.Title>
        <Button
          icon={<IconPlus />}
          theme="borderless"
          size="small"
          onClick={openNewDialog}
        />
        <Button
          icon={<IconUserGroup />}
          theme="borderless"
          size="small"
          onClick={() => setShowCreateAgent(true)}
        />
      </div>

      <div style={{ padding: "0 12px 8px" }}>
        <Input
          prefix={<IconSearch />}
          placeholder="搜索对话..."
          value={searchQuery}
          onChange={setSearchQuery}
          size="small"
        />
      </div>

      <nav style={{ flex: 1, overflowY: "auto" }}>
        {active.length === 0 && archived.length === 0 ? (
          <Empty
            title={searchQuery ? "没有找到匹配的对话" : "暂无对话"}
            description={searchQuery ? undefined : "点击 + 创建新对话"}
            style={{ marginTop: 32 }}
          />
        ) : (
          <>
            {active.map((conv) => renderConversationItem(conv, false))}

            {archived.length > 0 && (
              <div style={{ borderTop: "1px solid var(--color-border-light)", marginTop: 4 }}>
                <Button
                  theme="borderless"
                  block
                  onClick={() => setShowArchived(!showArchived)}
                  style={{
                    justifyContent: "flex-start",
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-text-tertiary)",
                    padding: "8px 16px",
                  }}
                >
                  {showArchived ? "▾" : "▸"} 已归档 ({archived.length})
                </Button>
                {showArchived && archived.map((conv) => renderConversationItem(conv, true))}
              </div>
            )}
          </>
        )}
      </nav>

      <div style={{
        borderTop: "1px solid var(--color-border-light)",
        padding: "8px 12px",
      }}>
        <Button
          theme="borderless"
          block
          icon={<IconSetting />}
          onClick={() => window.location.href = "/settings"}
          style={{
            justifyContent: "flex-start",
            fontSize: "var(--font-size-sm)",
            color: "var(--color-text-secondary)",
          }}
        >
          设置
        </Button>
      </div>

      <Modal
        visible={showNewDialog}
        title="新建对话"
        onCancel={() => { setShowNewDialog(false); setAgentSearch(""); }}
        onOk={handleNewConversation}
        okButtonProps={{
          disabled:
            !newTitle.trim() ||
            selectedAgentIds.length === 0 ||
            (newType === "group" && selectedAgentIds.length < 2),
        }}
        cancelButtonProps={{ theme: "borderless" }}
        maskClosable
        style={{ width: 448 }}
      >
        <Input
          value={newTitle}
          onChange={setNewTitle}
          placeholder="输入对话标题..."
          autoFocus
          onEnterPress={handleNewConversation}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button
            block
            theme={newType === "single" ? "solid" : "light"}
            type={newType === "single" ? "primary" : "tertiary"}
            onClick={() => {
              setNewType("single");
              setSelectedAgentIds((prev) => (prev.length > 0 ? [prev[0]] : agents.length > 0 ? [agents[0].id] : []));
            }}
          >
            单聊
          </Button>
          <Button
            block
            theme={newType === "group" ? "solid" : "light"}
            type={newType === "group" ? "primary" : "tertiary"}
            onClick={() => setNewType("group")}
          >
            群聊
          </Button>
        </div>

        <div style={{ marginTop: 12 }}>
          <Input
            value={agentSearch}
            onChange={setAgentSearch}
            placeholder="搜索 Agent..."
            size="small"
          />
        </div>

        <div style={{ marginTop: 8, maxHeight: 192, overflowY: "auto" }}>
          {agents
            .filter((a) => a.isActive && (!agentSearch || a.name.toLowerCase().includes(agentSearch.toLowerCase())))
            .map((agent) => {
              const selected = selectedAgentIds.includes(agent.id);
              return (
                <Button
                  key={agent.id}
                  theme="borderless"
                  block
                  onClick={() => {
                    if (newType === "single") {
                      setSelectedAgentIds([agent.id]);
                    } else {
                      setSelectedAgentIds((prev) =>
                        prev.includes(agent.id) ? prev.filter((id) => id !== agent.id) : [...prev, agent.id],
                      );
                    }
                  }}
                  style={{
                    justifyContent: "flex-start",
                    padding: "8px 12px",
                    background: selected ? "var(--color-bg-active)" : "transparent",
                    borderRadius: "var(--radius-md)",
                    marginBottom: 2,
                  }}
                >
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: selected ? "var(--color-primary)" : "#00b578",
                    color: "#fff",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: 600,
                    marginRight: 12,
                    flexShrink: 0,
                  }}>
                    {agent.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <div style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)" }}>
                      {agent.name}
                    </div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)" }}>
                      {agent.model}
                    </div>
                  </div>
                  {selected && (
                    <Badge dot theme="solid" style={{ color: "var(--color-primary)" }} />
                  )}
                  {newType === "group" && !selected && (
                    <div style={{
                      width: 16,
                      height: 16,
                      borderRadius: 2,
                      border: "2px solid var(--color-border-medium)",
                      flexShrink: 0,
                    }} />
                  )}
                </Button>
              );
            })}
          {agents.filter((a) => a.isActive).length === 0 && (
            <p style={{ padding: "16px 0", textAlign: "center", fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)" }}>
              暂无可用的 Agent
            </p>
          )}
        </div>

        {newType === "group" && selectedAgentIds.length < 2 && selectedAgentIds.length > 0 && (
          <p style={{ marginTop: 4, fontSize: "var(--font-size-xs)", color: "var(--color-warning)" }}>
            群聊至少需要选择 2 个 Agent
          </p>
        )}
      </Modal>

      <Modal
        visible={renamingId !== null}
        title="重命名"
        onCancel={() => { setRenamingId(null); setRenameTitle(""); }}
        onOk={handleRenameSubmit}
        okButtonProps={{ disabled: !renameTitle.trim() }}
        cancelButtonProps={{ theme: "borderless" }}
        maskClosable
        style={{ width: 320 }}
      >
        <Input
          value={renameTitle}
          onChange={setRenameTitle}
          placeholder="输入新标题..."
          autoFocus
          onEnterPress={handleRenameSubmit}
        />
      </Modal>

      <Modal
        visible={confirmDeleteId !== null}
        title="删除对话"
        onCancel={() => setConfirmDeleteId(null)}
        onOk={handleDeleteConfirm}
        okButtonProps={{ theme: "solid", type: "danger" }}
        cancelButtonProps={{ theme: "borderless" }}
        okText="删除"
        maskClosable
        style={{ width: 320 }}
      >
        <p style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)" }}>
          删除后不可恢复，确定要删除这个对话吗？
        </p>
      </Modal>

      <CreateAgentModal open={showCreateAgent} onClose={() => setShowCreateAgent(false)} />
    </div>
  );
}
