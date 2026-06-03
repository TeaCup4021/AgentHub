# Round 1 — 课题缺失功能 Spec

日期：2026-06-02 | 状态：待 Review

---

## 背景

对照课题《AgentHub - 多 Agent 协作平台》逐条核对后，发现 7 项核心要求未实现 + 7 个高优交互 Bug。本文档定义每项功能的交互规格和技术方案，作为实施 plan 的输入。

---

## 1. 图片/文件上传与消息 Attachment

### 课题要求
> 消息类型：文本、代码块、图片、文件附件...

### 当前状态
ChatInput 拦截了图片粘贴（preventDefault）和文件拖拽（不处理）。消息模型没有 attachment。

### 交互规格

1. **粘贴图片**：在输入框中粘贴图片 → 自动上传 → 输入框下方出现缩略图预览
2. **拖拽文件**：拖拽文件到输入框 → 自动上传 → 显示文件预览卡片
3. **发送**：携带 `attachments[]` 随消息 POST
4. **渲染**：消息气泡文本下方渲染图片（可点击放大）和文件卡片（可下载）
5. **预览条**：待发送的附件在输入框上方显示缩略图列表，可逐个删除

### 技术方案

- **上传**：`POST /api/v1/files/upload`（multipart/form-data），返回 `{ id, url, filename, size, mime_type }`
- **扩展 Message**：新增 `attachments: Attachment[]` 字段
- **扩展 SendMessageRequest**：新增 `attachments[]`
- **状态管理**：chatStore 新增 `pendingAttachments`，追踪上传中和已上传的附件
- **Mock**：Mock handler 返回假 URL，前端渲染用 mock data URL

### 涉及文件
- `types/chat.ts` — Attachment 接口
- `lib/api.ts` — fileApi
- `stores/chatStore.ts` — pendingAttachments
- `ChatInput.tsx` — 改造粘贴/拖拽行为
- 新建 `AttachmentPreview.tsx`
- `MessageList.tsx` — 渲染 attachment
- `ChatArea.tsx` — handleSend 传 attachments
- `mocks/handlers.ts` — upload mock

### 后端协定
详见 `vibeCodingPlan/前端需求-后端API协定-图片上传与文件服务.md`

---

## 2. Monaco 代码编辑器

### 课题要求
> 产物预览与编辑：全屏预览 / 代码编辑器

### 当前状态
CodeCard 使用 shiki 只读语法高亮，不可编辑。

### 交互规格

1. CodeCard header 增加"编辑"按钮（铅笔图标）
2. 点击"编辑"→ shiki 替换为 Monaco Editor 编辑器
3. 编辑态显示"保存"（Ctrl+S 也可触发）和"取消"按钮
4. 保存 → `PUT /api/v1/files/:id/content` → toast "已保存" → 退出编辑态
5. 取消 → 恢复原始代码 → 退出编辑态
6. PreviewCard 全屏 Modal 增加 Tab："预览" / "源代码"

### 技术方案

- **编辑器**：`@monaco-editor/react`，自动跟随主题（vs / vs-dark）
- **封装组件**：`MonacoCodeEditor`，支持 readOnly / onChange / onSave
- **CodeCard 双模式**：`editing` state 切换 shiki ↔ Monaco
- **Mock**：PUT handler 返回 200，本地存储内容

### 涉及文件
- 新建 `MonacoCodeEditor.tsx`
- `CodeCard.tsx` — 编辑模式
- `PreviewCard.tsx` — Tab 切换
- `mocks/handlers.ts` — PUT /files/:id/content

### 后端协定
详见 `vibeCodingPlan/前端需求-后端API协定-代码编辑器与Diff应用.md` §1

---

## 3. 一键应用 Diff + 冲突解决

### 课题要求
> 消息操作：一键应用 Diff
> Orchestrator：代码冲突处理

### 当前状态
DiffCard 只能查看差异，不能应用。无冲突处理。

### 交互规格

