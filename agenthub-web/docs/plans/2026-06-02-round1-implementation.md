# Round 1 实施 Plan — 课题缺失功能

日期：2026-06-02 | Spec: `docs/specs/2026-06-02-round1-missing-features.md`

---

## 前置准备

```bash
npm install @monaco-editor/react react-pdf mammoth xlsx
```

---

## Task 1: 高优 Bug 修复 (B1-B3, B5-B7)

### Task 1.1 — B1 @弹窗 blur 不关闭

**文件**: `ChatInput.tsx`

在 contentEditable div 上添加 `onBlur` handler：

```tsx
// 在 handleDrop 之后新增
const handleBlur = useCallback(() => {
  setTimeout(() => setMentionActive(false), 150);
}, []);

// 在 contentEditable div 上加 onBlur={handleBlur}
```

### Task 1.2 — B2 流式内容切换丢失

**文件**: `ChatArea.tsx`，activeId useEffect (line 145-166)

在 abort 和 finalize 前，将 streamingContent 写入 React Query InfiniteData 缓存：

```tsx
const msgId = streamMsgIdRef.current;
if (msgId) {
  const sc = useChatStore.getState().getStreamingContent(msgId);
  if (sc) {
    qc.setQueryData<InfiniteData<MessageListData>>(["messages", activeId], (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page, idx) => {
          if (idx !== 0) return page;
          const exists = page.data.some((m) => m.id === msgId);
          if (!exists) {
            const partial: Message = {
              id: msgId, conversationId: activeId ?? "",
              senderType: "agent", senderId: streamSenderIdRef.current,
              senderName: streamAgentRef.current, contentType: "text",
              content: sc.content, artifacts: sc.artifacts,
              status: "failed", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            };
            return { ...page, data: [partial, ...page.data] };
          }
          return {
            ...page,
            data: page.data.map((m) => m.id === msgId
              ? { ...m, content: sc.content, artifacts: sc.artifacts }
              : m),
          };
        }),
      };
    });
  }
}
```

### Task 1.3 — B3 搜索模式无 tooltip

**文件**: `ChatHeader.tsx`

用 Semi `Tooltip` 包裹搜索切换按钮。

### Task 1.4 — B5 空对话状态重复

**文件**: `ChatArea.tsx`，删除 line 710-755 的重复 starter 按钮区域，替换为一句简洁提示。

### Task 1.5 — B6 ReAct 面板定位

**文件**: `ReActPanel.tsx`，初始位置计算包在 `requestAnimationFrame` 中。

### Task 1.6 — B7 Planner Select 重置

**文件**: `ChatArea.tsx`，在 activeId useEffect 中加 `setPlannerAgentId(null)`。

---

## Task 2: Pin 消息 UI

### Task 2.1 — 类型

**文件**: `types/api.ts` — 新增 `PinnedMessage`、`GetPinsResponse`

### Task 2.2 — API

**文件**: `lib/api.ts` → `conversationApi` 新增 `getPins(conversationId)`

### Task 2.3 — Store

**文件**: `stores/chatStore.ts` — 新增 `pinnedMessageIds: string[]` + `addPinnedMessage` / `removePinnedMessage` / `setPinnedMessages`

### Task 2.4 — PinnedMessages 面板

**新建**: `components/chat/PinnedMessages.tsx`

- 用 useQuery 调用 `getPins`
- 列表渲染：截断文本 + 发送者 + 时间 + 取消固定按钮
- 点击消息 → `onJumpTo(messageId)` → MessageList 滚动到目标
- 空状态："暂无固定消息"

### Task 2.5 — MessageActions Pin 按钮

**文件**: `MessageActions.tsx`

- 加 Pin 按钮（IconPin），已 pin 状态时蓝色高亮
- onClick → 调 pinMessage / unpinMessage API → 更新 store

### Task 2.6 — ChatHeader 入口

**文件**: `ChatHeader.tsx`

- 搜索按钮旁加"已固定 (N)"文字按钮
- 点击 → 打开 PinnedMessages popover

### Task 2.7 — Pin 色条

**文件**: `MessageList.tsx` 中 MessageBubble

- 被 pin 消息左侧 `border-left: 3px solid var(--color-primary)`，padding 调整

### Task 2.8 — Mock

**文件**: `mocks/handlers.ts` — GET `/conversations/:id/pins` mock

---

## Task 3: 图片/文件上传 + Attachment

### Task 3.1 — 类型

**文件**: `types/chat.ts`

- 新增 `Attachment` 接口：`{ id, fileName, fileUrl, fileType, fileSize, thumbnailUrl?, uploadStatus }`
- `Message` 加 `attachments?: Attachment[]`
- `SendMessageRequest` 加 `attachments?`
- `ArtifactType` 加 `"document"`（为 Task 5 预留）

**文件**: `types/api.ts` — 新增 `UploadFileResponse`、`GetFileResponse`

### Task 3.2 — API

**文件**: `lib/api.ts` — 新增 `fileApi`：

