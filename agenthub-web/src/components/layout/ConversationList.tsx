import { useState, useCallback, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Input,
  Modal,
  Dropdown,
  Empty,
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
  IconDownload,
} from "@douyinfe/semi-icons";
import { useChatStore } from "@/stores/chatStore";
import { useUIStore } from "@/stores/uiStore";
import { useUpdateAnyConversation, useDeleteConversation } from "@/hooks";
import { formatRelativeTime, truncate, getAgentColor } from "@/lib/utils";
import { CreateAgentModal, AgentManageModal } from "@/components/agent";
import { ConversationSkeleton } from "@/components/chat/Skeleton";
import { exportConversation } from "@/lib/exportConversation";
import type { Agent, Conversation, Message, PaginatedData } from "@/types";

const pinIcon = <IconMapPin />;
const editIcon = <IconEdit />;
const archiveIcon = <IconArchive />;
const downloadIcon = <IconDownload />;
const deleteIcon = <IconDelete />;

interface ConversationListProps {
  conversations: Conversation[];
  agents: Agent[];
  isLoading?: boolean;
  onCreateConversation: (title: string, type: "single" | "group", agentIds: string[]) => void;
}

export function ConversationList({ conversations, agents, isLoading, onCreateConversation }: ConversationListProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"single" | "group">("single");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [agentSearch, setAgentSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const showManageAgents = useUIStore((s) => s.manageAgentsOpen);
  const setShowManageAgents = useUIStore((s) => s.setManageAgentsOpen);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextVisibleId, setContextVisibleId] = useState<string | null>(null);

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

  const [createError, setCreateError] = useState("");
  const [errorKey, setErrorKey] = useState(0);

  const showError = (msg: string) => { setCreateError(msg); setErrorKey((k) => k + 1); };

  const handleNewConversation = useCallback(() => {
    if (!newTitle.trim()) { showError("请输入对话名称"); return; }
    if (selectedAgentIds.length === 0) { showError("请至少选择一个 Agent"); return; }
    if (newType === "group" && selectedAgentIds.length < 2) { showError("群聊至少需要选择 2 个 Agent"); return; }
    onCreateConversation(newTitle.trim(), newType, selectedAgentIds);
    setNewTitle("");
    setNewType("single");
    setSelectedAgentIds([]);
    setAgentSearch("");
    setCreateError("");
    setShowNewDialog(false);
  }, [newTitle, newType, selectedAgentIds, onCreateConversation]);

  const openNewDialog = useCallback(() => {
    setNewTitle("");
    setNewType("single");
    setSelectedAgentIds([]);
    setAgentSearch("");
    setCreateError("");
    setErrorKey(0);
    setShowNewDialog(true);
  }, []);

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

    qc.setQueryData(["conversations"], (old: PaginatedData<Conversation> | undefined) =>
      old ? { ...old, list: old.list.filter((c) => c.id !== idToDelete), total: old.total - 1 } : old,
    );

    deleteConversation.mutate(idToDelete, {
      onError: () => {
        if (prevData) qc.setQueryData(["conversations"], prevData);
        toast.error("删除失败，请重试");
      },
    });
  }, [confirmDeleteId, activeId, qc, deleteConversation]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const exitBatchMode = useCallback(() => {
    setBatchMode(false);
    setSelectedIds(new Set());
  }, []);

  useEffect(() => {
    if (!batchMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") exitBatchMode(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [batchMode, exitBatchMode]);

  const newConvTrigger = useUIStore((s) => s.newConvTrigger);
  const resetNewConvTrigger = useUIStore((s) => s.resetNewConvTrigger);
  useEffect(() => {
    if (newConvTrigger > 0) {
      openNewDialog();
      resetNewConvTrigger();
    }
  }, [newConvTrigger]);

  const handleBatchArchive = useCallback(() => {
    const ids = [...selectedIds];
    const prevData = qc.getQueryData(["conversations"]);

    qc.setQueryData(["conversations"], (old: PaginatedData<Conversation> | undefined) =>
      old ? { ...old, list: old.list.map((c) => ids.includes(c.id) ? { ...c, isArchived: true } : c) } : old,
    );
    if (activeId && ids.includes(activeId)) setActiveConversation(null);

    let failed = false;
    Promise.all(ids.map((id) =>
      updateConversation.mutateAsync({ id, isArchived: true }).catch(() => { failed = true; })
    )).finally(() => {
      if (failed) {
        if (prevData) qc.setQueryData(["conversations"], prevData);
        toast.error("部分归档失败，请刷新后重试");
      } else {
        toast.success("已归档 " + ids.length + " 个对话");
      }
      qc.invalidateQueries({ queryKey: ["conversations"] });
    });

    exitBatchMode();
  }, [selectedIds, updateConversation, activeId, setActiveConversation, exitBatchMode, qc]);

  const handleBatchDelete = useCallback(() => {
    const ids = [...selectedIds];
    const prevData = qc.getQueryData(["conversations"]);

    qc.setQueryData(["conversations"], (old: PaginatedData<Conversation> | undefined) =>
      old ? { ...old, list: old.list.filter((c) => !ids.includes(c.id)), total: Math.max(0, old.total - ids.length) } : old,
    );
    if (activeId && ids.includes(activeId)) setActiveConversation(null);

    let failed = false;
    Promise.all(ids.map((id) =>
      deleteConversation.mutateAsync(id).catch(() => { failed = true; })
    )).finally(() => {
      if (failed) {
        if (prevData) qc.setQueryData(["conversations"], prevData);
        toast.error("部分删除失败，请刷新后重试");
      } else {
        toast.success("已删除 " + ids.length + " 个对话");
      }
      qc.invalidateQueries({ queryKey: ["conversations"] });
    });

    exitBatchMode();
  }, [selectedIds, deleteConversation, activeId, setActiveConversation, exitBatchMode, qc]);

  const handleExport = useCallback((conv: Conversation) => {
    const messagesData = qc.getQueryData(["messages", conv.id]);
    if (!messagesData) {
      toast.error("暂无消息数据可导出");
      return;
    }
    const pages = (messagesData as { pages?: { items: Message[] }[] }).pages;
    if (!pages) {
      toast.error("暂无消息数据可导出");
      return;
    }
    const items = pages.flatMap((p) => p.items).reverse();
    if (items.length === 0) {
      toast.error("暂无消息数据可导出");
      return;
    }
    exportConversation(items, conv.title);
    toast.success("导出成功");
  }, [qc]);

  const renderConversationItem = (conv: Conversation, isArchived: boolean) => {
    const closeMenu = () => setContextVisibleId(null);

    const inBatch = batchMode && selectedIds.size > 0;

    const menu = isArchived
      ? [
          { node: "item" as const, itemKey: "unarchive", name: "取消归档", icon: <IconRestore />, onClick: () => { closeMenu(); handleUnarchive(conv.id); } },
          { node: "divider" as const },
          inBatch
            ? { node: "item" as const, itemKey: "delete_batch", name: `批量删除 (${selectedIds.size} 项)`, icon: deleteIcon, className: "semi-dropdown-item-danger", onClick: () => { closeMenu(); setConfirmBatchDelete(true); } }
            : { node: "item" as const, itemKey: "delete", name: "删除", icon: deleteIcon, className: "semi-dropdown-item-danger", onClick: () => { closeMenu(); setConfirmDeleteId(conv.id); } },
        ]
      : [
          ...(conv.isPinned
            ? [{ node: "item" as const, itemKey: "unpin", name: "取消置顶", icon: pinIcon, onClick: () => { closeMenu(); handlePin(conv); } }]
            : [{ node: "item" as const, itemKey: "pin", name: "置顶", icon: pinIcon, onClick: () => { closeMenu(); handlePin(conv); } }]
          ),
          { node: "item" as const, itemKey: "rename", name: "重命名", icon: editIcon, onClick: () => { closeMenu(); handleRenameStart(conv); } },
          inBatch
            ? { node: "item" as const, itemKey: "archive_batch", name: `批量归档 (${selectedIds.size} 项)`, icon: archiveIcon, onClick: () => { closeMenu(); handleBatchArchive(); } }
            : { node: "item" as const, itemKey: "archive", name: "归档", icon: archiveIcon, onClick: () => { closeMenu(); handleArchive(conv.id); } },
          { node: "item" as const, itemKey: "export", name: "导出", icon: downloadIcon, onClick: () => { closeMenu(); handleExport(conv); } },
          { node: "divider" as const },
          inBatch
            ? { node: "item" as const, itemKey: "delete_batch", name: `批量删除 (${selectedIds.size} 项)`, icon: deleteIcon, className: "semi-dropdown-item-danger", onClick: () => { closeMenu(); setConfirmBatchDelete(true); } }
            : { node: "item" as const, itemKey: "delete", name: "删除", icon: deleteIcon, className: "semi-dropdown-item-danger", onClick: () => { closeMenu(); setConfirmDeleteId(conv.id); } },
        ];

    return (
      <Dropdown
        key={conv.id}
        trigger="contextMenu"
        position="right"
        menu={menu}
        visible={contextVisibleId === conv.id}
        onVisibleChange={(v) => setContextVisibleId(v ? conv.id : null)}
      >
        <div
          onClick={() => {
            if (batchMode) { toggleSelect(conv.id); return; }
            if (!isArchived) setActiveConversation(conv.id);
          }}
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
            padding: "10px 12px",
            margin: "0 8px",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            background: selectedIds.has(conv.id)
              ? "var(--color-bg-active)"
              : conv.id === activeId && !batchMode
                ? "var(--color-bg-active)"
                : "transparent",
            border: conv.id === activeId && !batchMode
              ? "1px solid var(--color-border-medium)"
              : "1px solid transparent",
            opacity: isArchived ? 0.6 : 1,
            transition: "background var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)",
          }}
          onMouseEnter={(e) => {
            if (conv.id !== activeId) {
              e.currentTarget.style.background = "var(--color-bg-hover)";
            }
          }}
          onMouseLeave={(e) => {
            if (conv.id !== activeId) {
              e.currentTarget.style.background = "transparent";
            }
          }}
        >
          {batchMode && (
            <div
              onClick={(e) => { e.stopPropagation(); toggleSelect(conv.id); }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 18,
                height: 18,
                borderRadius: 2,
                border: `2px solid ${selectedIds.has(conv.id) ? "var(--color-primary)" : "var(--color-border-medium)"}`,
                background: selectedIds.has(conv.id) ? "var(--color-primary)" : "transparent",
                color: "#fff",
                fontSize: 10,
                flexShrink: 0,
                marginTop: 3,
              }}
            >
              {selectedIds.has(conv.id) && "✓"}
            </div>
          )}
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
                {truncate(conv.title, 18)}
              </span>
            </div>
            <p style={{ marginTop: 3, fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)" }}>
              {conv.type === "group" ? "群聊" : "单聊"}
            </p>
          </div>
          <span style={{ flexShrink: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)" }}>
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
      width: "100%",
      background: "var(--color-bg-sidebar)",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "14px 16px 10px",
      }}>
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
          onClick={() => setShowManageAgents(true)}
        />
        <Button
          theme="borderless"
          size="small"
          onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); }}
          style={{
            color: batchMode ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
            fontWeight: batchMode ? 600 : 400,
          }}
        >
          {batchMode ? "完成" : "批量"}
        </Button>
      </div>

      <div style={{ padding: "0 8px 10px" }}>
        <Input
          prefix={<IconSearch />}
          placeholder="搜索对话..."
          value={searchQuery}
          onChange={setSearchQuery}
          size="small"
        />
      </div>

      <nav style={{ flex: 1, overflowY: "auto" }}>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <ConversationSkeleton key={i} />)
        ) : active.length === 0 && archived.length === 0 ? (
          <Empty
            title={searchQuery ? "没有找到匹配的对话" : "暂无对话"}
            description={searchQuery ? undefined : "点击 + 创建新对话"}
            style={{ marginTop: 32 }}
          />
        ) : (
          <>
            {active.map((conv) => renderConversationItem(conv, false))}

            {archived.length > 0 && (
              <div style={{ marginTop: 8 }}>
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

      {batchMode && selectedIds.size > 0 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          background: "var(--color-bg-elevated)",
          boxShadow: "var(--shadow-md)",
        }}>
          <span style={{ flex: 1, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
            已选 {selectedIds.size} 项
          </span>
          <Button
            size="small"
            onClick={handleBatchArchive}
            style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}
          >
            归档
          </Button>
          <Button
            size="small"
            type="danger"
            onClick={handleBatchDelete}
            style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}
          >
            删除
          </Button>
          <Button
            size="small"
            theme="borderless"
            onClick={exitBatchMode}
            style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--color-gray-400)" }}
          >
            取消
          </Button>
        </div>
      )}

      <Modal
        visible={showNewDialog}
        title="新建对话"
        onCancel={() => { setShowNewDialog(false); setAgentSearch(""); setCreateError(""); setErrorKey(0); }}
        onOk={handleNewConversation}
        cancelButtonProps={{ theme: "borderless" }}
        maskClosable
        style={{ width: 520 }}
        footer={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {createError && (
              <div key={errorKey} className="create-error-shake" style={{
                display: "flex", alignItems: "center", gap: 8, flex: 1,
                fontSize: 12, color: "var(--color-danger)",
                padding: "8px 14px", background: "var(--color-danger-light-default)", borderRadius: "var(--radius-md)",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                {createError}
              </div>
            )}
            <Button theme="borderless" onClick={() => { setShowNewDialog(false); setAgentSearch(""); setCreateError(""); setErrorKey(0); }}>取消</Button>
            <Button theme="solid" type="primary" onClick={handleNewConversation}>创建对话</Button>
          </div>
        }
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>对话名称</div>
        <Input
          value={newTitle}
          onChange={(v) => { setNewTitle(v); setCreateError(""); }}
          placeholder="输入对话名称..."
          autoFocus
          size="large"
          onEnterPress={handleNewConversation}
        />

        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 16, marginBottom: 8 }}>对话类型</div>
        <div style={{ display: "flex", border: "1.5px solid var(--color-border-light)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
          <button
            onClick={() => {
              setNewType("single");
              if (selectedAgentIds.length > 1) setSelectedAgentIds([]);
              setCreateError("");
            }}
            style={{
              flex: 1, height: 40, border: "none", cursor: "pointer",
              background: newType === "single" ? "var(--color-primary)" : "transparent",
              color: newType === "single" ? "#fff" : "var(--color-text-secondary)",
              fontSize: 14, fontWeight: 600, transition: "all 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            单聊
          </button>
          <button
            onClick={() => { setNewType("group"); setCreateError(""); }}
            style={{
              flex: 1, height: 40, border: "none", cursor: "pointer",
              background: newType === "group" ? "var(--color-primary)" : "transparent",
              color: newType === "group" ? "#fff" : "var(--color-text-secondary)",
              fontSize: 14, fontWeight: 600, transition: "all 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            群聊
          </button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 16, marginBottom: 10 }}>选择 Agent</div>
        <Input
          value={agentSearch}
          onChange={setAgentSearch}
          placeholder="搜索 Agent..."
          size="small"
          style={{ marginBottom: 12 }}
        />
        <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {agents
            .filter((a) => a.isActive && (!agentSearch || a.name.toLowerCase().includes(agentSearch.toLowerCase())))
            .map((agent) => {
              const selected = selectedAgentIds.includes(agent.id);
              return (
                <div
                  key={agent.id}
                  onClick={() => {
                    setCreateError("");
                    if (newType === "single") {
                      setSelectedAgentIds(selected ? [] : [agent.id]);
                    } else {
                      setSelectedAgentIds((prev) =>
                        prev.includes(agent.id) ? prev.filter((id) => id !== agent.id) : [...prev, agent.id],
                      );
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 16px", cursor: "pointer",
                    background: selected ? "var(--color-primary-light-default)" : "var(--color-bg-elevated)",
                    border: selected ? "2px solid var(--color-primary)" : "2px solid var(--color-border-light)",
                    borderRadius: 12, transition: "all 0.15s",
                    userSelect: "none",
                  }}
                >
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 40, height: 40, borderRadius: "50%",
                    background: getAgentColor(agent.name), color: "#fff",
                    fontSize: 16, fontWeight: 700, flexShrink: 0,
                  }}>{agent.name.charAt(0)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{agent.name}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>{agent.provider} · {agent.model}</div>
                  </div>
                  {newType === "single" ? (
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      border: selected ? "none" : "2px solid var(--color-border-medium)",
                      background: selected ? "var(--color-primary)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                    }}>
                      {selected && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                      border: selected ? "none" : "2px solid var(--color-border-medium)",
                      background: selected ? "var(--color-primary)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s", position: "relative",
                    }}>
                      {selected && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          {agents.filter((a) => a.isActive).length === 0 && (
            <p style={{ padding: "16px 0", textAlign: "center", fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)" }}>
              暂无可用的 Agent
            </p>
          )}
        </div>
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

      <Modal
        visible={confirmBatchDelete}
        title="批量删除对话"
        onCancel={() => setConfirmBatchDelete(false)}
        onOk={() => { handleBatchDelete(); setConfirmBatchDelete(false); }}
        okButtonProps={{ theme: "solid", type: "danger" }}
        cancelButtonProps={{ theme: "borderless" }}
        okText="删除"
        maskClosable
        style={{ width: 320 }}
      >
        <p style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)" }}>
          删除后不可恢复，确定要删除选中的 {selectedIds.size} 个对话吗？
        </p>
      </Modal>

      <CreateAgentModal open={showCreateAgent} onClose={() => setShowCreateAgent(false)} />
      <AgentManageModal open={showManageAgents} onClose={() => setShowManageAgents(false)} />
    </div>
  );
}
