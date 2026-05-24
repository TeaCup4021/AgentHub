## Phase 4: P1 Agent 管理

### Task 4.1: 创建 Agent 表单模态框

**Files:**
- Create: `src/components/agent/CreateAgentModal.tsx`
- Create: `src/components/agent/index.ts`

- [ ] **Step 1: 创建 CreateAgentModal**

```typescript
// src/components/agent/CreateAgentModal.tsx
import { useState } from "react";
import { useCreateAgent } from "@/hooks/useAgents";

interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
}

const AVAILABLE_TOOLS = [
  { value: "read_file", label: "读取文件" },
  { value: "write_file", label: "写入文件" },
  { value: "execute_command", label: "执行命令" },
  { value: "web_search", label: "网络搜索" },
];

const CAPABILITY_OPTIONS = ["coding", "docs", "ui", "reasoning", "testing"];

export function CreateAgentModal({ open, onClose }: CreateAgentModalProps) {
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);

  const createAgent = useCreateAgent();

  const toggleCapability = (cap: string) =>
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );

  const toggleTool = (tool: string) =>
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );

  const handleCreate = () => {
    if (!name.trim()) return;
    createAgent.mutate(
      { name: name.trim(), avatar: "", systemPrompt: systemPrompt.trim(), tools },
      { onSuccess: () => { setName(""); setSystemPrompt(""); setCapabilities([]); setTools([]); onClose(); } }
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-[440px] max-h-[80vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">创建 Agent</h2>

        {/* 名称 */}
        <label className="block mb-3">
          <span className="text-sm font-medium text-gray-700">名称</span>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="例如：前端代码助手"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400"
          />
        </label>

        {/* System Prompt */}
        <label className="block mb-3">
          <span className="text-sm font-medium text-gray-700">System Prompt</span>
          <textarea
            rows={4} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="描述 Agent 的角色和行为..."
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none"
          />
        </label>

        {/* 能力标签 */}
        <div className="mb-3">
          <span className="text-sm font-medium text-gray-700">能力标签</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {CAPABILITY_OPTIONS.map((cap) => (
              <button key={cap} onClick={() => toggleCapability(cap)}
                className={`rounded-full px-2.5 py-0.5 text-xs border transition-colors ${
                  capabilities.includes(cap)
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                }`}>
                {cap}
              </button>
            ))}
          </div>
        </div>

        {/* 工具集 */}
        <div className="mb-4">
          <span className="text-sm font-medium text-gray-700">工具集</span>
          <div className="mt-1 space-y-1">
            {AVAILABLE_TOOLS.map((t) => (
              <label key={t.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={tools.includes(t.value)} onChange={() => toggleTool(t.value)} className="rounded" />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">取消</button>
          <button onClick={handleCreate} disabled={!name.trim() || createAgent.isPending}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            {createAgent.isPending ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 barrel 导出**

```typescript
// src/components/agent/index.ts
export { CreateAgentModal } from "./CreateAgentModal";
```

---

### Task 4.2: 将 CreateAgentModal 接入 Sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: 在 Sidebar 操作栏添加 Agent 创建按钮**

在 Sidebar.tsx 顶部添加 import：

```typescript
import { CreateAgentModal } from "@/components/agent";
```

在组件内添加 state：

```typescript
const [showCreateAgent, setShowCreateAgent] = useState(false);
```

在操作栏新建对话按钮旁边添加 Agent 创建按钮：

```typescript
<button
  onClick={() => setShowCreateAgent(true)}
  className="rounded-md p-1.5 text-gray-500 hover:bg-sidebar-hover"
  title="创建 Agent"
>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2a4 4 0 014 4v1h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4z" />
    <circle cx="9" cy="14" r="1.5" fill="currentColor" /><circle cx="15" cy="14" r="1.5" fill="currentColor" />
  </svg>
</button>
```

在 `</aside>` 之前添加模态框：

```typescript
<CreateAgentModal open={showCreateAgent} onClose={() => setShowCreateAgent(false)} />
```

---

### Task 4.3: 提交 Phase 4

```bash
git add agenthub-web/src/components/agent/ agenthub-web/src/components/layout/Sidebar.tsx
git commit -m "feat: Phase 4 — Agent 创建表单模态框
- CreateAgentModal: 名称/System Prompt/能力标签/工具集
- 接入 Sidebar 顶部操作栏"
```
