# AgentHub 前端缺失功能 — 完整实施计划

日期：2026-06-02 | 状态：讨论完成，待执行

---

## 技术栈

| 层 | 选型 |
|----|------|
| 代码编辑器 | `@monaco-editor/react` |
| 拖拽排序 | `@dnd-kit/core` + `@dnd-kit/sortable` |
| 虚拟列表 | `react-virtuoso` |
| PDF 预览 | `react-pdf` |
| Office 预览 | `mammoth.js` (docx) + `sheetjs` (xlsx) |
| 强制同步渲染 | `react-dom/flushSync` (SSE 逐字输出) |
| 状态管理 | Zustand（现有） + React Query（现有） |

---

## 一、课题硬伤修复（7 项）

### ① Agent 对话式创建

**实现思路：**

1. AgentManageModal 新增"对话式创建"按钮
2. 点击 → 创建临时群聊对话，预填 Orchestrator System Prompt（意图：解析用户需求为 Agent 配置）
3. 用户用自然语言描述想要的 Agent → Orchestrator 解析 → SSE 返回 `plan_draft`（子任务 type: "create_agent"，含 `agent_config`）
4. 前端渲染 `AgentConfigPreviewCard`：名称/模型/供应商/System Prompt/工具集
5. 用户确认 → 调 `POST /agents` 创建 → 成功后自动跳转到新 Agent 的单聊

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `AgentManageModal.tsx` | 加"对话式创建"按钮 |
| 新建 `AgentConfigPreviewCard.tsx` | 配置预览卡片（渲染 `agent_config` 字段） |
| `OrchestratorPlan.tsx` | 支持 `subtask.type === "create_agent"` 渲染配置卡片 |
| `mocks/sse.ts` | 新增 Agent 创建关键词识别 → 模拟返回 agent_config |
| `types/chat.ts` | `PlanSubtask` 扩展 `type?` 和 `agent_config?` 字段 |

**后端协定：** 无新 API。Orchestrator 的 `plan_draft` SSE 事件中，子任务 `meta` 携带 `agent_config`。前端确认后调已有 `POST /agents`。

---

### ② 图片/文件上传 + 消息 Attachment

**实现思路：**

1. ChatInput 粘贴图片 → 调用上传 API → 获取 file_id + URL → 在输入框下方显示缩略图预览
2. 拖拽文件到输入框 → 同样上传 → 显示文件卡片
3. 发送消息时构造 `attachments[]` 随 POST /messages 一起发送
4. MessageBubble 检测 `attachments` → 在文本下方渲染：
   - 图片：`<img>` + 点击放大（Semi Image.Preview）
   - 文件：复用 FileCard
5. SSE 新增 `attachment` 事件类型，流式中通知前端有新产物文件

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `ChatInput.tsx` | 删掉图片粘贴拦截逻辑，改为上传 + 缩略图预览；新增拖拽上传 |
| 新建 `AttachmentPreview.tsx` | 输入框下方的待发送附件预览条 |
| `MessageBubble.tsx` / `MarkdownBubble.tsx` | 渲染消息中的 attachments |
| `lib/api.ts` | 新增 `fileApi.upload()` |
| `mocks/handlers.ts` | 新增 `POST /files/upload` mock |
| `types/chat.ts` | `Message` 扩展 `attachments` 字段；`SendMessageRequest` 扩展 `attachments` |

**后端协定：** 见 `前端需求-后端API协定-图片上传与文件服务.md`

---

### ③ Monaco 代码编辑器

**实现思路：**

1. 安装 `@monaco-editor/react`
2. CodeCard 改造：
   - 默认只读模式（shiki 高亮）← 保持现有
   - 右上角加"编辑"按钮 → 切换为 Monaco Editor
   - 可编辑时显示"保存"和"取消"按钮
   - 保存时调用 `PUT /files/:id/content`
3. PreviewCard 全屏 Modal 新增"代码"Tab（如果有代码内容）
4. 冲突解决器中使用 Monaco diff editor（`DiffEditor` 组件）

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `CodeCard.tsx` | 编辑/只读双模式切换 |
| 新建 `MonacoCodeEditor.tsx` | 封装 Monaco Editor 的通用组件 |
| `PreviewCard.tsx` | Modal 增加代码编辑 Tab |
| `mocks/handlers.ts` | 新增 `PUT /files/:id/content` mock |

