import { Layout, Button, Typography, Card, ButtonGroup } from "@douyinfe/semi-ui";
import { IconArrowLeft } from "@douyinfe/semi-icons";
import { useNavigate } from "react-router-dom";
import { useUIStore, type Theme } from "@/stores/uiStore";
import { LLMConfigSection } from "./LLMConfigSection";
import { TokenUsagePanel } from "./TokenUsagePanel";

const themeOptions: { key: Theme; label: string }[] = [
  { key: "light", label: "浅色" },
  { key: "dark", label: "深色" },
  { key: "system", label: "跟随系统" },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <Layout style={{ height: "100%" }}>
      <Layout.Header style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 24px",
        background: "var(--color-bg-sidebar)",
        borderBottom: "1px solid var(--color-border-light)",
        height: 56,
      }}>
        <Button
          icon={<IconArrowLeft />}
          theme="borderless"
          onClick={() => navigate("/")}
        />
        <Typography.Title heading={5} style={{ margin: 0, color: "var(--color-text-primary)" }}>
          设置
        </Typography.Title>
      </Layout.Header>
      <Layout.Content style={{ padding: 24, overflow: "auto", background: "var(--color-bg-app)" }}>
        <div style={{ maxWidth: 672, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>
          <section>
            <Typography.Title heading={6} style={{ marginBottom: 8, color: "var(--color-text-primary)" }}>
              外观
            </Typography.Title>
            <Typography.Text type="tertiary" size="small" style={{ display: "block", marginBottom: 16 }}>
              选择界面的颜色模式。
            </Typography.Text>
            <Card>
              <ButtonGroup>
                {themeOptions.map((opt) => (
                  <Button
                    key={opt.key}
                    theme={theme === opt.key ? "solid" : "light"}
                    type={theme === opt.key ? "primary" : "tertiary"}
                    onClick={() => setTheme(opt.key)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </ButtonGroup>
            </Card>
          </section>
          <LLMConfigSection />
          <TokenUsagePanel />
        </div>
      </Layout.Content>
    </Layout>
  );
}