**应用 Diff：**
1. DiffCard 底部增加"应用修改"按钮
2. 点击 → 弹出确认对话框（展示变更文件路径 + 增删行统计）
3. 确认 → `POST /api/v1/files/:id/apply-diff`
4. 成功 → toast "修改已应用"
5. 409 冲突 → 自动展开 ConflictResolver

**冲突解决器：**
1. 顶部：冲突说明（文件名 + 哪些 Agent 冲突）
2. 中间：按 Agent 上下排列 diff，每个 Agent 一整行（不左右拆分）
3. 每行显示：Agent 名、增删行统计、diff 内容、"接受"/"跳过"按钮
4. 底部：合并结果 TextArea（可手动编辑）+ "全部接受" / "手动合并" / "取消"
5. 解决 → `POST /api/v1/files/:id/resolve-conflict`
6. SSE `conflict_detected` 事件 → ChatArea 顶部 Banner 提示

### 技术方案

- **ConflictResolver 组件**：上下排列布局，不左右拆分
- **SSE 新事件**：`conflict_detected` 事件类型
- **状态**：chatStore 新增 `activeConflict`

### 涉及文件
- 新建 `ConflictResolver.tsx`
- `DiffCard.tsx` — 加"应用"按钮 + 冲突态渲染
- `lib/sse.ts` — SSECallbacks + eventHandlers
- `stores/chatStore.ts` — activeConflict
- `ChatArea.tsx` — onConflict handler
- `mocks/handlers.ts` — apply-diff + 409 模拟
- `mocks/sse.ts` — conflict_detected 事件

### 后端协定
详见 `vibeCodingPlan/前端需求-后端API协定-代码编辑器与Diff应用.md` §2-3

---

## 4. 文档内联预览

### 课题要求
> 产物预览与编辑：内联产物预览卡片（网页 iframe、文档渲染、PPT 浏览）

### 当前状态
PreviewCard 仅支持 iframe 网页预览，不支持文档类型。

### 交互规格

1. 新增 DocumentCard，按文件类型渲染：
   - **PDF**：react-pdf 逐页 canvas 渲染，翻页控件
   - **docx**：mammoth.js 转 HTML 预览
   - **xlsx**：sheetjs 渲染为 HTML table
   - **pptx**：暂不支持，显示下载卡（P2 后端转 PDF 后接入）
2. 产物工作台 type 筛选新增"文档"选项
3. 卡片支持 resize（复用 useResizable）

### 技术方案

- `react-pdf`、`mammoth`、`xlsx` 三个库
- 加载文件 blob → 按 mime 类型分流渲染
- 文件 blob 从 `GET /api/v1/files/:id` 获取

### 涉及文件
- 新建 `DocumentCard.tsx`
- `types/chat.ts` — DocumentArtifactContent
- `CardRenderer.tsx` — 注册 document 类型
- `ArtifactWorkbench.tsx` — 筛选选项
- `mocks/sse.ts` — mock document artifact

### 后端协定
详见 `vibeCodingPlan/前端需求-后端API协定-文档预览与pin消息.md` §1

---

## 5. Agent 对话式创建

### 课题要求
> 支持用户自建 Agent（对话式创建，设定 System Prompt + 工具集）

### 当前状态
仅支持表单式创建（CreateAgentModal）。

### 交互规格

1. AgentManageModal 新增"对话式创建"按钮
2. 点击 → 创建临时群聊（预配 Orchestrator）→ 自动跳转到聊天
3. 用户用自然语言描述想要的 Agent
4. Orchestrator 返回 `plan_draft`，子任务 `type: "create_agent"` 含 `agent_config`
5. 前端渲染 AgentConfigPreviewCard（名称/模型/provider/System Prompt/标签/工具集）
6. 用户确认 → `POST /api/v1/agents`（已有 API）→ toast → 跳转到新 Agent 单聊
7. 用户也可以手动编辑配置（复用 CreateAgentModal）

### 技术方案

