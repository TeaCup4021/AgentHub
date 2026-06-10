# Agent Adapter 模式

## 架构

```
AgentAdapter (ABC)
├── AnthropicAdapter    →  provider: anthropic, anthropicllm, claude
├── LiteLlmAdapter      →  provider: openai, litellm, deepseek
└── CliAdapter          →  provider: claude-code-cli, codex-cli
```

## 注册机制

各 adapter 模块文件底部自行注册：

```python
# anthropic_adapter.py
AdapterRegistry.register("anthropic", AnthropicAdapter())
AdapterRegistry.register("claude", AnthropicAdapter())

# litellm_adapter.py
AdapterRegistry.register("openai", LiteLlmAdapter())
AdapterRegistry.register("deepseek", LiteLlmAdapter())

# cli_adapter.py
AdapterRegistry.register("claude-code-cli", CliAdapter())
AdapterRegistry.register("codex-cli", CliAdapter())
```

触发注册：`app/main.py:27` → `import app.services.adapters` → 各模块 import 时自注册。

## 接口方法

```python
class AgentAdapter(ABC):
    def resolve_model(self, agent: Agent) -> Any
        # 返回 AnthropicLlm, LiteLlm, 或 None（CLI Agent）

    def is_cli(self) -> bool
        # True = 本地 CLI 子进程，False = 远程 LLM API

    def build_agent(self, agent, tool_loader=None) -> LlmAgent
        # 构建 ADK LlmAgent（CLI 模式注入 before_model_callback）

    async def stream(self, agent, conv_id, user_id, prompt) -> AsyncGenerator[str]
        # SSE 流式执行

    async def verify(self, agent) -> bool
        # 模型连通性验证
```

## 关键行为差异

| 维度 | AnthropicAdapter | LiteLlmAdapter | CliAdapter |
|------|------------------|----------------|------------|
| 模型解析 | `ConfigurableAnthropicLlm`（支持 per-agent api_key/base_url） | `LiteLlm`，自动 `{provider}/{model}` 前缀 | `resolve_model()` 返回 None |
| 流式执行 | 基类 `stream()` → ADK Runner 翻译为 SSE | 同左 | 子进程 `run_stream()` 直接输出 SSE |
| 编排模式 | 标准 `LlmAgent` + tools | 标准 `LlmAgent` + tools | `before_model_callback` 拦截 LLM → CLI 子进程 |
| API Key | `api_key` + `base_url` 可 per-agent 覆盖 | 通过 LiteLlm kwargs 传递 | N/A |
