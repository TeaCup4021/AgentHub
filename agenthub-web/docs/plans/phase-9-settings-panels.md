## Phase 9: P2 LLM 配置 + 用量统计面板

> 源自 OpenAkita 的 LLM 端点管理器和 Token 统计面板。在设置页中增加 LLM 配置区域和 token 用量面板。

### Task 9.1: 创建 Settings 路由和布局

**Files:**
- Create: `src/components/settings/SettingsPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 Settings 页面壳**

```typescript
// src/components/settings/SettingsPage.tsx
import { LLMConfigSection } from "./LLMConfigSection";
import { TokenUsagePanel } from "./TokenUsagePanel";

export function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      <h1 className="text-xl font-bold text-gray-900">设置</h1>
      <LLMConfigSection />
      <TokenUsagePanel />
    </div>
  );
}
```

- [ ] **Step 2: 在 App.tsx 中添加 /settings 路由**

```typescript
// App.tsx — 在 <Routes> 中添加:
import { SettingsPage } from "@/components/settings/SettingsPage";

<Route path="/settings" element={<SettingsPage />} />
```

- [ ] **Step 3: 在 Sidebar 底部添加设置入口**

```typescript
// Sidebar.tsx — 在 nav 下方添加:
import { useNavigate } from "react-router-dom";

const navigate = useNavigate();

// 在侧边栏底部:
<div className="border-t border-gray-200 px-3 py-2">
  <button
    onClick={() => navigate("/settings")}
    className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-xs text-gray-600 hover:bg-sidebar-hover"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
    设置
  </button>
</div>
```

---

### Task 9.2: 创建 LLMConfigSection 组件

**Files:**
- Create: `src/components/settings/LLMConfigSection.tsx`

- [ ] **Step 1: 创建 LLM 配置区域**

```typescript
// src/components/settings/LLMConfigSection.tsx
import { useState } from "react";

interface LLMProvider {
  id: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
  priority: number;
  enabled: boolean;
}

const DEFAULT_PROVIDERS: LLMProvider[] = [
  { id: "anthropic", name: "Anthropic Claude", apiKey: "", priority: 1, enabled: true },
  { id: "openai", name: "OpenAI GPT", apiKey: "", priority: 2, enabled: false },
  { id: "deepseek", name: "DeepSeek", apiKey: "", priority: 3, enabled: false },
];

