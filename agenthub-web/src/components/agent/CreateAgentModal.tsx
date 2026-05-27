import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Modal, Input, Select, TextArea, Tag, Switch } from "@douyinfe/semi-ui";
import { useCreateAgent, useUpdateAgent } from "@/hooks/useAgents";
import type { Agent } from "@/types";

interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
  initialData?: Agent;
}

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic" },
  { value: "litellm", label: "LiteLLM" },
];

const MODELS_BY_PROVIDER: Record<string, string[]> = {
  anthropic: ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-7"],
  litellm: ["openai/gpt-5", "anthropic/claude-haiku-4-5"],
};

const AVAILABLE_TOOLS = [
  { value: "read_file", label: "读取文件" },
  { value: "write_file", label: "写入文件" },
  { value: "execute_command", label: "执行命令" },
  { value: "web_search", label: "网络搜索" },
];

const CAPABILITY_OPTIONS = ["coding", "docs", "ui", "reasoning", "testing"];

export function CreateAgentModal({ open, onClose, initialData }: CreateAgentModalProps) {
  const isEdit = !!initialData;

  const [name, setName] = useState("");
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);

  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent(initialData?.id ?? "");

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name);
      setProvider(initialData.provider);
      setModel(initialData.model);
      setSystemPrompt(initialData.systemPrompt ?? "");
      setCapabilities(initialData.capabilities ?? []);
      const existingTools = (initialData.toolConfig as { tools?: string[] } | undefined)?.tools;
      setTools(existingTools ?? []);
    } else if (open && !initialData) {
      setName("");
      setSystemPrompt("");
      setCapabilities([]);
      setTools([]);
      setProvider("anthropic");
      setModel("claude-sonnet-4-6");
    }
  }, [open, initialData]);

  const toggleCapability = (cap: string) =>
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );

  const toggleTool = (tool: string) =>
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );

  const resetForm = () => {
    setName("");
    setSystemPrompt("");
    setCapabilities([]);
    setTools([]);
    setProvider("anthropic");
    setModel("claude-sonnet-4-6");
  };

  const handleSubmit = () => {
    if (!name.trim()) return;

    const params = {
      name: name.trim(),
      avatarUrl: "",
      provider,
      model,
      systemPrompt: systemPrompt.trim(),
      capabilities,
      toolConfig: { tools },
    };

    if (isEdit) {
      updateAgent.mutate(params, {
        onSuccess: (data) => {
          toast.success(`Agent "${data?.name || name.trim()}" 更新成功`);
          resetForm();
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "更新失败，请重试");
        },
      });
    } else {
      createAgent.mutate(params, {
        onSuccess: (data) => {
          toast.success(`Agent "${data?.name || name.trim()}" 创建成功`);
          resetForm();
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "创建失败，请重试");
        },
      });
    }
  };

  return (
    <Modal
      visible={open}
      title={isEdit ? "编辑 Agent" : "创建 Agent"}
      onCancel={onClose}
      onOk={handleSubmit}
      okButtonProps={{
        disabled: !name.trim() || createAgent.isPending || updateAgent.isPending,
        loading: createAgent.isPending || updateAgent.isPending,
      }}
      cancelButtonProps={{ theme: "borderless" }}
      maskClosable
      style={{ width: 480 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)", display: "block", marginBottom: 4 }}>
            名称
          </label>
          <Input
            value={name}
            onChange={setName}
            placeholder="例如：前端代码助手"
          />
        </div>

        <div>
          <label style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)", display: "block", marginBottom: 4 }}>
            供应商
          </label>
          <Select
            value={provider}
            onChange={(v) => {
              setProvider(v as string);
              setModel(MODELS_BY_PROVIDER[v as string][0]);
            }}
            optionList={PROVIDERS}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)", display: "block", marginBottom: 4 }}>
            模型
          </label>
          <Select
            value={model}
            onChange={(v) => setModel(v as string)}
            optionList={(MODELS_BY_PROVIDER[provider] ?? []).map((m) => ({ value: m, label: m }))}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)", display: "block", marginBottom: 4 }}>
            System Prompt
          </label>
          <TextArea
            value={systemPrompt}
            onChange={setSystemPrompt}
            placeholder="描述 Agent 的角色和行为..."
            rows={4}
          />
        </div>

        <div>
          <span style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 8, display: "block" }}>
            能力标签
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {CAPABILITY_OPTIONS.map((cap) => (
              <Tag
                key={cap}
                size="small"
                color={capabilities.includes(cap) ? "blue" : "grey"}
                type={capabilities.includes(cap) ? "solid" : "ghost"}
                onClick={() => toggleCapability(cap)}
                style={{ cursor: "pointer" }}
              >
                {cap}
              </Tag>
            ))}
          </div>
        </div>

        <div>
          <span style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 8, display: "block" }}>
            工具集
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {AVAILABLE_TOOLS.map((t) => (
              <div key={t.value} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Switch
                  size="small"
                  checked={tools.includes(t.value)}
                  onChange={() => toggleTool(t.value)}
                />
                <span style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-primary)" }}>
                  {t.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
