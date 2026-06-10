# AgentHub 后端B Day04 实施计划 - ADK 配置 + Translator 骨架

日期：2026-05-24

## 目标
- 配置 ADK 模型（AnthropicLlm / LiteLLM）并提供可复用的初始化入口
- 新增 ADK-to-SSE Translator 骨架，覆盖 6 种 SSE 事件转换
- 提供 AgentHubRunner 薄封装，统一单聊/群聊的 ADK 调用入口
- 保留现有 Mock SSE，新增可替换的真实流式管道入口

## 输入与约束
- 参照 `AgentHub-后端开发20天实施计划.md` Day 4 要求
- SSE 协议：message_start / token / artifact / agent_status / message_end / error
- 关键字段：partial、turn_complete、actions.end_of_agent、error_code
- 响应结构与命名规范遵循全局约定（camelCase 输出）

## 实施步骤
1. 新增 ADK 模型配置模块
   - 位置：`backend/app/services/adk/models.py`
   - 提供 `get_anthropic_llm()` 与 `get_litellm()` 工厂
   - 默认模型：claude-sonnet-4-6 / openai/codex

2. 新增 ADK-to-SSE Translator
   - 位置：`backend/app/services/adapters/adk_to_sse.py`
   - 类：`ADKToSSETranslator`
   - 方法：`translate()` 处理 `Runner.run_async()` 的 `AsyncGenerator[Event]`
   - 私有转换函数：`_to_message_start/_to_token/_to_artifact/_to_agent_status/_to_message_end/_to_error`

3. 新增 AgentHubRunner 薄封装
   - 位置：`backend/app/services/adk/runner.py`
   - 统一单聊/群聊入口（先实现单聊最小能力）
   - 输出：可被 Translator 消费的事件流

4. SSE 接口集成占位（可切换）
   - 在 `backend/app/api/v1/conversations.py` 增加开关：优先使用真实 ADK 流
   - 保留 Mock SSE 作为兜底

5. 自测与记录
   - 提供最小可执行的 translator demo（脚本）
   - 运行一次流式输出验证
   - 完成后写入 `vibeCodingSummary/`

## 预期交付物
- `backend/app/services/adk/models.py`
- `backend/app/services/adk/runner.py`
- `backend/app/services/adapters/adk_to_sse.py`
- `backend/app/api/v1/conversations.py`（接入占位）
- `backend/tools/adk_sse_demo.py`（最小测试脚本）

## 风险与降级
- 若 ADK session 持久化未就绪，先用 `InMemorySessionService`
- 若真实流式输出不可用，SSE 继续使用 Mock 数据

