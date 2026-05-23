import { useState, useCallback, useRef, useEffect } from "react";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!disabled) textareaRef.current?.focus(); }, [disabled]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [text, disabled, onSend]);

  return (
    <div className="border-t border-gray-200 p-4">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef} rows={1} value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          disabled={disabled}
          className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-400 disabled:bg-gray-100"
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 200) + "px";
          }}
        />
        <button onClick={handleSend} disabled={disabled || !text.trim()}
          className="rounded-lg bg-blue-600 p-2.5 text-white hover:bg-blue-700 disabled:opacity-50">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
