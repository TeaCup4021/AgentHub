import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Modal, Input, Select, TextArea, Tag, Switch, Button } from "@douyinfe/semi-ui";
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
  { value: "claude-code-cli", label: "Claude Code CLI" },
  { value: "codex-cli", label: "Codex CLI" },
];

/** 与后端 cli_tools.py @register_builtin 注册的工具一一对应 */
const AVAILABLE_TOOLS = [
  { value: "read_file", label: "读取文件" },
  { value: "create_file", label: "新增文件 / PDF" },
  { value: "edit_file", label: "修改文件" },
  { value: "execute_command", label: "执行命令" },
  { value: "web_search", label: "网络搜索" },
  { value: "upload_file", label: "上传文件" },
  { value: "preview_publish", label: "发布预览" },
];

/** 从 tool_config 提取工具名列表，兼容旧格式 (string[]) 和新格式 ({type,name}[]) */
function extractToolNames(toolConfig: Record<string, unknown> | undefined): string[] {
  const rawTools = toolConfig?.tools;
  if (!Array.isArray(rawTools)) return [];
  return rawTools
    .map((t: unknown) => {
      if (typeof t === "string") return t;
      if (t && typeof t === "object" && "name" in (t as Record<string, unknown>))
        return (t as Record<string, unknown>).name as string;
      return null;
    })
    .filter((n): n is string => typeof n === "string" && n.length > 0);
}

const CLI_PROVIDERS = ["claude-code-cli", "codex-cli"];
const isCliProvider = (p: string) => CLI_PROVIDERS.includes(p);

export function CreateAgentModal({ open, onClose, initialData }: CreateAgentModalProps) {
  const isEdit = !!initialData;

  const [name, setName] = useState("");
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [capabilityInput, setCapabilityInput] = useState("");
  const [tools, setTools] = useState<string[]>([]);

  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent(initialData?.id ?? "");

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name);
      setProvider(initialData.provider);
      setModel(initialData.model);
      setBaseUrl(initialData.baseUrl ?? "");
      setApiKey(initialData.apiKey ?? "");  // 脱敏值，用户覆盖时替换
      setSystemPrompt(initialData.systemPrompt ?? "");
      setCapabilities(initialData.capabilities ?? []);
      setTools(extractToolNames(initialData.toolConfig as Record<string, unknown> | undefined));
      setCapabilityInput("");
    } else if (open && !initialData) {
      setName("");
      setProvider("anthropic");
      setModel("");
      setBaseUrl("");
      setApiKey("");
      setSystemPrompt("");
      setCapabilities([]);
      setTools([]);
      setCapabilityInput("");
    }
  }, [open, initialData]);

  const addCapability = () => {
    const trimmed = capabilityInput.trim();
    if (trimmed && !capabilities.includes(trimmed)) {
      setCapabilities((prev) => [...prev, trimmed]);
    }
    setCapabilityInput("");
  };

  const removeCapability = (cap: string) =>
    setCapabilities((prev) => prev.filter((c) => c !== cap));

  const handleCapabilityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCapability();
    }
  };

  const toggleTool = (tool: string) =>
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );

  const resetForm = () => {
    setName("");
    setProvider("anthropic");
    setModel("");
    setBaseUrl("");
    setApiKey("");
    setSystemPrompt("");
    setCapabilities([]);
    setCapabilityInput("");
    setTools([]);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (!isCliProvider(provider)) {
      if (!model.trim()) {
        toast.error("请输入模型名称");
        return;
      }
      if (!baseUrl.trim()) {
        toast.error("请输入模型基址（base_url）");
        return;
      }
      if (!apiKey.trim()) {
        toast.error("请输入 API Key");
        return;
      }
    }

    const params = {
      name: name.trim(),
      avatarUrl: "",
      provider,
      model: isCliProvider(provider) ? "cli-default" : model.trim(),
      baseUrl: isCliProvider(provider) ? "" : baseUrl.trim(),
      apiKey: isCliProvider(provider) ? "" : apiKey.trim(),
      systemPrompt: systemPrompt.trim(),
      capabilities,
      toolConfig: tools.length > 0
        ? { tools: tools.map((name) => ({ type: "builtin", name })) }
        : undefined,
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
            onChange={(v) => setProvider(v as string)}
            optionList={PROVIDERS}
            style={{ width: "100%" }}
          />
        </div>

        {!isCliProvider(provider) && (
          <>
            <div>
              <label style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)", display: "block", marginBottom: 4 }}>
                模型
              </label>
              <Input
                value={model}
                onChange={setModel}
                placeholder="例如：claude-sonnet-4-6"
              />
            </div>

            <div>
              <label style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)", display: "block", marginBottom: 4 }}>
                模型基址
              </label>
              <Input
                value={baseUrl}
                onChange={setBaseUrl}
                placeholder="例如：https://api.openai.com/v1"
              />
            </div>

            <div>
              <label style={{ fontSize: "var(--font-size-md)", fontWeight: 500, color: "var(--color-text-primary)", display: "block", marginBottom: 4 }}>
                API Key
              </label>
              <Input
                value={apiKey}
                onChange={setApiKey}
                placeholder="sk-..."
                mode="password"
              />
            </div>
          </>
        )}

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
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Input
              value={capabilityInput}
              onChange={setCapabilityInput}
              placeholder="输入标签后按回车添加"
              onKeyDown={handleCapabilityKeyDown}
              style={{ flex: 1 }}
            />
            <Button
              size="small"
              onClick={addCapability}
              disabled={!capabilityInput.trim()}
            >
              添加
            </Button>
          </div>
          {capabilities.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {capabilities.map((cap) => (
                <Tag
                  key={cap}
                  size="small"
                  color="blue"
                  type="solid"
                  closable
                  onClose={() => removeCapability(cap)}
                >
                  {cap}
                </Tag>
              ))}
            </div>
          )}
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