**后端协定：** 见 `前端需求-后端API协定-代码编辑器与Diff应用.md` §1

---

### ④ 一键应用 Diff + 冲突解决器

**实现思路：**

1. DiffCard 底部增加"应用修改"按钮
2. 点击 → 弹出确认对话框（方案B）：展示变更预览 + 文件路径
3. 确认 → `POST /files/:id/apply-diff`
4. 成功 → toast "修改已应用"
5. 409 冲突 → 弹出 ConflictResolver 组件：
   - 顶部冲突说明（两个 Agent 同时修改了同一文件）
   - 中间按 Agent 分行排列 diff（每个 Agent 一栏，上下排列不拆分左右）
   - 底部合并结果 TextArea/Monaco Editor（可手动编辑）
   - 操作按钮：接受全部 / 手动合并 / 取消

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `DiffCard.tsx` | 加"应用修改"按钮 + 确认对话框 |
| 新建 `ConflictResolver.tsx` | 冲突解决器（上下排列 diff + 合并编辑器） |
| `ChatArea.tsx` | 处理 SSE `conflict_detected` 事件 → Banner 提示 |
| `lib/api.ts` | 新增 `fileApi.applyDiff()` / `fileApi.resolveConflict()` |
| `mocks/handlers.ts` | 新增 mock 端点 |

**后端协定：** 见 `前端需求-后端API协定-代码编辑器与Diff应用.md` §2-3

---

### ⑤ 文档内联预览

**实现思路：**

1. PDF：`react-pdf` 加载 → 逐页 Canvas 渲染 → 缩略图导航 → 全屏模式
2. docx：`mammoth.js` 转 HTML → 在 iframe/div 中渲染
3. xlsx：`sheetjs` 读取 → 渲染为 HTML table → 支持切换 sheet
4. pptx：后端转 PDF（LibreOffice headless） → 前端 react-pdf 渲染
5. 新增 `DocumentCard` 组件（或扩展 PreviewCard）
6. 产物工作台中 type 筛选新增"文档"选项

**涉及文件：**

| 文件 | 操作 |
|------|------|
| 新建 `DocumentCard.tsx` | 文档预览卡片（PDF/Office） |
| `CardRenderer.tsx` | 注册 `document` 类型 |
| `PreviewCard.tsx` | 全屏模式支持文档类型 |
| `ArtifactWorkbench.tsx` | 筛选增加"文档"类型 |
| `mocks/handlers.ts` | 新增 `GET /files/:id/preview` mock |

**后端协定：** 见 `前端需求-后端API协定-文档预览与pin消息.md` §1

---

### ⑥ Pin 消息 UI

**实现思路：**

1. MessageActions 新增 Pin 按钮（图钉图标）
2. ChatHeader 旁增加"已固定 (N)"按钮 → 点击弹出 PinnedMessages 面板
3. PinnedMessages 面板：消息列表（截断预览） + 点击跳转到对应位置 + 取消 pin
4. 被 pin 的消息左侧显示色条标记
5. 利用已有 `POST/DELETE /conversations/:id/pins` API

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `MessageActions.tsx` | 加 Pin 按钮 |
| 新建 `PinnedMessages.tsx` | 已固定消息列表面板 |
| `ChatHeader.tsx` | 加"已固定"入口 |
| `MessageBubble.tsx` | Pin 消息左侧色条 |

**后端协定：** 见 `前端需求-后端API协定-文档预览与pin消息.md` §2

---

### ⑦ 7 个高优 Bug 修复

| Bug | 问题 | 修复方案 |
|-----|------|---------|
| B1 | @弹窗 blur 不关 | `onBlur` 加 150ms delay 关闭 Popover |
| B2 | 流式内容切换丢失 | 切换前将 streamingContent 写入 React Query 缓存（见 §二-⑥） |
| B3 | 搜索模式无 tooltip | Semi Tooltip 包裹三态按钮 |
| B4 | 滚动行为不一致 | react-virtuoso 替换自写滚动逻辑（见 §三-①） |
| B5 | 空对话状态重复 | ChatArea 只保留 WelcomePage，删除空 starter 提示 |
| B6 | ReAct 面板定位异常 | `requestAnimationFrame` 延迟初始定位计算 |
| B7 | Planner Select 值丢失 | `useEffect` 监听 activeId 变化重置 plannerAgentId |