```ts
export const fileApi = {
  upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    return api.post("/files/upload", fd, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60000,
    });
  },
  getFile(id: string) { ... },
  updateContent(id: string, content: string) { ... },
  applyDiff(id: string, data: { diff: string; expected_hash?: string }) { ... },
};
```

### Task 3.3 — Store

**文件**: `stores/chatStore.ts`

```ts
pendingAttachments: Attachment[];
addPendingAttachment: (att: Attachment) => void;
updatePendingAttachment: (id: string, u: Partial<Attachment>) => void;
removePendingAttachment: (id: string) => void;
clearPendingAttachments: () => void;
```

### Task 3.4 — AttachmentPreview 组件

**新建**: `components/chat/AttachmentPreview.tsx`

- Flex row 排列缩略图卡片
- 图片显示 `<img>` 缩略图，文件显示图标 + 文件名 + 大小
- 每个项右上角 X 删除按钮
- uploading 状态显示 Spin

### Task 3.5 — ChatInput 改造

**文件**: `ChatInput.tsx`

- `handlePaste`：检测 `clipboardData.files` → 调 `fileApi.upload()` → 成功加入 pendingAttachments → 不拦截文字粘贴仅不拦截图片了
- `handleDrop`：`e.dataTransfer.files` → 同上传流程
- `handleSend`：读取 `pendingAttachments` → 传给 onSend → 发送后 clear
- `onSend` 签名改为 `(content, mentions, attachments) => void`
- 输入框下方渲染 `<AttachmentPreview>`（在 pendingQuote 之下）

### Task 3.6 — ChatArea 适配

**文件**: `ChatArea.tsx`

- `handleSend` 接受 `attachments` 参数
- `executeSend` 接收 `attachments` → POST 时传 attachments → optimistic 消息含 attachments
- SSE 新增 `onAttachment` 回调（处理 `attachment` 事件）

### Task 3.7 — MessageList 渲染

**文件**: `MessageList.tsx` MessageBubble

- `message.attachments?.map` → 图片用 `<img>` + Semi Image.Preview / 文件用 FileCard 复用

### Task 3.8 — SSE 支持

**文件**: `lib/sse.ts`

- SSECallbacks 加 `onAttachment?`
- eventHandlers 加 `attachment`

### Task 3.9 — Mock

**文件**: `mocks/handlers.ts` — POST `/files/upload`、GET `/files/:id` mock

---

## Task 4: Monaco 代码编辑器

### Task 4.1 — MonacoCodeEditor 组件

**新建**: `components/editor/MonacoCodeEditor.tsx`

```tsx
interface Props {
  code: string;
  language: string;
  fileName?: string;
  readOnly?: boolean;
  onChange?: (value: string | undefined) => void;
  onSave?: (code: string) => void;
}
```

- `@monaco-editor/react` Editor
- 顶部文件名 bar
- Ctrl+S → `onSave`
- 主题跟随 uiStore.theme

### Task 4.2 — CodeCard 编辑模式

**文件**: `CodeCard.tsx`

- 新增 `editing` state + `editedCode` state
- header 加"编辑"按钮（IconEdit）
- 编辑态：替换 HighlightedCode 为 MonacoCodeEditor
- 保存：调 `fileApi.updateContent(artifact.id, editedCode)` → toast → 退出编辑
- 取消：恢复原始代码

### Task 4.3 — PreviewCard Tab

**文件**: `PreviewCard.tsx`

- Modal 加 Semi Tabs："预览" / "源代码"
- "源代码" Tab 用 MonacoCodeEditor readOnly 展示 iframe src URL 对应的 HTML（如果能获取到）

### Task 4.4 — Mock

**文件**: `mocks/handlers.ts` — PUT `/files/:id/content` mock

---

## Task 5: 文档预览

### Task 5.1 — 类型

**文件**: `types/chat.ts` — `DocumentArtifactContent`

```ts
interface DocumentArtifactContent {
  fileName: string; fileUrl: string;
  fileType: "pdf" | "docx" | "xlsx" | "pptx"; fileSize: number;
}
```

### Task 5.2 — DocumentCard 组件

**新建**: `components/cards/DocumentCard.tsx`

- PDF：`react-pdf` Document + Page，翻页控件
- docx：fetch arrayBuffer → `mammoth.convertToHtml` → `dangerouslySetInnerHTML`
- xlsx：fetch arrayBuffer → `XLSX.read` → `XLSX.utils.sheet_to_html` → `dangerouslySetInnerHTML`
- pptx：占位提示"暂不支持预览，请下载查看"
- Loading 态 + Error 态
- 复用 useResizable

### Task 5.3 — CardRenderer 注册

**文件**: `CardRenderer.tsx` — `document: DocumentCard`

### Task 5.4 — ArtifactWorkbench 筛选

**文件**: `ArtifactWorkbench.tsx` — TYPE_OPTIONS 加 `{ value: "document", label: "文档" }`

### Task 5.5 — Mock SSE

**文件**: `mocks/sse.ts` — 在 mock 流中附加一个 document artifact

---

## Task 6: Apply Diff + 冲突解决

### Task 6.1 — 类型

