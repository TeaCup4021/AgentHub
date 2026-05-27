# P2 — 差异化亮点 Spec

日期：2026-05-26 | 状态：已确认

---

## 模块 16：群聊 Orchestrator 全链路

**目标：** 打通群聊完整六步闭环——发送 → 计划 → 确认 → 执行 → 聚合

**完整交互流：**
1. 用户发送群聊消息 → `POST /messages`，`mode: "auto_orchestrate"`
2. Orchestrator 返回计划 → SSE 事件 `sender.type: "orchestrator"`，`meta.plan` 含子任务列表
3. 前端渲染 `OrchestratorPlan` 卡片，展示子任务分配
4. 用户点击「确认执行」→ `POST /messages`，`mode: "confirm_plan"`，携带可能调整后的 `plan[]`
5. 各 Agent 以独立 SSE 生命周期输出（`message_start → token → message_end`），多个 Agent 可交织
6. 全部完成后 Orchestrator 发送汇总消息（`meta.summary`）

**后端接口：**
- SSE `message_start` 新增 `meta.plan` 结构（见 Orchestrator 接口契约文档）
- `POST /messages` 新增 `mode: "confirm_plan"` + `plan_id` + `plan[]` 字段
- `agent_status` SSE 事件携带 `subtask_id` 追踪子任务进度
- 汇总消息的 `meta.summary` 含 `{ total, success, failed, results[] }`

**详细契约：** 见 `docs/specs/2026-05-26-orchestrator-api-contract.md`

**变更清单：**
- 重写 `OrchestratorPlan.tsx` — 完整交互（确认/调整/取消）
- 修改 `ChatArea.tsx` — SSE 事件分发识别 orchestrator 消息 + 处理 plan/summary meta
- 修改 `MessageList.tsx` — 识别 orchestrator 类型消息
- 新增 `OrchestratorSummary.tsx` — 聚合汇总卡片
- 修改 `mocks/sse.ts` — Mock 群聊完整流程事件序列

---

## 模块 17：ReAct 推理面板

**目标：** 将 ThinkingBlock 从消息气泡内提升为全局可拖拽面板，实时展示 thought/action/observation

**交互设计：**
- Streaming 时自动展开面板，新 Step 追加到底部并高亮闪烁
- 点击 ThinkingBlock 标题栏切换面板展开/关闭
- 图钉按钮固定面板（不自动关闭）
- 可拖拽标题栏改变位置（左/右侧吸附 或 自由浮动）
- Agent 完成后面板保留，5 秒后可手动关闭
- 消息气泡内的 ThinkingBlock 保留（作为简版入口）

**数据源：** `chatStore.streamingContent[msgId].thinkingSteps`，已有数据结构无需改动

**变更清单：**
- 新增 `ReActPanel.tsx` — 全局推理面板（可拖拽、可吸附）
- 修改 `ChatArea.tsx` — 集成 ReActPanel

---

## 模块 18：产物工作台

**目标：** 给每个会话加「产物」Tab，汇总所有 Agent 产出，可筛选、排序

**功能：**
- ChatArea 顶部 Tab 切换「聊天 / 产物(N)」
- 卡片网格展示：Code / Preview / File / Diff / Deploy 类型
- 筛选器：按类型、按 Agent、按关键词搜索
- 点击卡片：Code → 代码查看器、Preview → iframe 全屏、File → 下载、Diff → 对比查看
- 数据源：纯前端从 React Query 缓存的 messages.artifacts[] 聚合去重

**后端接口：** 无需新增，纯前端聚合已有数据

**变更清单：**
- 新增 `ArtifactWorkbench.tsx` — Tab 页 + 卡片网格 + 筛选
- 修改 `ChatArea.tsx` — 顶部 Tab 切换
- 新增 `ArtifactViewer.tsx` — Code/Preview 全屏查看器（复用 CodeCard shiki 渲染）

---

## 模块 19：Agent 对话式创建

**目标：** 在聊天中用自然语言描述需求 → Agent 自动分析 → 生成配置预览 → 一键确认创建

**交互流程：**
1. 用户输入："帮我创建一个专门写前端测试的 Agent，用 Haiku，可以读文件和执行命令"
2. Orchestrator 解析意图，提取参数，返回 Agent 配置预览卡片（复用 plan 消息结构）
3. 用户预览配置 → 点"确认创建"→ 前端调 `POST /agents`
4. 创建成功后自动跳转到新 Agent 的单聊

**后端接口约定：**

Orchestrator 返回的 plan 消息中，子任务 `meta` 包含 `agent_config`：
```json
{
  "subtask_id": "create-agent-001",
  "type": "create_agent",
  "agent_config": {
    "name": "前端测试助手",
    "model": "claude-haiku-4-5",
    "provider": "anthropic",
    "capabilities": ["testing", "coding"],
    "tools": ["read_file", "execute_command"],
    "system_prompt": "你是一个专业的前端测试工程师..."
  }
}
```

用户确认后，前端直接调用已有的 `POST /api/v1/agents`。无需新的后端 API。

**Mock 阶段：** 关键词匹配 + 参数模拟提取，纯前端实现。

