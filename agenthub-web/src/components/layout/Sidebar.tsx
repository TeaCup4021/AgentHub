import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useUIStore } from "@/stores/uiStore";
import { useUpdateAnyConversation, useDeleteConversation } from "@/hooks";
import { formatRelativeTime, truncate } from "@/lib/utils";
import type { Conversation } from "@/types";

interface SidebarProps {
  conversations: Conversation[];
  onCreateConversation: (title: string, type: "single" | "group", agentIds: string[]) => void;
}

export function Sidebar({ conversations, onCreateConversation }: SidebarProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const activeId = useChatStore((s) => s.activeConversationId);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const setSearchQuery = useChatStore((s) => s.setSearchQuery);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

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
    onCreateConversation(newTitle.trim(), "single", ["agent-claude-code"]);
    setNewTitle("");
    setShowNewDialog(false);
  }, [newTitle, onCreateConversation]);

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

  const handleDeleteConfirm = () => {
    if (confirmDeleteId) {
      deleteConversation.mutate(confirmDeleteId);
      if (activeId === confirmDeleteId) setActiveConversation(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <aside className="flex h-full flex-col border-r border-gray-200 bg-sidebar-bg">
      <div className="flex items-center gap-2 px-4 py-3">
        <button onClick={toggleSidebar} className="rounded-md p-1.5 text-gray-500 hover:bg-sidebar-hover" title="收起侧边栏">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="flex-1 text-base font-semibold">AgentHub</h1>
        <button onClick={() => setShowNewDialog(true)} className="rounded-md p-1.5 text-gray-500 hover:bg-sidebar-hover" title="新建对话">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowNewDialog(false)}>
          <div className="w-96 rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">新建对话</h2>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleNewConversation(); if (e.key === "Escape") setShowNewDialog(false); }}
              placeholder="输入对话标题..." autoFocus
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowNewDialog(false)} className="rounded-md px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">取消</button>
              <button onClick={handleNewConversation} disabled={!newTitle.trim()}
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
                {conv.lastMessage ? truncate(conv.lastMessage, 30) : "新对话"}
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
