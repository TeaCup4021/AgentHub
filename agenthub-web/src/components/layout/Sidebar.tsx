import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useChatStore } from "@/stores/chatStore";
import { useUIStore } from "@/stores/uiStore";
import { useUpdateAnyConversation, useDeleteConversation } from "@/hooks";
import { formatRelativeTime, truncate } from "@/lib/utils";
import { CreateAgentModal } from "@/components/agent";
import type { Agent, Conversation } from "@/types";

interface SidebarProps {
  conversations: Conversation[];
  agents: Agent[];
  onCreateConversation: (title: string, type: "single" | "group", agentIds: string[]) => void;
}

export function Sidebar({ conversations, agents, onCreateConversation }: SidebarProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"single" | "group">("single");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [agentSearch, setAgentSearch] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const activeId = useChatStore((s) => s.activeConversationId);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    if (menuOpenId) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpenId]);

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
    setMenuOpenId(null);
  };

  const handleRenameStart = (conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameTitle(conv.title);
    setMenuOpenId(null);
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
    setMenuOpenId(null);
    if (activeId === id) setActiveConversation(null);
  };

  const handleUnarchive = (id: string) => {
    updateConversation.mutate({ id, isArchived: false });
    setMenuOpenId(null);
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

  return (
    <aside className="flex h-full flex-col border-r border-gray-200 bg-sidebar-bg">
      <div className="flex items-center gap-2 px-4 py-3">
        <button onClick={toggleSidebar} className="rounded-md p-1.5 text-gray-500 hover:bg-sidebar-hover" title="收起侧边栏">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="flex-1 text-base font-semibold">AgentHub</h1>
        <button onClick={openNewDialog} className="rounded-md p-1.5 text-gray-500 hover:bg-sidebar-hover" title="新建对话">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button onClick={() => setShowCreateAgent(true)} className="rounded-md p-1.5 text-gray-500 hover:bg-sidebar-hover" title="创建 Agent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a4 4 0 014 4v1h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4z" />
            <circle cx="9" cy="14" r="1.5" fill="currentColor" /><circle cx="15" cy="14" r="1.5" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div className="px-3 pb-3">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索对话..."
            className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto">
        {active.length === 0 && archived.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            {searchQuery ? "没有找到匹配的对话" : "暂无对话，点击 + 创建"}
          </p>
        ) : (
          <>
            {active.map((conv) => renderConversationItem(conv, false))}

            {archived.length > 0 && (
              <div className="border-t border-gray-150 mt-1">
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-500 hover:bg-sidebar-hover transition-colors"
                >
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`transition-transform ${showArchived ? "rotate-90" : ""}`}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  已归档 ({archived.length})
                </button>
                {showArchived && archived.map((conv) => renderConversationItem(conv, true))}
              </div>
            )}
          </>
        )}
      </nav>

      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => { setShowNewDialog(false); setAgentSearch(""); }}>
          <div className="w-[28rem] rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">新建对话</h2>

            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleNewConversation(); if (e.key === "Escape") { setShowNewDialog(false); setAgentSearch(""); } }}
              placeholder="输入对话标题..." autoFocus
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setNewType("single");
                  setSelectedAgentIds((prev) => prev.length > 0 ? [prev[0]] : (agents.length > 0 ? [agents[0].id] : []));
                }}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  newType === "single"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                单聊
              </button>
              <button
                onClick={() => setNewType("group")}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  newType === "group"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                群聊
              </button>
            </div>

            <div className="mt-3">
              <input
                type="text"
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                placeholder="搜索 Agent..."
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              />
            </div>

            <div className="mt-2 max-h-48 overflow-y-auto">
              {agents
                .filter((a) => a.isActive && (!agentSearch || a.name.toLowerCase().includes(agentSearch.toLowerCase())))
                .map((agent) => {
                  const selected = selectedAgentIds.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      onClick={() => {
                        if (newType === "single") {
                          setSelectedAgentIds([agent.id]);
                        } else {
                          setSelectedAgentIds((prev) =>
                            prev.includes(agent.id) ? prev.filter((id) => id !== agent.id) : [...prev, agent.id],
                          );
                        }
                      }}
                      className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                        selected ? "bg-blue-50 ring-1 ring-blue-400" : "hover:bg-gray-50"
                      }`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${
                        selected ? "bg-blue-500" : "bg-emerald-500"
                      }`}>
                        {agent.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{agent.name}</p>
                        <p className="truncate text-xs text-gray-500">{agent.model}</p>
                      </div>
                      {selected && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-blue-600">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                      {newType === "group" && !selected && (
                        <div className="h-4 w-4 shrink-0 rounded border-2 border-gray-300" />
                      )}
                    </button>
                  );
                })}
              {agents.filter((a) => a.isActive).length === 0 && (
                <p className="py-4 text-center text-sm text-gray-400">暂无可用的 Agent</p>
              )}
            </div>

            {newType === "group" && selectedAgentIds.length < 2 && selectedAgentIds.length > 0 && (
              <p className="mt-1 text-xs text-amber-600">群聊至少需要选择 2 个 Agent</p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setShowNewDialog(false); setAgentSearch(""); }}
                className="rounded-md px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">取消</button>
              <button onClick={handleNewConversation}
                disabled={
                  !newTitle.trim() ||
                  selectedAgentIds.length === 0 ||
                  (newType === "group" && selectedAgentIds.length < 2)
                }
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">创建</button>
            </div>
          </div>
        </div>
      )}

      {renamingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => { setRenamingId(null); setRenameTitle(""); }}>
          <div className="w-80 rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-base font-semibold">重命名</h2>
            <input type="text" value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit(); if (e.key === "Escape") { setRenamingId(null); setRenameTitle(""); } }}
              placeholder="输入新标题..." autoFocus
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setRenamingId(null); setRenameTitle(""); }} className="rounded-md px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">取消</button>
              <button onClick={handleRenameSubmit} disabled={!renameTitle.trim()}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">保存</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setConfirmDeleteId(null)}>
          <div className="w-80 rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-lg font-semibold">删除对话</h2>
            <p className="text-sm text-gray-500">删除后不可恢复，确定要删除这个对话吗？</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDeleteId(null)} className="rounded-md px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">取消</button>
              <button onClick={handleDeleteConfirm}
                className="rounded-md bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700">删除</button>
            </div>
          </div>
        </div>
      )}

      <CreateAgentModal open={showCreateAgent} onClose={() => setShowCreateAgent(false)} />

      <div className="border-t border-gray-200 px-3 py-2">
        <button
          onClick={() => window.location.href = "/settings"}
          className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-xs text-gray-600 hover:bg-sidebar-hover"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          设置
        </button>
      </div>
    </aside>
  );

  function renderConversationItem(conv: Conversation, isArchived: boolean) {
    return (
      <div key={conv.id} className="relative group">
        <button onClick={() => { if (!isArchived) setActiveConversation(conv.id); }}
          className={`w-full px-4 py-3 text-left transition-colors ${conv.id === activeId ? "bg-sidebar-active" : "hover:bg-sidebar-hover"} ${isArchived ? "opacity-60" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {conv.isPinned && !isArchived && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-gray-400">
                    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                  </svg>
                )}
                <span className="truncate text-sm font-medium">{truncate(conv.title, 20)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {conv.type === "group" && <span className="mr-1 rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-600">群聊</span>}
                {conv.type === "group" ? "群聊" : "单聊"}
              </p>
            </div>
            <span className="shrink-0 text-[11px] text-gray-400">{formatRelativeTime(conv.lastActiveAt)}</span>
          </div>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === conv.id ? null : conv.id); }}
          className={`absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 ${menuOpenId === conv.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
          </svg>
        </button>

        {menuOpenId === conv.id && (
          <div ref={menuRef}
            className="absolute right-6 top-1/2 z-50 w-36 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}>
            {isArchived ? (
              <>
                <button onClick={() => handleUnarchive(conv.id)}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100">
                  取消归档
                </button>
                <button onClick={() => { setConfirmDeleteId(conv.id); setMenuOpenId(null); }}
                  className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">
                  删除
                </button>
              </>
            ) : (
              <>
                <button onClick={() => handlePin(conv)}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100">
                  {conv.isPinned ? "取消置顶" : "置顶"}
                </button>
                <button onClick={() => handleRenameStart(conv)}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100">
                  重命名
                </button>
                <button onClick={() => handleArchive(conv.id)}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100">
                  归档
                </button>
                <button onClick={() => { setConfirmDeleteId(conv.id); setMenuOpenId(null); }}
                  className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">
                  删除
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }
}