**变更清单：**
- 新增 `AgentConfigPreviewCard.tsx` — 配置预览卡片
- 修改 `OrchestratorPlan.tsx` — 支持 `subtask.type === "create_agent"` 渲染配置卡片
- 修改 `mocks/sse.ts` — 添加 Agent 创建关键词识别 + 参数模拟提取

---

## 模块 20：会话分支

**目标：** 在任意消息处创建新会话分支，可选择携带上文上下文

**交互设计：**
- hover 消息 → 操作栏出现"分支"→ 点击弹出分支对话框
- 对话框选项：携带上文所有消息、携带关联产物、自定义新对话标题
- 确认后创建新会话并自动跳转

**后端接口约定：**

```
POST /api/v1/conversations/{conversation_id}/branch

Request:
{
  "source_message_id": "msg-branch-point",
  "title": "重构登录页面",
  "include_context": true,
  "include_artifacts": ["artifact-1"]
}

Response:
{
  "code": 200,
  "data": {
    "conversation_id": "conv-new-001",
    "title": "重构登录页面",
    "context_length": 12,
    "created_at": "2026-05-26T16:00:00Z"
  },
  "message": "ok"
}
```

**Mock 阶段：** 前端本地模拟，从 React Query 缓存复制消息到新会话。

**变更清单：**
- 新增 `BranchDialog.tsx` — 分支创建确认对话框
- 修改 `MessageActions.tsx` — 加"分支"按钮
- 新增 `src/lib/conversationBranch.ts` — 分支创建工具函数

---

## 模块 21：@提及增强

### 21.1 @Agent 带具体指令

**方案：** 群聊中 `@Agent名 具体指令` 格式解析，自动关联指令到 Agent

**解析原理：** 遍历 contentEditable DOM，找 `[data-mention-id]` chip 节点，取 chip 到下一个 chip 之间的文本作为该 Agent 的指令。

**后端接口更新（POST /messages）：**

新增可选字段 `task_hints`：
```json
{
  "content": "...如上...",
  "mentions": ["agent-claude-code", "agent-codex"],
  "mode": "auto_orchestrate",
  "task_hints": [
    { "agent_id": "agent-claude-code", "hint": "写登录页面组件" },
    { "agent_id": "agent-codex", "hint": "写对应 API 接口" }
  ]
}
```

Orchestrator 读取 `task_hints` 预设子任务分配。

### 21.2 Agent 快捷面板增强

@ 补全列表每项显示能力标签，帮助用户快速判断选哪个 Agent。

**变更清单：**
- 修改 `mentionParser.ts` — 解析 @Agent + 后续指令文本关联
- 修改 `ChatInput.tsx` — 增强补全列表 + 构造 task_hints
- 修改 `POST /messages` 类型定义 — 加 `task_hints` 字段

---

## 模块 22：首页/落地页

**目标：** 无活跃对话时显示欢迎页，替代当前简陋空状态

**内容：**
- 标题 + 平台简介
- 四个快捷操作卡片：新建单聊、创建群聊、浏览 Agent、查看产物
- 最近对话列表（取 React Query 缓存前 3 条）
- 可用 Agent 列表（取 `agents.filter(a => a.isActive)`）

**渲染条件：** `activeConversationId === null`

**后端接口：** 无需新增，纯 UI 层改动

**变更清单：**
- 新增 `WelcomePage.tsx` — 欢迎页完整 UI
- 修改 `ChatArea.tsx` — 空状态替换为 `<WelcomePage />`

---

## 模块 23：微动效打磨

**目标：** 给核心交互加微动效，提升"手感"和专业感

**动画清单（8 处）：**

| # | 位置 | 动画 | 实现 | 时长 |
|---|------|------|------|------|
| 1 | 消息气泡出现 | 下滑入 + 淡入 | `@keyframes slideUp` | 200ms |
| 2 | 流式光标 | 平滑闪烁 → 句子结束消失 | `transition-opacity` | — |
| 3 | 发送按钮 | 缩放反馈 | `hover:scale-105` + `active:scale-95` | 150ms |
| 4 | 卡片展开/收起 | 高度过渡 + 箭头旋转 | `transition-all` | 200ms |
| 5 | 侧边栏抽屉(移动端) | 侧滑入/滑出 | `transform translate-x` | 250ms |
| 6 | 模态框出现 | 缩放淡入 | `@keyframes scaleIn` | 200ms |
| 7 | Toast 进出 | sonner 内置 | 无需额外处理 | — |
| 8 | 骨架屏 | 光泽扫过 | `@keyframes shimmer` | 1.5s |

**规则：** 所有时长 ≤ 300ms，尊重 `prefers-reduced-motion`

**变更清单：**
- 修改 `index.css` — 4 个 @keyframes + reduced-motion 规则
- 修改 `MessageList.tsx` — 消息气泡加 slide-up
- 修改 `ChatInput.tsx` — 发送按钮加 scale 过渡
- 修改 `Skeleton.tsx` — pulse 替换为 shimmer
- 修改所有模态框 — 加 scale-in
- 修改 `Sidebar.tsx` — 移动端 slide 过渡
