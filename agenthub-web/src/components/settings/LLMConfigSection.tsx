import { useState } from "react";

interface LLMProvider {
  id: string;
  name: string;
  apiKey: string;
  priority: number;
  enabled: boolean;
}

const DEFAULT_PROVIDERS: LLMProvider[] = [
  { id: "anthropic", name: "Anthropic Claude", apiKey: "", priority: 1, enabled: true },
  { id: "openai", name: "OpenAI GPT", apiKey: "", priority: 2, enabled: false },
  { id: "deepseek", name: "DeepSeek", apiKey: "", priority: 3, enabled: false },
];

function loadProviders(): LLMProvider[] {
  try {
    const saved = localStorage.getItem("llm_config");
    return saved ? JSON.parse(saved) : DEFAULT_PROVIDERS;
  } catch {
    return DEFAULT_PROVIDERS;
  }
}

export function LLMConfigSection() {
  const [providers, setProviders] = useState<LLMProvider[]>(loadProviders);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  const persist = (updated: LLMProvider[]) => {
    setProviders(updated);
    localStorage.setItem("llm_config", JSON.stringify(updated));
  };

  const updateProvider = (id: string, updates: Partial<LLMProvider>) => {
    const updated = providers.map((p) => (p.id === id ? { ...p, ...updates } : p));
    persist(updated);
  };

  const movePriority = (id: string, direction: "up" | "down") => {
    const idx = providers.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= providers.length) return;
    const updated = [...providers];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    persist(updated.map((p, i) => ({ ...p, priority: i + 1 })));
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900 mb-3">LLM 配置</h2>
      <p className="text-xs text-gray-500 mb-4">
        配置 AI 模型服务商的 API Key。按优先级排序，主模型不可用时自动切换备用模型。
      </p>
      <div className="space-y-3">
        {providers.map((provider) => (
          <div key={provider.id} className="rounded-lg border border-gray-200 p-4">
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
                <span className="text-[10px] text-gray-400">
                  优先级: {provider.priority}
                </span>
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

            <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
              <div className="flex-1 relative">
                <input
                  type={showKey[provider.id] ? "text" : "password"}
                  value={provider.apiKey}
                  onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                  placeholder={`输入 ${provider.name} API Key...`}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs outline-none focus:border-blue-400 pr-14"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowKey((s) => ({ ...s, [provider.id]: !s[provider.id] }))
                  }
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600 px-2"
                >
                  {showKey[provider.id] ? "隐藏" : "显示"}
                </button>
              </div>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}
