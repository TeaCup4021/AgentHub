## Phase 7: P1 ReAct 推理可视化

> 源自 OpenAkita 的 ReAct 推理 UI。将 Agent 的"思考→行动→观察"过程以可折叠步骤卡片形式内联展示在消息气泡中。

### Task 7.1: 创建 ThinkingBlock 组件

**Files:**
- Create: `src/components/chat/ThinkingBlock.tsx`

- [ ] **Step 1: 创建 ThinkingBlock 组件**

```typescript
// src/components/chat/ThinkingBlock.tsx
import { useState } from "react";
import type { ThinkingStep } from "@/types";

const phaseConfig: Record<string, { icon: string; color: string; label: string }> = {
  thought: { icon: "💭", color: "text-purple-600 bg-purple-50 border-purple-200", label: "思考" },
  action: { icon: "🔧", color: "text-blue-600 bg-blue-50 border-blue-200", label: "行动" },
  observation: { icon: "👁", color: "text-green-600 bg-green-50 border-green-200", label: "观察" },
};

const statusConfig: Record<string, string> = {
  pending: "text-gray-400",
  running: "text-blue-500 animate-pulse",
  done: "text-green-500",
  error: "text-red-500",
};

interface ThinkingBlockProps {
  title: string;
  steps: ThinkingStep[];
  isStreaming?: boolean;
}

export function ThinkingBlock({ title, steps, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <div className="my-2 rounded-lg border border-gray-200 overflow-hidden text-left">
      {/* 标题栏 — 可点击折叠/展开 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm">
          {isStreaming ? "🔍" : "💭"}
        </span>
        <span className="text-xs font-medium text-gray-700 flex-1 text-left">
          {isStreaming ? "思考中..." : `推理过程 (${doneCount}/${steps.length} 步)`}
        </span>
        <span className="text-xs text-gray-400">
          {expanded ? "收起 ▲" : "展开 ▼"}
        </span>
      </button>

      {/* 步骤列表 — 展开时显示 */}
      {expanded && (
        <div className="px-3 py-2 space-y-2">
          {steps.map((step, i) => {
            const cfg = phaseConfig[step.phase] || phaseConfig.thought;
            return (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${cfg.color}`}
              >
                <span className="shrink-0 mt-0.5">{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{cfg.label}</span>
                    {step.toolName && (
                      <span className="text-[10px] bg-white/50 rounded px-1">
                        {step.toolName}
                      </span>
                    )}
                    {step.status && (
                      <span className={`text-[10px] ${statusConfig[step.status]}`}>
                        {step.status === "running" ? "..." :
                         step.status === "done" ? "✓" :
                         step.status === "error" ? "✕" : ""}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-gray-600 whitespace-pre-wrap">{step.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

---

### Task 7.2: 扩展类型定义支持 ThinkingStep

**Files:**
- Modify: `src/types/chat.ts`

- [ ] **Step 1: 在 MessageContent 联合类型中添加 thinking 类型**

```typescript
// src/types/chat.ts — 在 MessageContent 中添加:

export interface ThinkingStep {
  phase: "thought" | "action" | "observation";
  text: string;
  toolName?: string;
  status?: "pending" | "running" | "done" | "error";
}

// 在 MessageContent 联合类型中添加:
// | { type: "thinking"; title: string; steps: ThinkingStep[] }
```

---

### Task 7.3: 扩展 SSE 客户端支持 thinking 事件

**Files:**
- Modify: `src/lib/sse.ts`
- Modify: `src/types/chat.ts`

- [ ] **Step 1: 在 sse.ts 中添加 thinking 事件处理**

```typescript
// src/lib/sse.ts — eventHandlers 对象中添加:

thinking: (d) => callbacks.onThinking?.(d as import("@/types").SSEThinking),
```

- [ ] **Step 2: 在 SSECallbacks 接口中添加 onThinking 回调**

```typescript
export interface SSECallbacks {
  // ... existing callbacks ...
  onThinking?: (data: SSETinkingEvent) => void;
}
```

- [ ] **Step 3: 定义 SSEThinking 事件类型**

```typescript
// src/types/chat.ts

export interface SSEThinking {
  version: string;
  event_id: string;
  conversation_id: string;
  message_id: string;
  phase: "thought" | "action" | "observation";
  text: string;
  tool_name?: string;
  status: "pending" | "done" | "error";
  step_index: number;
  timestamp: string;
}
```

---

### Task 7.4: 扩展 chatStore 支持 thinking 内容

**Files:**
- Modify: `src/stores/chatStore.ts`

- [ ] **Step 1: 添加 appendThinkingStep 方法**

```typescript
// src/stores/chatStore.ts — ChatUIState 接口中添加:

appendThinkingStep: (messageId: string, step: ThinkingStep) => void;
getThinkingSteps: (messageId: string) => ThinkingStep[];

// 在 create() 的实现中添加:

appendThinkingStep: (messageId, step) =>
  set((s) => {
    const contents = [...(s.streamingContent[messageId] || [])];
    const last = contents[contents.length - 1];
    if (last && last.type === "thinking") {
      // 更新已有 thinking block
      const existingSteps = [...last.steps];
      const idx = existingSteps.findIndex((st) => st.phase === step.phase && st.text === step.text);
      if (idx >= 0) {
        existingSteps[idx] = step;
      } else {
        existingSteps.push(step);
      }
      contents[contents.length - 1] = { ...last, steps: existingSteps };
    } else {
      // 创建新的 thinking block
      contents.push({ type: "thinking", title: "推理过程", steps: [step] });
    }
    return { streamingContent: { ...s.streamingContent, [messageId]: contents } };
  }),

getThinkingSteps: (messageId) => {
  const contents = get().streamingContent[messageId] || [];
  const thinking = contents.find((c) => c.type === "thinking");
  return thinking?.type === "thinking" ? thinking.steps : [];
},
```

---

### Task 7.5: 集成 ThinkingBlock 到 MessageList

**Files:**
- Modify: `src/components/chat/MessageList.tsx`

- [ ] **Step 1: 在 MessageBubble 和 StreamingMessageBubble 中渲染 thinking 类型**

```typescript
// MessageList.tsx — 在 content.map 中添加:
import { ThinkingBlock } from "./ThinkingBlock";

// 在 MessageBubble 的渲染中添加:
if (c.type === "thinking") {
  return <ThinkingBlock key={i} title={c.title} steps={c.steps} />;
}

// 在 StreamingMessageBubble 中同样添加:
if (c.type === "thinking") {
  return <ThinkingBlock key={i} title={c.title} steps={c.steps} isStreaming />;
}
```

---

### Task 7.6: 扩展 ChatArea 处理 thinking SSE 事件

**Files:**
- Modify: `src/components/layout/ChatArea.tsx`

- [ ] **Step 1: 在 createSSEStream 调用中添加 onThinking 回调**

```typescript
onThinking: (data) => {
  if (streamMsgIdRef.current) {
    appendThinkingStep(streamMsgIdRef.current, {
      phase: data.phase,
      text: data.text,
      toolName: data.tool_name,
      status: data.status,
    });
  }
},
```

- [ ] **Step 2: 从 chatStore 解构 appendThinkingStep**

```typescript
const appendThinkingStep = useChatStore((s) => s.appendThinkingStep);
```

---

### Task 7.7: 验证编译

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 7.8: 提交 Phase 7

```bash
git add agenthub-web/src/components/chat/ThinkingBlock.tsx \
        agenthub-web/src/types/chat.ts \
        agenthub-web/src/lib/sse.ts \
        agenthub-web/src/stores/chatStore.ts \
        agenthub-web/src/components/chat/MessageList.tsx \
        agenthub-web/src/components/layout/ChatArea.tsx
git commit -m "feat: Phase 7 — ReAct 推理可视化 (ThinkingBlock)
- ThinkingBlock 组件: 可折叠推理步骤卡片
- 支持 thought/action/observation 三阶段展示
- 新增 SSE thinking 事件支持
- 新增 MessageContent thinking 类型
- chatStore 新增 appendThinkingStep 方法
- MessageList / ChatArea 集成 thinking 渲染

源自 OpenAkita 的 ReAct 推理 UI 设计"
```
