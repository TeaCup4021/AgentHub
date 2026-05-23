# 后端 B（Mock SSE + ADK Runner 预研）实施计划

日期：2026-05-23

## 目标
- 提供 `GET /api/v1/conversations/{id}/stream` 的 Mock SSE 端点，输出完整 6 种事件序列。
- 编写 `adk_runner_demo.py`，验证 `Runner.run_async()` 的完整事件生命周期。
- 确认 ADK Event 字段与 SSE 6 事件的映射关系，并形成文档。

## 范围
- 仅新增 Mock SSE 端点与 ADK Runner 验证脚本。
- 不接入真实模型调用或数据库写入。

## 实施步骤
1. 代码勘察
   - 检查 `backend/app/api/v1/conversations.py` 的路由结构。
   - 参考 `backend/verify_adk.py` 中 ADK→SSE 转换示例。
   - 核对前端 SSE 事件字段规范（`AgentHub-架构设计前端.md` 5.6）。

2. Mock SSE 端点
   - 在 `backend/app/api/v1/conversations.py` 增加 `GET /{id}/stream`。
   - 使用 `text/event-stream` 返回 6 事件：
     `message_start` → `token`(多次) → `artifact` → `agent_status` → `message_end` → `error`。
   - 事件数据结构与前端文档保持一致。

3. ADK Runner 预研脚本
   - 新增 `backend/adk_runner_demo.py`：
     - 构造最小 Runner 配置与会话。
     - 调用 `Runner.run_async()`。
     - 记录事件顺序与关键字段：partial token、turn_complete、usage_metadata。

4. 映射表文档
   - 新增 `backend/docs/adk_event_mapping.md`：
     - ADK Event → SSE 事件字段映射表。
     - 示例事件序列与说明。

5. 自测
   - 启动后端并请求 Mock SSE 端点，确认 6 事件输出与顺序。
   - 运行 `adk_runner_demo.py`，确认事件生命周期完整。

## 验收标准
- SSE 端点返回 `text/event-stream`，包含 6 种事件且字段完整。
- `adk_runner_demo.py` 能输出 partial token → turn_complete → usage_metadata 的生命周期信息。
- 映射表文档清晰且与前端规范一致。

