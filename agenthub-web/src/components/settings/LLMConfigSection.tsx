import { useState } from "react";
import { Card, Switch, Input, Button, Typography } from "@douyinfe/semi-ui";
import { IconChevronUpDown } from "@douyinfe/semi-icons";

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
      <Typography.Title heading={6} style={{ marginBottom: 8, color: "var(--color-text-primary)" }}>
        LLM 配置
      </Typography.Title>
      <Typography.Text type="tertiary" size="small" style={{ display: "block", marginBottom: 16 }}>
        配置 AI 模型服务商的 API Key。按优先级排序，主模型不可用时自动切换备用模型。
      </Typography.Text>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {providers.map((provider) => (
          <Card key={provider.id}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Switch
                  size="small"
                  checked={provider.enabled}
                  onChange={(checked) => updateProvider(provider.id, { enabled: checked })}
                />
                <span style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)" }}>
                  {provider.name}
                </span>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-tertiary)" }}>
                  优先级: {provider.priority}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Button
                  size="small"
                  theme="borderless"
                  onClick={() => movePriority(provider.id, "up")}
                  disabled={provider.priority <= 1}
                  icon={<IconChevronUpDown style={{ transform: "rotate(180deg)" }} />}
                />
                <Button
                  size="small"
                  theme="borderless"
                  onClick={() => movePriority(provider.id, "down")}
                  disabled={provider.priority >= providers.length}
                  icon={<IconChevronUpDown />}
                />
              </div>
            </div>

            <Input
              type={showKey[provider.id] ? "text" : "password"}
              value={provider.apiKey}
              onChange={(v) => updateProvider(provider.id, { apiKey: v })}
              placeholder={`输入 ${provider.name} API Key...`}
              size="small"
              suffix={
                <Button
                  size="small"
                  theme="borderless"
                  onClick={() => setShowKey((s) => ({ ...s, [provider.id]: !s[provider.id] }))}
                >
                  {showKey[provider.id] ? "隐藏" : "显示"}
                </Button>
              }
            />
          </Card>
        ))}
      </div>
    </section>
  );
}