export function LLMConfigSection() {
  const [providers, setProviders] = useState<LLMProvider[]>(() => {
    try {
      const saved = localStorage.getItem("llm_config");
      return saved ? JSON.parse(saved) : DEFAULT_PROVIDERS;
    } catch {
      return DEFAULT_PROVIDERS;
    }
  });

  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  const updateProvider = (id: string, updates: Partial<LLMProvider>) => {
    setProviders((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
      localStorage.setItem("llm_config", JSON.stringify(updated));
      return updated;
    });
  };

  const movePriority = (id: string, direction: "up" | "down") => {
    setProviders((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const updated = [...prev];
      [updated[idx], updated[target]] = [updated[target], updated[idx]];
      // 重新分配 priority
      return updated.map((p, i) => ({ ...p, priority: i + 1 }));
    });
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900 mb-3">LLM 配置</h2>
      <p className="text-xs text-gray-500 mb-4">
        配置 AI 模型服务商的 API Key。按优先级排序，主模型不可用时自动切换备用模型。
      </p>
      <div className="space-y-3">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className="rounded-lg border border-gray-200 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={provider.enabled}
                    onChange={(e) => updateProvider(provider.id, { enabled: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-gray-800">{provider.name}</span>
                </label>
                <span className="text-[10px] text-gray-400">优先级: {provider.priority}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => movePriority(provider.id, "up")}
                  disabled={provider.priority <= 1}
                  className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  onClick={() => movePriority(provider.id, "down")}
                  disabled={provider.priority >= providers.length}
                  className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type={showKey[provider.id] ? "text" : "password"}
                  value={provider.apiKey}
                  onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                  placeholder={`输入 ${provider.name} API Key...`}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs outline-none focus:border-blue-400 pr-14"
                />
                <button
                  onClick={() => setShowKey((s) => ({ ...s, [provider.id]: !s[provider.id] }))}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600 px-2"
                >
                  {showKey[provider.id] ? "隐藏" : "显示"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

---

### Task 9.3: 创建 TokenUsagePanel 组件

**Files:**
- Create: `src/components/settings/TokenUsagePanel.tsx`
- Create: `src/stores/tokenUsageStore.ts`

- [ ] **Step 1: 创建 tokenUsageStore**

```typescript
// src/stores/tokenUsageStore.ts
import { create } from "zustand";

export interface TokenUsage {
  conversationId: string;
  conversationTitle: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number; // USD
}

interface TokenUsageState {
  usageMap: Record<string, TokenUsage>;
  addUsage: (usage: TokenUsage) => void;
  getByConversation: (convId: string) => TokenUsage | undefined;
  getAll: () => TokenUsage[];
}

// 默认模型单价 (per 1M tokens)
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "gpt-4o": { input: 2.5, output: 10 },
};

export const useTokenUsageStore = create<TokenUsageState>((set, get) => ({
  usageMap: {},
  addUsage: (usage) =>
    set((s) => {
      const existing = s.usageMap[usage.conversationId];
      if (existing) {
        return {
          usageMap: {
            ...s.usageMap,
            [usage.conversationId]: {
              ...existing,
              inputTokens: existing.inputTokens + usage.inputTokens,
              outputTokens: existing.outputTokens + usage.outputTokens,
              totalTokens: existing.totalTokens + usage.totalTokens,
              estimatedCost: existing.estimatedCost + usage.estimatedCost,
            },
          },
        };
      }
      return { usageMap: { ...s.usageMap, [usage.conversationId]: usage } };
    }),
  getByConversation: (convId) => get().usageMap[convId],
  getAll: () => Object.values(get().usageMap),
}));
```

- [ ] **Step 2: 创建 TokenUsagePanel 组件**

```typescript
// src/components/settings/TokenUsagePanel.tsx
import { useTokenUsageStore } from "@/stores/tokenUsageStore";

export function TokenUsagePanel() {
  const usages = useTokenUsageStore((s) => s.getAll());

  const totalInput = usages.reduce((sum, u) => sum + u.inputTokens, 0);
  const totalOutput = usages.reduce((sum, u) => sum + u.outputTokens, 0);
  const totalCost = usages.reduce((sum, u) => sum + u.estimatedCost, 0);

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Token 用量</h2>
      <p className="text-xs text-gray-500 mb-4">
        统计各会话的 Token 消耗和预估成本。数据从每次会话完成后累积。
      </p>

      {/* 总览卡片 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">输入 Token</p>
          <p className="text-lg font-semibold text-gray-800">
            {(totalInput / 1000).toFixed(1)}k
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">输出 Token</p>
          <p className="text-lg font-semibold text-gray-800">
            {(totalOutput / 1000).toFixed(1)}k
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">预估成本</p>
          <p className="text-lg font-semibold text-gray-800">
            ${totalCost.toFixed(4)}
          </p>
        </div>
      </div>

      {/* 按会话分组的用量列表 */}
      {usages.length > 0 ? (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-gray-50 text-[10px] font-medium text-gray-500">
            <span>会话</span>
            <span className="text-right">输入</span>
            <span className="text-right">输出</span>
            <span className="text-right">成本</span>
          </div>
          {usages
            .sort((a, b) => b.totalTokens - a.totalTokens)
            .map((u) => (
              <div
                key={u.conversationId}
                className="grid grid-cols-4 gap-2 px-3 py-2 border-t border-gray-100 text-xs"
              >
                <span className="text-gray-800 truncate">{u.conversationTitle}</span>
                <span className="text-right text-gray-500">{(u.inputTokens / 1000).toFixed(1)}k</span>
                <span className="text-right text-gray-500">{(u.outputTokens / 1000).toFixed(1)}k</span>
                <span className="text-right text-gray-600">${u.estimatedCost.toFixed(4)}</span>
              </div>
            ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 py-4 text-center">
          暂无用量数据，完成对话后自动统计
        </p>
      )}
    </section>
  );
}
```

---

### Task 9.4: 在 ChatArea 中累积 token 用量

**Files:**
- Modify: `src/components/layout/ChatArea.tsx`

- [ ] **Step 1: 在 onMessageEnd 回调中记录 usage**

```typescript
import { useTokenUsageStore } from "@/stores/tokenUsageStore";

const addUsage = useTokenUsageStore((s) => s.addUsage);

// 在 onMessageEnd 回调中添加:
onMessageEnd: (data) => {
  // ... 现有的 finalizeStreaming 逻辑 ...
  if (data.usage && conversation) {
    const MODEL_PRICE = { input: 3, output: 15 }; // 默认 Claude Sonnet 价格
    addUsage({
      conversationId: activeId!,
      conversationTitle: conversation.title,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      estimatedCost:
        (data.usage.input_tokens / 1_000_000) * MODEL_PRICE.input +
        (data.usage.output_tokens / 1_000_000) * MODEL_PRICE.output,
    });
  }
},
```

---

### Task 9.5: 创建 settings barrel 导出

**Files:**
- Create: `src/components/settings/index.ts`

```typescript
// src/components/settings/index.ts
export { SettingsPage } from "./SettingsPage";
export { LLMConfigSection } from "./LLMConfigSection";
export { TokenUsagePanel } from "./TokenUsagePanel";
```

---

### Task 9.6: 验证编译

```bash
cd agenthub-web && npx tsc -b --noEmit
```

---

### Task 9.7: 提交 Phase 9

```bash
git add agenthub-web/src/components/settings/ \
        agenthub-web/src/stores/tokenUsageStore.ts \
        agenthub-web/src/components/layout/Sidebar.tsx \
        agenthub-web/src/components/layout/ChatArea.tsx \
        agenthub-web/src/App.tsx
git commit -m "feat: Phase 9 — LLM 配置 + Token 用量面板
- SettingsPage: /settings 路由 + 设置入口
- LLMConfigSection: API Key 管理 + 优先级排序 + 启用/禁用
- TokenUsagePanel: 按会话 Token 统计 + 成本估算
- tokenUsageStore: 用法聚合 + 累积计算
- ChatArea onMessageEnd 集成 usage 记录

源自 OpenAkita 的 LLM 端点管理和 Token 统计面板设计"
```
