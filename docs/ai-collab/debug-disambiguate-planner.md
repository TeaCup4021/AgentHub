# 多 @ 消歧与 Planner 归属诊断

当群聊中 `@多个agent` 后发现「统筹/分工归属不符预期」时,按本指南逐层定位。

## 前提

- `VITE_USE_MOCK=false`,后端直接起(`.venv` 或 `npm run dev:backend`)
- 群聊已绑定 ≥2 个 Agent

## 必看的 3 行日志

每次多 @ 发送消息后,从后端日志里按时间顺序抓以下三行(模块 `agenthub.planner` / `agenthub.stream`):

1. **`Agent-based planning: conv=xxx planner=<名字> model=<模型> provider=<provider>`**
   → 谁被选成 planner agent(协调者)。如果这行不存在,说明走了 built-in orchestrator(默认 deepseek),而不是用户 @mention 的 agent。

2. **`Planner executor pool: [全员id...] (mentions=[被@的id...])`**
   → planner 看到的可执行 agent 清单。应该是群聊全员,而非仅 mentions。若只有 mentions,说明我这次的修复未生效。

3. **`DAG workflow start: conv=xxx task=xxx subtasks=N prompt=...`**(如果确认后走 DAG)
   → 确认执行时的子任务数。subtasks 应 ≥ 可执行 agent 数(分工生效的话)。

## 症状 → 根因速查

| 症状 | 根因 | 修复位置 |
|------|------|----------|
| 日志 #1 显示非预期 agent(如 4.8 而非 5.4) | 消歧器选错:prompt 里没带 system_prompt,或 LLM 判断失误 | `messages.py:_disambiguate_orchestrator` roster 构造 |
| 日志 #2 executor_pool 只有 mentions | 执行池未回退到全员 | `conversations.py:_orchestrator_plan_stream` 的 executor_pool 赋值 |
| 日志 #1 正确,但执行时另一 agent 在分工 | planner 生成的计划把「分工」任务又分配给了别人 | Planner LLM 输出不受控,可能需在 prompt 加「你自己是协调者,不要再把协调任务分给别人」 |
| 消歧器 prompt 已带 system_prompt 但仍选错 | LLM 概率行为,即便给足信息也可能失误 | 可在 disambiguator instruction 加更强指令(如「优先选择 prompt 中提到统筹/协调的」),或改成基于关键词的规则匹配 |

## 典型问题实例

### 案例 1:4.8 被选成 planner,尽管 5.4 的 prompt 写「擅长统筹」

**日志征兆:**
```
Agent-based planning: conv=xxx planner=4.8 model=claude-opus-4.8 provider=anthropic
```

**根因:**
- 如果这次修复**之前**:roster 只有 `- 名字 (id=...)`、没 system_prompt → 消歧器瞎选
- 如果修复**之后仍出现**:roster 已带 prompt 摘要,但 deepseek 判断失误(概率行为)

**验证方法:**
在 `_disambiguate_orchestrator`(`messages.py:34-46`)的 roster 构造后加临时日志:
```python
logger.info("Disambiguator roster:\n%s", roster)
```
看输出的 roster 是否包含「擅长统筹」字样。若有仍选错,则是 LLM 问题;若无,则是代码没跑到或 prompt 取值为空。

### 案例 2:executor_pool 只有被 @ 的 agent

**日志征兆:**
```
Planner executor pool: [<单个或少数id>] (mentions=[同样的id])
```

**根因:**
`_orchestrator_plan_stream` 没走全员回退分支——可能 `ConversationParticipant` 表里无记录,或查询条件有误。

**验证方法:**
进数据库查 `conversation_participants` 表:
```sql
SELECT * FROM conversation_participants WHERE conversation_id = '<对话id>';
```
应有多行 `participant_type='agent'` 记录。若无,则是对话创建时没插入;若有,则是查询逻辑问题。

## 手动触发场景

- `@5.4` 单 @ → 直接选 5.4,不走消歧器
- `@4.8 @5.4` 多 @ → 走消歧器
- 群聊无 @ → 走默认 orchestrator(built-in deepseek)
- 群聊有下拉选择 + 无 @ → 走下拉值
- 群聊有下拉 + 有 @ → **@ 优先级更高**,覆盖下拉

## 相关代码位置

- 消歧器:`backend/app/api/v1/messages.py:_disambiguate_orchestrator`(20-75行)
- Planner 调用:`backend/app/api/v1/conversations.py:_orchestrator_plan_stream`(544-733行)
- Executor pool 赋值:`conversations.py:576-590`
- Agent-based vs built-in 分支:`planner.py:plan`(43-69行)
