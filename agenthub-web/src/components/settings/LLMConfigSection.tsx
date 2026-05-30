import { useState } from "react";
import { Card, Switch, Input, Button } from "@douyinfe/semi-ui";
import { IconChevronUpDown } from "@douyinfe/semi-icons";

interface LLMProvider {
  id: string;
  name: string;
  apiKey: string;
  priority: number;
  enabled: boolean;
}

const DEFAULT_PROVIDERS: LLMProvider[] = [
  { id: "openai", name: "OpenAI", apiKey: "", priority: 1, enabled: true },
  { id: "anthropic", name: "Anthropic", apiKey: "", priority: 2, enabled: true },
  { id: "gemini", name: "Gemini", apiKey: "", priority: 3, enabled: false },
];

function isValidProvider(v: unknown): v is LLMProvider {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === "string"
    && typeof p.name === "string"
    && typeof p.apiKey === "string"
    && typeof p.priority === "number"
    && typeof p.enabled === "boolean";
}

function loadProviders(): LLMProvider[] {
  try {
    const saved = localStorage.getItem("llm_config");
    if (!saved) return DEFAULT_PROVIDERS;
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.every(isValidProvider)) return parsed;
    return DEFAULT_PROVIDERS;
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
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>
        LLM 配置
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
        配置 AI 模型提供商及 API 密钥，优先级高的 Provider 优先使用
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {providers.map((provider) => {
          const disabled = !provider.enabled;
          const connected = provider.apiKey.length > 0;
          return (
            <Card
              key={provider.id}
              style={{
                padding: "10px 14px",
                opacity: disabled ? 0.55 : 1,
                transition: "opacity 0.15s",
              }}
              bodyStyle={{ padding: 0 }}
            >
              {/* Row 1: controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32 }}>
                <Switch
                  size="small"
                  checked={provider.enabled}
                  onChange={(checked) => updateProvider(provider.id, { enabled: checked })}
                />
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
                  {provider.name}
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: "rgba(51,112,255,0.1)",
                  color: "var(--color-primary)",
                }}>
                  P{provider.priority}
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: connected ? "rgba(0,168,112,0.1)" : "var(--semi-color-fill-0)",
                  color: connected ? "var(--color-success)" : "var(--color-text-tertiary)",
                }}>
                  {connected ? "已连接" : "未启用"}
                </span>
                <div style={{ flex: 1 }} />
                <Button
                  size="small"
                  theme="borderless"
                  onClick={() => movePriority(provider.id, "up")}
                  disabled={disabled || provider.priority <= 1}
                  icon={<IconChevronUpDown style={{ transform: "rotate(180deg)" }} />}
                  style={{ minWidth: 24, height: 24, padding: 0 }}
                />
                <Button
                  size="small"
                  theme="borderless"
                  onClick={() => movePriority(provider.id, "down")}
                  disabled={disabled || provider.priority >= providers.length}
                  icon={<IconChevronUpDown />}
                  style={{ minWidth: 24, height: 24, padding: 0 }}
                />
              </div>

              {/* Row 2: API Key */}
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", whiteSpace: "nowrap", flexShrink: 0 }}>
                  API Key
                </span>
                <Input
                  type={showKey[provider.id] ? "text" : "password"}
                  value={provider.apiKey}
                  onChange={(v) => updateProvider(provider.id, { apiKey: v })}
                  placeholder={"输入 " + provider.name + " API Key"}
                  size="small"
                  disabled={disabled}
                  style={{ flex: 1, height: 32 }}
                  suffix={
                    <Button
                      size="small"
                      theme="borderless"
                      disabled={disabled}
                      onClick={() => setShowKey((s) => ({ ...s, [provider.id]: !s[provider.id] }))}
                      style={{ fontSize: 12 }}
                    >
                      {showKey[provider.id] ? "隐藏" : "显示"}
                    </Button>
                  }
                />
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