- PlanSubtask 扩展 `type?` 和 `agent_config?`
- OrchestratorPlan 检测 create_agent 类型 → 渲染预览卡片替代编辑区
- AgentConfigPreviewCard 展示配置 + 确认/编辑按钮
- Mock SSE 关键词检测（"创建"/"新建 agent"）→ 模拟返回 agent_config

### 涉及文件
- 新建 `AgentConfigPreviewCard.tsx`
- `types/chat.ts` — AgentCreationConfig / PlanSubtask 扩展
- `CardRenderer.tsx` — 注册 agent_config
- `AgentManageModal.tsx` — 对话式创建按钮
- `OrchestratorPlan.tsx` — create_agent 渲染
- `ChatArea.tsx` — handleConfirmPlan
- `mocks/sse.ts` — 关键词检测 + agent_config 模拟

### 后端协定
无新 API。Orchestrator 在 SSE plan_draft 中返回 `agent_config`，前端确认后调已有 `POST /agents`。

---

## 6. Pin 消息 UI

### 课题要求
> 上下文管理：支持手动 pin 关键消息作为长期上下文

### 当前状态
API 已定义（POST/DELETE /conversations/:id/pins），前端无 UI。

### 交互规格

1. 消息操作栏增加 Pin 按钮（图钉图标，已 pin 消息高亮蓝色）
2. ChatHeader 旁显示"已固定 (N)"按钮 → 点击弹出 PinnedMessages 面板
3. PinnedMessages 面板：消息列表（截断前 100 字）+ 点击跳转 + 取消 pin
4. 被 pin 消息左侧显示 3px 蓝色色条
5. 需要新增 `GET /conversations/:id/pins` API

### 技术方案

- chatStore 维护 `pinnedMessageIds: Set<string>`
- PinnedMessages 组件：侧面板，列表 + 空状态

### 涉及文件
- 新建 `PinnedMessages.tsx`
- `types/api.ts` — PinnedMessage / GetPinsResponse
- `lib/api.ts` — conversationApi.getPins()
- `stores/chatStore.ts` — pinnedMessageIds
- `MessageActions.tsx` — Pin 按钮
- `ChatHeader.tsx` — 已固定入口
- `MessageList.tsx` — pin 色条
- `mocks/handlers.ts` — GET pins mock

### 后端协定
详见 `vibeCodingPlan/前端需求-后端API协定-文档预览与pin消息.md` §2

---

## 7. 高优 Bug 修复（B1-B3, B5-B7）

| Bug | 问题 | 修复方案 |
|-----|------|---------|
| B1 | @弹窗 blur 不关闭 | `onBlur` → `setTimeout(150ms)` → `setMentionActive(false)` |
| B2 | 流式内容切换丢失 | abort 前将 streamingContent 写入 React Query 缓存 |
| B3 | 搜索模式无 Tooltip | Semi Tooltip 包裹三态切换按钮 |
| B5 | 空对话状态重复 | 删除 ChatArea 内重复 starter，仅保留简洁提示 |
| B6 | ReAct 面板定位异常 | `requestAnimationFrame` 延迟初始定位 |
| B7 | Planner Select 值丢失 | activeId 变化时 `setPlannerAgentId(null)` |

（B4 滚动行为在 Round 2 通过 react-virtuoso 统一解决）

---

## 技术选型汇总

| 层 | 选型 |
|----|------|
| 代码编辑器 | `@monaco-editor/react` |
| PDF 预览 | `react-pdf` |
| Word 预览 | `mammoth.js` |
| Excel 预览 | `xlsx` (SheetJS) |

---

## 不包含在本 Spec

- SSE 多路后台处理 → Round 2
- 红点/未读机制 → Round 2
- SSE 逐字输出优化 → Round 2
- TS artifact detector → Round 2
- 项目文件夹 → Round 3
- react-virtuoso → Round 2
- 斜杠命令 / 草稿保存 / 选中工具栏 / 键盘增强 / 标题内联编辑 / task_hints → Round 4