---

## 二、架构改造（4 项）

### ⑧ SSE 多路后台处理

**实现思路：**

将 ChatArea 中"单一 SSE 连接"改为"全局 SSE 池"：

```
chatStore 改为维护：
  streamPool: Map<conversationId, {
    content: string
    artifacts: Artifact[]
    thinkingSteps: ThinkingStep[]
    abort: () => void
    agentName: string
    msgId: string
    startedAt: number
  }>

切换对话时：
  1. 旧对话的 SSE → 不 abort，保留在 pool 中
  2. 旧对话的流式状态（content/artifacts/thinkingSteps）→ 保留
  3. 切回来时 → 从 pool 取当前内容 → 立即渲染 → 继续追加 token

对话关闭/SSE message_end 时：
  → 从 pool 中移除
  → 触发 React Query 缓存刷新 (invalidateQueries)
```

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `stores/chatStore.ts` | `streamingContent` 改为 `streamPool`；新增 pool 管理 actions |
| `ChatArea.tsx` | 移除 `disconnectRef` 单连接模式；改为 pool 管理；移除切换时 abort |
| 新建 `useSSEPool.ts` | SSE 池管理的 hook，封装创建/销毁/查询 |

---

### ⑨ 红点/未读通知机制

**实现思路：**

```
notificationStore (Zustand + localStorage 持久化):
  unreadMap: Record<string, { count: number; lastMessagePreview: string }>
  lastViewedMap: Record<string, string>  // conversationId → ISO timestamp

触发时机：
  1. SSE message_start（非当前激活对话）→ unreadMap[id].count++
  2. SSE message_end → 同上
  3. 用户打开对话 → unreadMap[id].count = 0，lastViewedMap[id] = now
  4. 用户在当前对话中收到新消息（用户在底部）→ 不增加未读

UI：
  1. ConversationList 每项右侧显示红色圆点 + 数字
  2. IconSidebar 对话图标角标显示总未读数
  3. 网页 title 前缀 "(3) AgentHub"（调用 document.title）
```

**涉及文件：**

| 文件 | 操作 |
|------|------|
| 新建 `stores/notificationStore.ts` | 未读状态管理 + localStorage 持久化 |
| `ConversationList.tsx` | 列表项渲染红点 |
| `IconSidebar.tsx` | 导航图标角标 |
| `ChatArea.tsx` | 打开对话时清除未读 |
| `App.tsx` | 监听 title 变化 |

**后端协定：** 无新 API。纯前端状态管理。

---

### ⑩ SSE 逐字输出优化（Ref + rAF 时间切片）

**实现思路：**

```
当前：appendToken → Zustand set() → React 18 批处理 → 一块一块蹦

改为：
  token 到达 → contentRef.current += delta           // 立即追加到 ref
            → 标记 dirty = true
            → requestAnimationFrame(() => {
                if (dirty) {
                  flushSync(() => chatStore.setState(…))  // 强制同步渲染
                  dirty = false
                }
              })

效果：每个 rAF 帧（~16ms）最多渲染一次，视觉上是连续流畅的"打字机"
性能：60fps 上限，跟 ChatGPT/DeepSeek 同等方案
```

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `stores/chatStore.ts` | 新增 `appendTokenRef` 方法 + rAF 调度逻辑 |
| `ChatArea.tsx` | onToken 回调改用 ref 版本 |

---

### ⑪ TS Artifact Detector（Mock 模式）

**实现思路：**

将 `backend/app/services/artifact_detector.py` 的逻辑移植为 TypeScript：

```ts
// artifactDetector.ts
export function detectArtifacts(content: string): Artifact[] {
  // 正则：代码块、diff 块、URL、📎 文件引用
  // 返回 artifactType + title + content
}
```

在 Mock SSE `message_end` 和 Mock handler 中调用，自动为消息填充 artifacts。

**涉及文件：**

| 文件 | 操作 |
|------|------|
| 新建 `lib/artifactDetector.ts` | TS 版 artifact 检测 |
| `mocks/handlers.ts` | 消息列表和详情接口中调用 detector 填充 artifacts |

---

## 三、项目文件夹管理（5 项）

### ⑫ 对话列表按项目分组 section

**实现思路：**

ConversationList 从扁平列表改为分组列表：

