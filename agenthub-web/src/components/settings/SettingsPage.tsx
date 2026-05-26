import { Layout, Button, Typography } from "@douyinfe/semi-ui";
import { IconArrowLeft } from "@douyinfe/semi-icons";
import { useNavigate } from "react-router-dom";
import { LLMConfigSection } from "./LLMConfigSection";
import { TokenUsagePanel } from "./TokenUsagePanel";

export function SettingsPage() {
  const navigate = useNavigate();

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
          <LLMConfigSection />
          <TokenUsagePanel />
        </div>
      </Layout.Content>
    </Layout>
  );
}
