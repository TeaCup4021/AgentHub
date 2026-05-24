import { useState } from "react";
import { useCreateAgent } from "@/hooks/useAgents";

interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
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

export function CreateAgentModal({ open, onClose }: CreateAgentModalProps) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("claude-sonnet-4-6");
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
      {
        name: name.trim(),
        avatarUrl: "",
        provider,
        model,
        systemPrompt: systemPrompt.trim(),
        capabilities,
        toolConfig: { tools },
      },
      {
        onSuccess: () => {
          setName("");
          setSystemPrompt("");
          setCapabilities([]);
          setTools([]);
          setProvider("anthropic");
          setModel("claude-sonnet-4-6");
          onClose();
        },
      }
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-[440px] max-h-[80vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">创建 Agent</h2>

        <label className="block mb-3">
          <span className="text-sm font-medium text-gray-700">名称</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：前端代码助手"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400"
          />
        </label>

        <div className="mb-3">
          <span className="text-sm font-medium text-gray-700">供应商</span>
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setModel(MODELS_BY_PROVIDER[e.target.value][0]);
            }}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <span className="text-sm font-medium text-gray-700">模型</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {(MODELS_BY_PROVIDER[provider] ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <label className="block mb-3">
          <span className="text-sm font-medium text-gray-700">System Prompt</span>
          <textarea
            rows={4}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="描述 Agent 的角色和行为..."
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none"
          />
        </label>

        <div className="mb-3">
          <span className="text-sm font-medium text-gray-700">能力标签</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {CAPABILITY_OPTIONS.map((cap) => (
              <button
                key={cap}
                onClick={() => toggleCapability(cap)}
                className={`rounded-full px-2.5 py-0.5 text-xs border transition-colors ${
                  capabilities.includes(cap)
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                }`}
              >
                {cap}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <span className="text-sm font-medium text-gray-700">工具集</span>
          <div className="mt-1 space-y-1">
            {AVAILABLE_TOOLS.map((t) => (
              <label key={t.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={tools.includes(t.value)}
                  onChange={() => toggleTool(t.value)}
                  className="rounded"
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || createAgent.isPending}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {createAgent.isPending ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
