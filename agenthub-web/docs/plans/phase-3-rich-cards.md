## Phase 3: P1 富媒体卡片

### Task 3.1: 提取卡片渲染器注册表 + 创建独立卡片组件

**Files:**
- Create: `src/components/cards/CardRenderer.tsx`
- Create: `src/components/cards/CodeCard.tsx`
- Create: `src/components/cards/DiffCard.tsx`
- Create: `src/components/cards/PreviewCard.tsx`
- Create: `src/components/cards/FileCard.tsx`
- Create: `src/components/cards/index.ts`

- [ ] **Step 1: 创建 CodeCard 组件**

```typescript
// src/components/cards/CodeCard.tsx
import { useState } from "react";
import type { CodeContent } from "@/types";

interface CodeCardProps {
  content: CodeContent;
}

export function CodeCard({ content }: CodeCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 overflow-hidden rounded-md bg-gray-900 text-left">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700">
        <span className="text-xs text-gray-400">
          {content.fileName || content.language || "code"}
        </span>
        <button
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          onClick={handleCopy}
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 pb-3 text-xs text-gray-200">
        <code>{content.code}</code>
      </pre>
    </div>
  );
}
```

- [ ] **Step 2: 创建 DiffCard 组件**

```typescript
// src/components/cards/DiffCard.tsx
import type { DiffContent } from "@/types";

interface DiffCardProps {
  content: DiffContent;
}

export function DiffCard({ content }: DiffCardProps) {
  return (
    <div className="my-2 overflow-hidden rounded-md border border-gray-300 text-left">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100">
        <span className="text-xs text-gray-600">{content.fileName || "diff"}</span>
        <span className="text-xs text-gray-400">{content.language}</span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-gray-200 text-xs">
        <div className="bg-red-50 px-3 py-2 font-mono whitespace-pre-wrap text-gray-700">
          <div className="mb-1 text-[10px] text-red-500 font-semibold">旧版本</div>
          {content.oldCode}
        </div>
        <div className="bg-green-50 px-3 py-2 font-mono whitespace-pre-wrap text-gray-700">
          <div className="mb-1 text-[10px] text-green-600 font-semibold">新版本</div>
          {content.newCode}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建 PreviewCard 组件**

```typescript
// src/components/cards/PreviewCard.tsx
import { useState } from "react";
import type { PreviewContent } from "@/types";

interface PreviewCardProps {
  content: PreviewContent;
}

export function PreviewCard({ content }: PreviewCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="my-2 overflow-hidden rounded-md border border-gray-300 text-left">
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100">
          <span className="text-xs text-gray-600">
            {content.title || "预览"} ({content.previewType})
          </span>
          <button
            className="text-xs text-blue-600 hover:text-blue-800"
            onClick={() => setExpanded(true)}
          >
            展开
          </button>
        </div>
        <div className="h-48 bg-white">
          <iframe
            src={content.url}
            title={content.title || "preview"}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-[90vw] h-[90vh] rounded-lg bg-white shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <span className="text-sm font-medium">{content.title || "全屏预览"}</span>
              <button
                className="text-gray-500 hover:text-gray-800 text-lg"
                onClick={() => setExpanded(false)}
              >
                ✕
              </button>
            </div>
            <div className="flex-1">
              <iframe
                src={content.url}
                title={content.title || "preview"}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: 创建 FileCard 组件**

```typescript
// src/components/cards/FileCard.tsx
import { formatFileSize } from "@/lib/utils";
import type { FileContent } from "@/types";

interface FileCardProps {
  content: FileContent;
}

export function FileCard({ content }: FileCardProps) {
  return (
    <div className="my-2 rounded-md border border-gray-300 bg-white text-left">
      <a
        href={content.fileUrl}
        download
        className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-800 truncate">{content.fileName}</p>
          <p className="text-[10px] text-gray-500">{formatFileSize(content.fileSize)} · {content.fileType}</p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
      </a>
    </div>
  );
}
```

- [ ] **Step 5: 创建 CardRenderer 注册表**

```typescript
// src/components/cards/CardRenderer.tsx
import { CodeCard } from "./CodeCard";
import { DiffCard } from "./DiffCard";
import { PreviewCard } from "./PreviewCard";
import { FileCard } from "./FileCard";
import type { MessageContent } from "@/types";
import type { FC } from "react";

interface CardProps {
  content: MessageContent;
}

const cardRenderers: Record<string, FC<CardProps>> = {
  code: ({ content }) => <CodeCard content={content as import("@/types").CodeContent} />,
  diff: ({ content }) => <DiffCard content={content as import("@/types").DiffContent} />,
  preview: ({ content }) => <PreviewCard content={content as import("@/types").PreviewContent} />,
  file: ({ content }) => <FileCard content={content as import("@/types").FileContent} />,
  // deploy_status 留到 P2 加
};

export function CardRenderer({ content }: { content: MessageContent }) {
  if (content.type === "text") return null;
  const Renderer = cardRenderers[content.type];
  if (!Renderer) return null;
  return <Renderer content={content} />;
}
```

- [ ] **Step 6: 创建 cards barrel 导出**

```typescript
// src/components/cards/index.ts
export { CardRenderer } from "./CardRenderer";
export { CodeCard } from "./CodeCard";
export { DiffCard } from "./DiffCard";
export { PreviewCard } from "./PreviewCard";
export { FileCard } from "./FileCard";
```

---

### Task 3.2: 将卡片渲染器集成到 MessageList

**Files:**
- Modify: `src/components/chat/MessageList.tsx`

- [ ] **Step 1: 替换内联代码渲染 → 使用 CardRenderer**

在 MessageList.tsx 中将 MessageBubble 和 StreamingMessageBubble 中的内联代码块渲染替换为 CardRenderer：

```typescript
// MessageList.tsx 顶部添加:
import { CardRenderer } from "@/components/cards";

// MessageBubble 的 content.map 改为:
{message.content.map((c, i) => {
  if (c.type === "text") return <TextBubble key={i} text={c.text} />;
  return <CardRenderer key={i} content={c} />;
})}

// StreamingMessageBubble 的 content.map 同样改为:
{content.map((c, i) => {
  if (c.type === "text") return <StreamingTextBubble key={i} text={c.text} />;
  return <CardRenderer key={i} content={c} />;
})}
```

- [ ] **Step 2: 验证编译通过**

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 3.3: 提交 Phase 3

```bash
git add agenthub-web/src/components/cards/ agenthub-web/src/components/chat/MessageList.tsx
git commit -m "feat: Phase 3 — 富媒体卡片组件（Code/Diff/Preview/File）
- 可插拔 CardRenderer 注册表
- CodeCard: 语法高亮 + 文件名 + 复制
- DiffCard: old/new 左右对比视图
- PreviewCard: iframe 内联 + 全屏展开
- FileCard: 文件图标 + 大小 + 下载链接
- MessageList 集成卡片渲染器"
```
