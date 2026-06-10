# Agent 对话失败调试指南

当 Agent 无法正常对话时，按以下顺序排查。

## 1. 检查后端日志

按特征搜索后端终端输出：

| 日志特征 | 问题类型 | 修复方法 |
|----------|----------|----------|
| `Invalid URL (POST /v1/messages/v1/messages)` | base_url 路径双倍 | base_url 末尾不要带 `/v1/messages` |
| `Invalid URL (POST .../chat/completions/chat/completions)` | base_url 路径双倍 | base_url 末尾不要带 `/chat/completions` |
| `model_not_found` / `No available channel` | 模型名错误 | 确认代理提供商支持的模型名 |
| `503 Service Unavailable` | 代理服务端问题 | 检查代理状态、模型名、请求参数 |
| `401 Unauthorized` | API Key 错误 | 检查 Agent 配置中的 api_key |
| `Root node _xxx_ failed`（无 503/401） | 通用 LLM 调用失败 | 看上层错误详情 |
| `Timeout` | 请求超时 | 确认网络可达、端点可用 |

## 2. 验证 URL 路径正确性

确认后端实际请求的 URL：

```bash
# 查看后端日志中的 httpx 或 LiteLLM 日志行
# Anthropic: "HTTP Request: POST https://xxx/v1/messages"
# LiteLLM:   "LiteLLM completion() model= ..."
```

路径应当是裸 endpoint，末尾 **不包含** 以下后缀：
- `/v1/messages`（Anthropic）
- `/chat/completions`（OpenAI/LiteLLM）

## 3. 确认模型名正确

不同 provider 的 model 命名约定：

| Provider | 正确格式 | 示例 |
|----------|---------|------|
| `anthropic` | 直接填 Claude 模型名 | `claude-sonnet-4-6` |
| `openai` | 直接填 OpenAI 模型名 | `gpt-4o` |
| `litellm` | 需要带提供商标记 | `openai/gpt-4o`、`deepseek/deepseek-chat` |
| `deepseek` | 自动加 `deepseek/` 前缀 | 填 `deepseek-chat` 即可 |

注意：代理提供商（如 luckyapi、julianapi）可能：
- 使用不同的模型内部名
- 需要额外的请求参数（如 `group: "auto"`）
- 只支持部分模型
