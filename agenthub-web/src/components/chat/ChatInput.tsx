import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useChatStore } from "@/stores/chatStore";
import { Button, Popover, Avatar } from "@douyinfe/semi-ui";
import { IconSend } from "@douyinfe/semi-icons";
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
  chip.style.cssText = "display:inline;border-radius:4px;background:var(--color-bg-active);padding:0 4px;color:var(--color-primary);font-weight:500;white-space:nowrap;";
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
    <div style={{
      borderTop: "1px solid var(--color-border-light)",
      padding: "12px 16px",
      background: "var(--color-bg-elevated)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <Popover
          visible={mentionActive && matchedAgents.length > 0}
          trigger="custom"
          position="topLeft"
          content={
            <div style={{ maxHeight: 192, overflowY: "auto", minWidth: 200 }}>
              {matchedAgents.map((agent, i) => (
                <Button
                  key={agent.id}
                  theme="borderless"
                  block
                  style={{
                    justifyContent: "flex-start",
                    background: i === mentionIndex ? "var(--color-bg-active)" : "transparent",
                    borderRadius: "var(--radius-sm)",
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectMention(agent);
                  }}
                >
                  <Avatar size="extra-small" style={{ marginRight: 8 }}>
                    {agent.name.charAt(0)}
                  </Avatar>
                  <span>{agent.name}</span>
                  <span style={{
                    marginLeft: "auto",
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-text-tertiary)",
                  }}>
                    {agent.provider}
                  </span>
                </Button>
              ))}
            </div>
          }
        >
          <div style={{ position: "relative", flex: 1 }}>
            {isEmptyState && (
              <div style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                padding: "10px 16px",
                fontSize: "var(--font-size-md)",
                color: "var(--color-text-disabled)",
                lineHeight: 1.5,
              }}>
                输入消息... (Enter 发送, @ 提及 Agent)
              </div>
            )}
            <div
              ref={editorRef}
              contentEditable={!disabled}
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              style={{
                borderRadius: "var(--radius-md)",
                border: `1px solid var(--color-border-medium)`,
                padding: "10px 16px",
                fontSize: "var(--font-size-md)",
                outline: "none",
                background: disabled ? "var(--color-bg-hover)" : "var(--color-bg-elevated)",
                overflowY: "auto",
                minHeight: 44,
                maxHeight: 200,
                lineHeight: 1.5,
                color: "var(--color-text-primary)",
                transition: "border-color var(--duration-fast) var(--ease-out)",
              }}
            />
          </div>
        </Popover>

        <Button
          theme="solid"
          type="primary"
          icon={<IconSend />}
          disabled={disabled || isEmptyState}
          onClick={handleSend}
          style={{
            borderRadius: "var(--radius-md)",
            flexShrink: 0,
            height: 44,
            width: 44,
          }}
        />
      </div>
    </div>
  );
}
