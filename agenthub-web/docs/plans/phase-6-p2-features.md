## Phase 6: P2 部署 + @提及自动补全

### Task 6.1: 创建 DeployStatusCard

**Files:**
- Create: `src/components/cards/DeployStatusCard.tsx`
- Modify: `src/components/cards/CardRenderer.tsx`

- [ ] **Step 1: 创建 DeployStatusCard**

```typescript
// src/components/cards/DeployStatusCard.tsx
import type { DeployStatusContent } from "@/types";

interface DeployStatusCardProps {
  content: DeployStatusContent;
}

const config = {
  building: { bg: "bg-yellow-50 border-yellow-300", label: "构建中...", icon: "⏳" },
  deployed: { bg: "bg-green-50 border-green-300", label: "部署成功", icon: "✓" },
  failed: { bg: "bg-red-50 border-red-300", label: "部署失败", icon: "✕" },
};

export function DeployStatusCard({ content }: DeployStatusCardProps) {
  const c = config[content.status];
  return (
    <div className={`my-2 rounded-md border px-3 py-2.5 ${c.bg} text-left`}>
      <div className="flex items-center gap-2">
        <span className="text-sm">{c.icon}</span>
        <span className="text-xs font-medium">{c.label}</span>
        {content.status === "building" && (
          <span className="ml-auto w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>
      {content.url && content.status === "deployed" && (
        <a href={content.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-blue-600 hover:underline">
          打开预览 → {content.url}
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 注册到 CardRenderer**

在 CardRenderer.tsx 中添加：

```typescript
import { DeployStatusCard } from "./DeployStatusCard";

// 在 cardRenderers 对象末尾添加:
deploy_status: ({ content }) => <DeployStatusCard content={content as import("@/types").DeployStatusContent} />,
```

---

### Task 6.2: 在 ChatInput 中添加 @ 提及自动补全

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`

- [ ] **Step 1: 扩展 ChatInput 支持 @mention 弹出式补全**

```typescript
// src/components/chat/ChatInput.tsx
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useAgents } from "@/hooks/useAgents";

interface ChatInputProps {
  onSend: (content: string, mentions?: string[]) => void;
  disabled?: boolean;
  conversationType?: "single" | "group";
}

export function ChatInput({ onSend, disabled, conversationType }: ChatInputProps) {
  const [text, setText] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: agents = [] } = useAgents();

  // 检测 @ 输入，弹出补全列表
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);

    const cursorPos = e.target.selectionStart;
    const beforeCursor = value.slice(0, cursorPos);
    const atMatch = beforeCursor.match(/@([\w一-龥-]*)$/);

    if (atMatch && conversationType === "group") {
      setMentionFilter(atMatch[1]);
      setShowMentions(true);
      setSelectedIndex(0);
    } else {
      setShowMentions(false);
    }
  }, [conversationType]);

  const filteredAgents = useMemo(
    () => mentionFilter
      ? agents.filter((a) => a.name.toLowerCase().includes(mentionFilter.toLowerCase()))
      : agents,
    [agents, mentionFilter]
  );

  const insertMention = (agent: { id: string; name: string }) => {
    const cursorPos = textareaRef.current?.selectionStart || 0;
    const beforeCursor = text.slice(0, cursorPos);
    const afterCursor = text.slice(cursorPos);
    const newBefore = beforeCursor.replace(/@([\w一-龥-]*)$/, `@[${agent.name}] `);
    setText(newBefore + afterCursor);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && filteredAgents.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredAgents.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filteredAgents.length) % filteredAgents.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredAgents[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowMentions(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    // 提取 @[Name] 中的 agent ID
    const mentionPattern = /@\[([^\]]+)\]/g;
    const mentionedNames: string[] = [];
    let m;
    while ((m = mentionPattern.exec(trimmed)) !== null) {
      mentionedNames.push(m[1]);
    }
    const mentionedIds = mentionedNames
      .map((name) => agents.find((a) => a.name === name)?.id)
      .filter(Boolean) as string[];

    // 清理显示用的 @[name] 为纯文本
    const cleanContent = trimmed.replace(mentionPattern, "@$1");
    onSend(cleanContent, mentionedIds.length > 0 ? mentionedIds : undefined);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [text, disabled, onSend, agents]);

  useEffect(() => { if (!disabled) textareaRef.current?.focus(); }, [disabled]);

  return (
    <div className="border-t border-gray-200 p-4">
      <div className="flex items-end gap-2 relative">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={conversationType === "group"
            ? "输入消息... (Enter 发送, @ 提及Agent)"
            : "输入消息... (Enter 发送, Shift+Enter 换行)"}
          disabled={disabled}
          className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-400 disabled:bg-gray-100"
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 200) + "px";
          }}
        />

        {/* @ 提及下拉 */}
        {showMentions && filteredAgents.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-56 rounded-md border border-gray-200 bg-white shadow-lg max-h-40 overflow-y-auto z-10">
            {filteredAgents.map((agent, i) => (
              <button
                key={agent.id}
                onClick={() => insertMention(agent)}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                  i === selectedIndex ? "bg-blue-50" : "hover:bg-gray-50"
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-gray-300 text-[10px] flex items-center justify-center text-white shrink-0">
                  {agent.name.charAt(0)}
                </span>
                <span>{agent.name}</span>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="rounded-lg bg-blue-600 p-2.5 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译通过**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 6.3: 提交 Phase 6

```bash
git add agenthub-web/src/components/cards/DeployStatusCard.tsx agenthub-web/src/components/cards/CardRenderer.tsx agenthub-web/src/components/chat/ChatInput.tsx
git commit -m "feat: Phase 6 — P2 部署卡片 + @提及自动补全
- DeployStatusCard: 构建中/成功/失败 三种状态
- ChatInput @mention 弹出补全 + 键盘导航
- CardRenderer 注册 deploy_status 类型"
```