```
▼ 📁 前端重构     (5)
  ├─ 💬 与 Claude Code 的对话
  ├─ 💬 写单元测试
  └─ ...
▼ 📁 后端 API     (3)
  ├─ 💬 设计数据模型
  └─ ...
▼ 📁 未分类       (2)
  ├─ 💬 随便问问
  └─ ...
```

- 每个 section 可折叠/展开（Semi Collapse 或自定义）
- section header 显示项目名 + 对话数
- "未分类"始终在最下方
- 选中的对话高亮，跟当前扁平逻辑一致

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `ConversationList.tsx` | 重构为分组列表（SectionHeader + 对话项） |
| `useConversations.ts` | 按 projectId 分组 + 排序逻辑 |

---

### ⑬ 拖拽排序 + 移入项目

**实现思路：**

用 `@dnd-kit/core` + `@dnd-kit/sortable`：

1. 对话项可拖拽排序（在项目内调整顺序）
2. 对话项可拖入另一个项目 section → 自动更新 `conversation.projectId` → 调用 `PATCH /conversations/:id`
3. 拖拽过程中目标 section 高亮（`DragOverlay`）
4. 右键菜单增加"移动到"→ 列出所有项目
5. 新增 `sortOrder` 字段？还是用 `lastActiveAt` 排序？——建议保持时间排序，拖拽只做跨项目移动，不支持手动排序（避免复杂性）

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `ConversationList.tsx` | 包裹 DndContext + SortableContext |
| 新建 `DraggableConversation.tsx` | 可拖拽的对话列表项 |
| `types/chat.ts` | Conversation 扩展 `sortOrder?` 字段（如需手动排序） |

**后端协定：** 已有 `PATCH /conversations/:id`，更新 `projectId` 字段即可。如需手动排序，需新增 `sort_order` 字段。

---

### ⑭ 文件夹合并

**实现思路：**

1. 右键项目 section header → "合并到..."→ 弹出项目选择器
2. 选择目标项目 → 确认
3. 前端调用 `POST /projects/:sourceId/merge-into/:targetId`
4. 乐观更新：将所有对话移到目标项目 + 删除源项目
5. Toast 提示合并结果

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `ConversationList.tsx` | section header 右键菜单 + 合并对话框 |
| `lib/api.ts` | 新增 `projectApi.mergeInto()` |

**后端协定：**

```
POST /api/v1/projects/:sourceId/merge-into/:targetId
Authorization: Bearer <token>

Response 200:
{
  "code": 200,
  "data": {
    "moved_count": 5,
    "source_project_id": "proj-A",
    "target_project_id": "proj-B"
  }
}
```

---

### ⑮ 新建对话归属逻辑 + 未分类

**规则：**

1. 在某个项目 section 下点"新建对话"→ 自动填入该项目
2. 从"全部项目"/"未分类"下新建 → 默认不归属任何项目（projectId = null）
3. conversation.projectId = null → 显示在"未分类"
4. 新建对话弹窗增加"所属项目"下拉选择（默认为当前上下文项目）
5. 无归属对话可以通过拖拽或右键菜单移入项目

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `ConversationList.tsx` | 新建对话弹窗 + 项目预填 + 上下文感知 |
| `useConversations.ts` | 支持 projectId 参数 |

---

### ⑯ 标签 + 筛选（替代子文件夹）

**实现思路：**

既然不做多级文件夹，用标签来灵活分组：

1. 右键对话 → "编辑标签"→ 输入 Tag 名称（类似 Agent 的能力标签）
2. 标签存储在 `conversation.tags: string[]`
3. ConversationList 顶部增加标签筛选栏（横向 scrollable Tag 列表，可多选）
4. 选中标签 → 只显示包含该标签的对话（项目分组逻辑保持）

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `ConversationList.tsx` | 标签筛选栏 + 编辑标签弹窗 |
| `types/chat.ts` | Conversation 扩展 `tags?: string[]` |
| `lib/api.ts` | PATCH /conversations/:id 支持 tags（已有，字段可扩展） |

**后端协定：** 已有 `PATCH /conversations/:id` 支持。确保 `tags` 字段存入数据库即可。

---

## 四、交互增强（5 项）

### ⑰ 消息列表虚拟化（react-virtuoso）

**实现思路：**

移除当前自写的滚动逻辑（IntersectionObserver / useLayoutEffect scrollIntoView / 手动上滚检测 / 滚底按钮），替换为 react-virtuoso：