**文件**: `types/chat.ts`

- `SSEEventType` 加 `"conflict_detected"`
- 新增 `SSEConflict`、`ConflictEntry` 接口

### Task 6.2 — ConflictResolver 组件

**新建**: `components/cards/ConflictResolver.tsx`

```
┌─────────────────────────────────────┐
│ 代码冲突 — src/App.tsx               │
│                                     │
│ ■ Claude Code 修改 (+1 -0)  [接受]  │
│ │ + return x + 1;                  │
│ │ - return x;                      │
│                                     │
│ ■ Codex 修改 (+1 -1)      [接受]    │
│ │ + return x * 2;                  │
│ │ - return x;                      │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 合并结果 (可编辑)               ││
│ │ function foo() { return x+1; }  ││
│ └─────────────────────────────────┘│
│                                     │
│ [全部接受] [手动合并] [取消]         │
└─────────────────────────────────────┘
```

- 每个 Agent 一整行，不左右拆分
- 每个 Agent 显示 diff 内容 + "接受"/"跳过"按钮
- 底部合并结果 TextArea + 操作按钮
- 确认后调 `fileApi.resolveConflict()`

### Task 6.3 — DiffCard 改造

**文件**: `DiffCard.tsx`

- header 加"应用修改"按钮
- 点击 → Semi Modal 确认对话框（展示文件名 + 增删行统计）
- 确认 → `fileApi.applyDiff()` → 成功 toast / 409 → 展开 ConflictResolver

### Task 6.4 — SSE 扩展

**文件**: `lib/sse.ts`

- `SSECallbacks` 加 `onConflict?`
- `eventHandlers` 加 `conflict_detected`

### Task 6.5 — ChatArea + Store

**文件**: `ChatArea.tsx` buildCallbacks — `onConflict` handler

**文件**: `stores/chatStore.ts` — `activeConflict: SSEConflict | null` + setter

### Task 6.6 — Mock

**文件**: `mocks/handlers.ts` — POST `/files/:id/apply-diff`，`sessionStorage.getItem("mock_diff_conflict")` 控制 409 模拟

**文件**: `mocks/sse.ts` — `conflict_detected` 事件发送（执行阶段穿插）

---

## Task 7: Agent 对话式创建

### Task 7.1 — 类型

**文件**: `types/chat.ts`

- `PlanSubtask` 加 `type?: "code" | "review" | "create_agent" | "deploy"`
- `PlanSubtask` 加 `agent_config?: AgentCreationConfig`
- 新增 `AgentCreationConfig` 接口：`{ name, provider, model, baseUrl, apiKey, systemPrompt, capabilities, toolConfig }`

### Task 7.2 — AgentConfigPreviewCard

**新建**: `components/cards/AgentConfigPreviewCard.tsx`

- 卡片展示：名称、provider/model、System Prompt（截断可展开）、能力标签、工具集
- "确认创建"按钮 → `agentApi.create()` → toast → 跳转新 Agent 单聊
- "编辑"按钮 → 打开 CreateAgentModal 预填数据

### Task 7.3 — CardRenderer

**文件**: `CardRenderer.tsx` — 注册 `agent_config: AgentConfigPreviewCard`

### Task 7.4 — AgentManageModal

**文件**: `AgentManageModal.tsx`

- "创建"按钮旁加"对话式创建"按钮
- onClick → `useCreateConversation` 创建群聊（agentIds: [orchestrator]）→ 关闭 Modal → setActiveConversation

### Task 7.5 — OrchestratorPlan

**文件**: `OrchestratorPlan.tsx`

- 渲染 subtask 时检测 `type === "create_agent"` → 渲染 AgentConfigPreviewCard 代替 TextArea + Select
- 确认执行时检测 create_agent 类型 → 直接调 `agentApi.create()` 而非 confirm_plan

### Task 7.6 — ChatArea

**文件**: `ChatArea.tsx` handleConfirmPlan

- 检查 subtask type → create_agent 时调 `agentApi.create(config)` 而非 POST confirm_plan

### Task 7.7 — Mock SSE

**文件**: `mocks/sse.ts`

- 检测用户消息关键词（/创建|新建.*agent|agent.*配置/）
- 生成 plan_draft，subtask `type: "create_agent"` + 完整 `agent_config`

---

## 执行顺序

```
Task 1 (Bug修复) ──── 0.5天
Task 2 (Pin)      ──── 0.5天    ← 与 T1 可并行
Task 3 (上传)      ──── 1.5天    ← 阻塞 T4/T5/T6
Task 4 (Monaco)   ──── 1天      ← 与 T5 可并行
Task 5 (文档)      ──── 1天      ← 与 T4 可并行
Task 6 (Diff)      ──── 2天
Task 7 (Agent创建) ──── 2天      ← 与 T6 可并行
```

预计总工时：~5-6 天。

---

## 验证

每个 Task 完成后：
1. `npx tsc -b --noEmit` — 零错误
2. `npx vitest run` — 现有 86 tests 全过
3. 浏览器功能验证 (`VITE_USE_MOCK=true`，`npm run dev`)