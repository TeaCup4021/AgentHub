import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useChatStore } from "@/stores/chatStore";
import { mentionsFromText } from "@/lib/mentionParser";
import type { Agent } from "@/types";

interface ChatInputProps {
  onSend: (content: string, mentions: string[]) => void;
  disabled?: boolean;
  agents: Agent[];
}

function getPlainText(root: HTMLElement): string {
  return root.textContent ?? "";
}

function createMentionChip(agent: Agent): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.textContent = `@${agent.name}`;
  chip.className = "inline rounded bg-blue-100 px-0.5 text-blue-700 font-medium whitespace-nowrap";
  chip.contentEditable = "false";
  chip.setAttribute("data-mention-id", agent.id);
  chip.setAttribute("data-mention-name", agent.name);
  return chip;
}

function insertMentionChip(agent: Agent, container?: HTMLElement) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    if (container) {
      container.appendChild(createMentionChip(agent));
      container.appendChild(document.createTextNode(" "));
    }
    return;
  }

  const range = sel.getRangeAt(0);

  const atIdx = findAtPosition(range);
  if (atIdx !== null) {
    const textNode = atIdx.node;
    const offset = atIdx.offset;
    const text = textNode.textContent ?? "";
    const start = text.lastIndexOf("@", offset);
    if (start !== -1 && start < offset) {
      const beforeText = text.slice(0, start);
      const afterText = text.slice(offset);

      const chip = createMentionChip(agent);
      const space = document.createTextNode(" ");

      const afterNode = document.createTextNode(afterText);
      textNode.textContent = beforeText;

      const parent = textNode.parentNode!;
      parent.insertBefore(chip, textNode.nextSibling);
      parent.insertBefore(space, chip.nextSibling);
      parent.insertBefore(afterNode, space.nextSibling);

      const newRange = document.createRange();
      newRange.setStartAfter(space);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      return;
    }
  }

  range.deleteContents();
  const chip = createMentionChip(agent);
  const space = document.createTextNode(" ");
  range.insertNode(space);
  range.insertNode(chip);
  range.setStartAfter(space);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function findAtPosition(range: Range): { node: Text; offset: number } | null {
  const node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE && node.textContent) {
    const offset = range.startOffset;
    const text = node.textContent.slice(0, offset);
    if (text.includes("@")) return { node: node as Text, offset };
  }
  return null;
}

function getMentionQuery(): { query: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;

  const offset = range.startOffset;
  const text = node.textContent?.slice(0, offset) ?? "";
  const atIdx = text.lastIndexOf("@");
  if (atIdx === -1) return null;

  const afterAt = text.slice(atIdx + 1);
  if (afterAt.includes(" ")) return null;

  return { query: afterAt };
}

export function ChatInput({ onSend, disabled, agents }: ChatInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

  const pendingMention = useChatStore((s) => s.pendingMention);
  const setPendingMention = useChatStore((s) => s.setPendingMention);

  const [isEmptyState, setIsEmptyState] = useState(true);
  const isEmpty = useCallback(() => {
    const el = editorRef.current;
    if (!el) return true;
    return getPlainText(el).trim() === "";
  }, []);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const observer = new MutationObserver(() => {
      setIsEmptyState(isEmpty());
    });
    observer.observe(el, { childList: true, characterData: true, subtree: true });
    setIsEmptyState(isEmpty());
    return () => observer.disconnect();
  }, [isEmpty]);

  const handleSend = useCallback(() => {
    const el = editorRef.current;
    if (!el || disabled) return;
    const plain = getPlainText(el).trim();
    if (!plain) return;
    const mentions = mentionsFromText(plain, agents);
    onSend(plain, mentions);
    setMentionActive(false);
    while (el.firstChild) el.removeChild(el.firstChild);
    el.focus();
  }, [disabled, onSend, agents]);

  useEffect(() => {
    if (disabled) return;
    editorRef.current?.focus();
  }, [disabled]);

  useEffect(() => {
    if (!pendingMention) return;
    const agent = agents.find((a) => a.name === pendingMention);
    if (!agent) { setPendingMention(null); return; }

    const el = editorRef.current;
    if (el) {
      el.focus();
      insertMentionChip(agent, el);
    }
    setPendingMention(null);
  }, [pendingMention, agents, setPendingMention]);

  const matchedAgents = useMemo(() => {
    if (!mentionActive) return [];
    const q = mentionQuery.toLowerCase();
    return agents.filter((a) => a.name.toLowerCase().includes(q) && a.isActive);
  }, [mentionActive, mentionQuery, agents]);

  const tryDetectMention = useCallback(() => {
    setTimeout(() => {
      const mq = getMentionQuery();
      if (mq) {
        setMentionActive(true);
        setMentionQuery(mq.query);
        setMentionIndex(0);
      }
    }, 0);
  }, []);

  const handleInput = useCallback(() => {
    const mq = getMentionQuery();
    if (mq) {
      setMentionActive(true);
      setMentionQuery(mq.query);
      setMentionIndex(0);
    } else {
      setMentionActive(false);
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (mentionActive && matchedAgents.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % matchedAgents.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + matchedAgents.length) % matchedAgents.length);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const agent = matchedAgents[mentionIndex];
        if (agent) insertMentionChip(agent);
        setMentionActive(false);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionActive(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [mentionActive, matchedAgents, mentionIndex, handleSend]);

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "@") tryDetectMention();
  }, [tryDetectMention]);

  const handleSelectMention = useCallback((agent: Agent) => {
    insertMentionChip(agent);
    setMentionActive(false);
    editorRef.current?.focus();
  }, []);

  return (
    <div className="relative border-t border-gray-200 p-4">
      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          {isEmptyState && (
            <div className="absolute inset-0 pointer-events-none px-4 py-2.5 text-sm text-gray-400" style={{ lineHeight: "1.5" }}>
              输入消息... (Enter 发送, Shift+Enter 换行, @ 提及 Agent)
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable={!disabled}
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-400 disabled:bg-gray-100 overflow-y-auto"
            style={{ minHeight: "42px", maxHeight: "200px", lineHeight: "1.5", color: "#1e293b" }}
          />
        </div>

        <button onClick={handleSend} disabled={disabled || isEmptyState}
          className="shrink-0 rounded-lg bg-blue-600 p-2.5 text-white hover:bg-blue-700 disabled:opacity-50">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>

      {mentionActive && (
        <div className="absolute bottom-full left-4 right-16 mb-1">
          <div className="rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
            {matchedAgents.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">无匹配的 Agent</div>
            ) : (
              matchedAgents.map((agent, i) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${i === mentionIndex ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectMention(agent);
                  }}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-medium text-white">
                    {agent.name.charAt(0)}
                  </span>
                  <span>{agent.name}</span>
                  <span className="ml-auto text-xs text-gray-400">{agent.provider}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