```tsx
<Virtuoso
  data={flattenedMessages}
  endReached={loadMore}
  followOutput="smooth"
  atBottomStateChange={setAtBottom}
  firstItemIndex={cursorOffset}
  itemContent={(i, msg) => renderMessage(msg)}
/>
```

保留：时间分隔线插入、消息气泡渲染、流式/等待中气泡、入场动画、搜索高亮。

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `MessageList.tsx` | 大规模重构：删除自写滚动逻辑，接入 react-virtuoso |
| `package.json` | 新增 `react-virtuoso` |

---

### ⑱ 斜杠命令（Claude Code 风格）

**实现思路：**

复用 @提及的 Popover 组件和交互逻辑：

1. contentEditable 中检测 `/` 字符 → 弹出命令菜单 Popover
2. 菜单项显示：图标 + 命令名 + 描述
3. 键盘 ArrowDown/Up 选择，Enter 确认，Esc 关闭
4. 选中后把命令文本（如 `/code`）插入光标位置
5. 不附加模板，用户自己继续输入

**命令列表：**

| 命令 | 图标 | 描述 | 实际发送内容 |
|------|------|------|------------|
| `/code` | IconCode | 生成代码 | `/code ` |
| `/explain` | IconBulb | 解释代码 | `/explain ` |
| `/fix` | IconWrench | 修复 Bug | `/fix ` |
| `/review` | IconSearch | 审查产物 | `/review ` |
| `/deploy` | IconSend | 触发部署 | `/deploy ` |
| `/image` | IconImage | 上传图片 | 触发文件选择器 |

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `ChatInput.tsx` | 新增 `/` 检测 + 命令 Popover |
| 新建 `SlashCommandPopover.tsx` | 命令列表菜单（可复用 MentionPopover 组件） |

---

### ⑲ 草稿自动保存

**实现思路：**

```
存储：localStorage["agenthub-draft-{conversationId}"]
       = { html: string, plainText: string, savedAt: ISO string }

写入：contentEditable onInput → debounce 800ms → setItem
读取：切换对话时 getItem → 恢复内容
清除：发送成功后 removeItem
过期：读取时检查 savedAt > 7天 → 清理
```

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `ChatInput.tsx` | 新增草稿保存/恢复/清除逻辑 |
| `lib/draftStorage.ts` | localStorage 封装 |

---

### ⑳ 选中文字浮动工具栏

**实现思路：**

1. MessageBubble 的 `onMouseUp` → `window.getSelection()` → 判断选区在本气泡内
2. 选区非空 → 显示浮动工具栏（半透明背景，绝对定位在选区上方）
3. "复制选中"→ clipboard.writeText → toast
4. "引用选中"→ 设置 `chatStore.pendingQuote`，对接现有引用条

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `MessageBubble.tsx` | 新增 onMouseUp 选区检测 + 浮动工具栏 |
| 新建 `SelectionToolbar.tsx` | 浮动工具栏组件 |

---

### ㉑ 键盘增强

| 快捷键 | 行为 | 实现位置 |
|--------|------|---------|
| `Ctrl+J` | 下一个对话 | AppLayout 全局 keydown |
| `Ctrl+K` | 上一个对话 | AppLayout |
| `Ctrl+[` | 上一个项目 | AppLayout |
| `Ctrl+]` | 下一个项目 | AppLayout |
| `Ctrl+E` | 聚焦输入框 | AppLayout → ChatInput ref |
| `Esc` | 关闭搜索 / 关闭面板 / 退出批量模式 | 各组件 |

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `AppLayout.tsx` | 新增全局键盘快捷键监听（排除输入框聚焦时） |
| `useKeyboardShortcut.ts` | 扩展（现有 hook 支持 Ctrl+N/Ctrl+F） |

---

### ㉒ 对话标题内联编辑（DeepSeek 风格）

**实现思路：**

1. ConversationList 中标题区域改为 contentEditable（初始状态为只读）
2. 双击标题 → 进入编辑态（边框高亮 + 光标）
3. 回车 → 调用 `PATCH /conversations/:id { title }` → 退出编辑
4. Esc → 恢复原标题 → 退出编辑
5. 单击不触发编辑（用于选中/拖拽）

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `ConversationList.tsx` | 标题区改为可编辑 |

