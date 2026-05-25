# AgentHub-后端A-Day05-PinSpec注入与流式联调

## 今日完成项
1. 新增 `backend/app/services/pin_spec_injector.py`
   - 实现 `before_agent_callback`
   - 实现 pinned 消息读取与注入文本组装
2. 修改 `backend/app/services/adk/runner.py`
   - 在 `build_single_chat_agent()` 接入 `before_agent_callback`
   - 在 `run_async()` 增加 `state_delta={"conversation_id": session_id}`
3. 未新增 API、未新增返回字段、未改 SSE 事件结构。

## 与对齐约定一致性
- 统一响应包裹 `{code,data,message}`：本次未改中间件与 REST 包裹逻辑。
- snake_case 存储 + camelCase 序列化：本次仅新增 service 逻辑，无 schema 破坏。
- SSE 6 事件规范：未修改事件名与结构，保持兼容。

## 文档补充判断
本次不涉及新增接口/新增字段/新增错误码，且已有契约已覆盖，因此未在 `docs/AgentHub 响应格式与前后端对齐约定.md` 新增条目。

## 最小验证结果
- 通过：修改文件语法编译检查。
- 通过：Agent 构建时 callback 已挂载。
- 待联调：真实 DB 中有 pinned 数据时的注入内容效果（需端到端流式联调）。

## 影响范围
- `backend/app/services/pin_spec_injector.py`
- `backend/app/services/adk/runner.py`
