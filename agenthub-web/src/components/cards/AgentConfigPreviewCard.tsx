import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Button, Tag } from "@douyinfe/semi-ui";
import type { Artifact, AgentCreationConfig } from "@/types";
import { agentApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/stores/chatStore";

export function AgentConfigPreviewCard({ artifact }: { artifact: Artifact }) {
  const config = artifact.content as unknown as AgentCreationConfig;
  const meta = config.builderMeta;
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      await agentApi.create({
        name: config.name,
        provider: config.provider as "anthropic" | "litellm" | "claude-code-cli" | "codex-cli",
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        systemPrompt: config.systemPrompt,
        capabilities: config.capabilities,
        toolConfig: config.toolConfig as { tools: Array<{ type: string; name: string }> },
      });
      toast.success(`Agent "${config.name}" 创建成功`);
      qc.invalidateQueries({ queryKey: ["agents"] });
      useChatStore.getState().setPendingPlan(null);
    } catch {
      toast.error("创建失败");
    } finally {
      setCreating(false);
    }
  }, [config, qc]);

  return (
    <div style={{
      border: "1px solid var(--color-border-medium)", borderRadius: "var(--radius-md)",
      background: "var(--color-bg-elevated)", padding: "14px 16px", marginTop: 8,
    }}>
      <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>
        Agent 配置预览
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "6px 12px", fontSize: "var(--font-size-sm)" }}>
        <span style={{ color: "var(--color-text-tertiary)" }}>名称</span>
        <span style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{config.name}</span>
        <span style={{ color: "var(--color-text-tertiary)" }}>供应商</span>
        <span style={{ color: "var(--color-text-secondary)" }}>{config.provider}</span>
        <span style={{ color: "var(--color-text-tertiary)" }}>模型</span>
        <span style={{ color: "var(--color-text-secondary)" }}>{config.model}</span>
        <span style={{ color: "var(--color-text-tertiary)" }}>System Prompt</span>
        <span style={{ color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>
          {config.systemPrompt?.slice(0, 80)}{(config.systemPrompt?.length ?? 0) > 80 ? "..." : ""}
        </span>
        {config.capabilities?.length > 0 && (
          <>
            <span style={{ color: "var(--color-text-tertiary)" }}>能力</span>
            <span>{config.capabilities.map((tag) => <Tag key={tag} size="small" color="blue" style={{ marginRight: 4 }}>{tag}</Tag>)}</span>
          </>
        )}
        {meta?.missingFields && meta.missingFields.length > 0 && (
          <>
            <span style={{ color: "var(--color-text-tertiary)" }}>待补充</span>
            <span>{meta.missingFields.map((field) => <Tag key={field} size="small" color="amber" style={{ marginRight: 4 }}>{field}</Tag>)}</span>
          </>
        )}
        {meta?.warnings && meta.warnings.length > 0 && (
          <>
            <span style={{ color: "var(--color-text-tertiary)" }}>提醒</span>
            <span style={{ color: "var(--color-text-secondary)" }}>{meta.warnings.join("；")}</span>
          </>
        )}
        {meta?.questions && meta.questions.length > 0 && (
          <>
            <span style={{ color: "var(--color-text-tertiary)" }}>追问</span>
            <span style={{ color: "var(--color-text-secondary)" }}>{meta.questions.join("；")}</span>
          </>
        )}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button size="small" theme="solid" type="primary" loading={creating} onClick={handleCreate}>
          确认创建
        </Button>
      </div>
    </div>
  );
}