**后端协定：** 已有 `PATCH /conversations/:id`。

---

### ㉓ M21 @提及 task_hints 增强

**实现思路：**

1. 群聊中解析 `@Agent名 具体指令` → chip 到下一个 chip 之间的文本作为指令
2. 遍历 contentEditable DOM，找 `[data-mention-id]` chip 节点 → 提取关联文本
3. 构造 `task_hints: [{ agent_id, hint }]` 随消息发送
4. Agent 补全弹窗每项显示能力标签

**涉及文件：**

| 文件 | 操作 |
|------|------|
| `ChatInput.tsx` | 增强补全列表 + task_hints 构造 |
| `mentionParser.ts` | 新增 `parseTaskHints()` |
| `types/chat.ts` | `SendMessageRequest` 扩展 `task_hints` 字段 |

**后端协定：** 已有 `POST /messages` 支持，`SendMessageRequest` 新增可选字段 `task_hints`。

---

## 五、后端 API 协定汇总

### 需要后端新开发

| # | 端点 | 用途 | 详情文档 |
|----|------|------|---------|
| 1 | `POST /api/v1/files/upload` | 图片/文件上传 | `前端需求-后端API协定-图片上传与文件服务.md` §1 |
| 2 | `GET /api/v1/files/:id` | 文件访问（返回流） | 同上 §2 |
| 3 | `GET /api/v1/files/:id?inline=true` | 内联访问 | `前端需求-后端API协定-文档预览与pin消息.md` §1 |
| 4 | `GET /api/v1/files/:id/preview?format=pdf` | Office 转 PDF 预览 | 同上 |
| 5 | `GET /api/v1/files/:id/content` | 获取文件文本内容 | `前端需求-后端API协定-代码编辑器与Diff应用.md` §1.2 |
| 6 | `PUT /api/v1/files/:id/content` | 更新文件内容 | 同上 |
| 7 | `POST /api/v1/files/:id/apply-diff` | 应用 Diff | 同上 §2.1 |
| 8 | `GET /api/v1/files/:id/conflicts` | 获取冲突详情 | 同上 §3.2 |
| 9 | `POST /api/v1/files/:id/resolve-conflict` | 解决冲突 | 同上 §3.3 |
| 10 | `GET /api/v1/conversations/:id/pins` | 获取已 pin 消息列表 | `前端需求-后端API协定-文档预览与pin消息.md` §2 |
| 11 | `POST /api/v1/projects/:id/merge-into/:targetId` | 合并项目 | 本文 §三-⑭ |
| 12 | `GET /api/v1/projects/:id/files` | 获取项目文件树 | `前端需求-后端API协定-代码编辑器与Diff应用.md` §1.1 |

### 需要后端扩展已有接口

| # | 端点 | 扩展内容 |
|----|------|---------|
| 13 | `POST /api/v1/conversations/:id/messages` | `SendMessageRequest` 新增 `attachments[]`、`task_hints[]` 字段 |
| 14 | SSE 事件 | 新增 `attachment` 事件类型；新增 `conflict_detected` 事件类型 |
| 15 | SSE `message_start` | `meta` 支持 `agent_config`（用于 Agent 对话式创建） |
| 16 | `Message` 响应 | 新增 `attachments[]` 字段 |
| 17 | `Conversation` 模型 | 新增 `tags: string[]` 字段（用于标签筛选） |

---

## 六、执行顺序建议

```
第1轮：课题硬伤（P0）
  ② 图片/文件上传 → ③ Monaco 编辑器 → ④ Apply Diff + 冲突
  → ⑤ 文档预览 → ① Agent 对话式创建 → ⑥ Pin UI → ⑦ 高优 Bug

第2轮：架构改造（P0）
  ⑧ SSE 多路后台 → ⑨ 红点通知 → ⑩ SSE 逐字输出 → ⑪ TS artifact detector

第3轮：项目文件夹（P1）
  ⑫ 分组 section → ⑮ 归属逻辑 → ⑬ 拖拽 → ⑭ 合并 → ⑯ 标签

第4轮：交互增强（P1）
  ⑰ react-virtuoso → ⑱ 斜杠命令 → ⑲ 草稿保存 → ⑳ 选中工具栏
  → ㉑ 键盘增强 → ㉒ 标题内联编辑 → ㉓ task_hints
```
