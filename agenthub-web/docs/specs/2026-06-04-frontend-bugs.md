# AgentHub 前端 Bug 全量审计报告

审计日期：2026-06-04 | 方法：代码级静态分析 + Playwright 浏览器自动化 + 真实后端 API 验证

---

## 一、审计方法

| 方法 | 覆盖范围 |
|------|---------|
| 代码静态分析 | 全部 30+ 组件、stores、types、lib、mocks |
| Playwright 浏览器测试 | 登录→单聊→群聊→Pin→搜索→暗色模式→产物工作台 |
| 真实后端 API 验证 | token 登录、消息/Agent/对话 CRUD、SSE 事件捕获 |
| DOM 状态检查 | 卡片渲染、Pin 数据源同步、XML 标签清洗、Console 错误 |

---

## 二、P0 — 阻塞级（功能完全不可用或数据不一致）

### BUG-F1: Pin 消息存在两个独立数据源，UI 状态矛盾

**文件**: [chatStore.ts:53-55](src/stores/chatStore.ts), [MessageList.tsx:189-201](src/components/chat/MessageList.tsx), [MessageContextMenu.tsx:5](src/components/chat/MessageContextMenu.tsx), [MessageActions.tsx:18-21](src/components/chat/MessageActions.tsx), [ChatArea.tsx:74-83](src/components/layout/ChatArea.tsx)

**两个数据源**:
| 数据源 | 存储位置 | 使用者 |
|--------|---------|--------|
| `message.isPinned` (boolean) | API/DB 返回的 Message 对象 | MessageContextMenu (右键菜单), 书签图标 |
| `pinnedMessageIds` (string[]) | zustand chatStore | 蓝色左边框, MessageActions Pin 按钮颜色 |

**浏览器验证结果**:

1. 悬停消息 → 点击 Pin 按钮（MessageActions.handlePin）:
   - API `/pins` POST → 201 ✓
   - `addPinnedMessage(id)` → zustand 更新 ✓
   - `message.isPinned` 不变（React Query 未刷新）✗
   - **结果**: 蓝色边框出现 | 书签图标不出现 | 右键菜单仍显示"Pin"而非"取消 Pin"

2. 右键菜单 → Pin（ChatArea.handlePin）:
   - API `/pins` POST → 201 ✓  
   - `invalidateQueries` → message.isPinned 变为 true ✓
   - **未调用** `addPinnedMessage(id)` ✗
   - **结果**: 书签图标出现 | 蓝色边框不出现 | MessageActions 按钮颜色错误

**Playwright 实测证实**:
```
After hover-pin: blueBorder=false bookmark=false
Right-click menu: hasUnpin=false hasPin=true (应该显示"取消Pin"但显示了"Pin")
```

---

### BUG-F2: PinnedMessages 和 PinManager 是未集成的死代码

**文件**: [PinnedMessages.tsx](src/components/chat/PinnedMessages.tsx), [PinManager.tsx](src/components/chat/PinManager.tsx), [ChatHeader.tsx](src/components/chat/ChatHeader.tsx)

- PinnedMessages.tsx: 已固定消息列表面板组件（140 行代码）
- PinManager.tsx: Pin 数据管理组件
- **两个组件均未被任何文件 import 或渲染**
- ChatHeader.tsx 中无 Pin 入口 UI（Playwright 验证: `header-pin: entry=false`）
- 用户无法查看已固定消息列表

---

### BUG-F3: 所有 MVP 产物卡片不可见（由后端根因 B1 传导）

**根因**: 后端 ADK `invocation_id` 非 UUID → artifact 持久化静默失败 → `artifacts: []` 始终为空

**前端影响**:
| 卡片类型 | 前端组件 | 实际渲染 | 原因 |
|---------|---------|---------|------|
| CodeCard | `CodeCard.tsx` | **0 个** | 后端 artifact 永远为空 |
| DiffCard | `DiffCard.tsx` + Monaco DiffEditor | **0 个** | 同上 |
| PreviewCard | `PreviewCard.tsx` + iframe | **0 个** | 同上 |
| FileCard | `FileCard.tsx` | **0 个** | 同上 |
| DocumentCard | `DocumentCard.tsx` | **0 个** | 同上 |
| LinkPreviewCard | `LinkPreviewCard.tsx` | **仅 fallback** | renderFallbackCards URL 正则 |
| DeployStatusCard | `DeployStatusCard.tsx` | **0 个** | 后端 artifact 为空 |

**Playwright 实测证实**:
```
diff-cards: 0
artifact-cards: 0  
monaco: 0 monaco elements
iframes: 0 iframes
msgs-with-xml: 0 (sanitizeMarkdown 清洗后)
msgs-with-cards: 0
产物工作台卡片: 0
```

---

## 三、P1 — 体验严重受损

### BUG-F4: renderFallbackCards 仅在 done 态触发

**文件**: [MessageList.tsx:343](src/components/chat/MessageList.tsx)
```typescript
{message.status === "done" && renderFallbackCards(message.content, message.artifacts)}
```

流式过程中用户完全看不到任何卡片，所有卡片在 `message_end` 后才突然出现。

---

### BUG-F5: renderFallbackCards 覆盖不完整

**文件**: [MessageList.tsx:27-114](src/components/chat/MessageList.tsx)

| 卡片 | Fallback 覆盖 | 触发条件 | 限制 |
|------|-------------|---------|------|
| DiffCard | ✅ | ```diff 代码块 / "修改前/后"配对 / +/-行标记 | language 固定 "diff", fileName 空 |
| LinkPreviewCard | ✅ | 文本中 URL 正则匹配 | 无 OG 元数据，仅纯 URL |
| CodeCard | ❌ | — | 代码仅 Markdown 渲染，不生成卡片 |
| PreviewCard | ❌ | — | 永不可见 |
| FileCard | ❌ | — | 永不可见 |
| DocumentCard | ❌ | — | 永不可见 |

---

### BUG-F6: DocumentCard 是空壳实现

**文件**: [DocumentCard.tsx](src/components/cards/DocumentCard.tsx)

- `react-pdf` **未安装** — package.json 无此依赖
- PDF 用原生 `<iframe>` 替代 react-pdf（无翻页、缩放、页码）
- docx 渲染: `mammoth` 已安装但未集成 → 显示 `<Empty>` 占位
- xlsx 渲染: `xlsx` 已安装但未集成 → 显示 `<Empty>` 占位
- loading 状态: 仅靠 600ms `setTimeout` 假 loading，不做真实文件加载检测

---

### BUG-F7: ChatHeader 缺失 Pin 消息入口

**文件**: [ChatHeader.tsx:24-174](src/components/chat/ChatHeader.tsx)

- 无"已固定 (N)"按钮
- 无 PinnedMessages 面板集成
- Playwright 验证: `header-pin: entry=false`

---

### BUG-F8: 附件上传产生重复 temp 条目

**文件**: [ChatInput.tsx:276-292](src/components/chat/ChatInput.tsx)

```
uploadFile():
  addPendingAttachment(temp)     // fileId="" 的临时条目
  upload success →
  addPendingAttachment({...temp, id: tempId + "-done", fileId: d.id})  // 新条目！
  // BUG: 临时条目未移除，store 中每个文件有 2 条记录
```

`handleSend` 过滤 `a.fileId` 非空的，所以只发送完成的文件。但临时条目永远残留在 store 中。

---

### BUG-F9: PreviewCard iframe 重渲染问题

**文件**: [PreviewCard.tsx:21-38](src/components/cards/PreviewCard.tsx)

```typescript
const IframeEl = (_props: { fullscreen?: boolean }) => (...)
```

`IframeEl` 定义为组件内函数（非 memo），每次渲染都是新组件实例 → iframe 被销毁重建。全屏 Modal 和内联各维护独立 iframe 实例。

---

### BUG-F10: DiffCard Monaco 暗色模式不同步

**文件**: [DiffCard.tsx:55](src/components/cards/DiffCard.tsx)

```typescript
const isDark = typeof document !== "undefined" && 
  document.documentElement.getAttribute("theme-mode") === "dark";
```

`isDark` 不是 React state，从 DOM 直接读取。主题切换时组件不重渲染 → Monaco 编辑器主题不更新。

---

## 四、P2 — 代码质量/设计问题

### BUG-F11: Mock/Real 切换逻辑自相矛盾

**文件**: [main.tsx:10](src/main.tsx), [IconSidebar.tsx:22](src/components/layout/IconSidebar.tsx)

```typescript
// main.tsx:10
const useMock = import.meta.env.VITE_USE_MOCK === "false";
if (useMock) { enableMockMode(); }

// IconSidebar.tsx:22  
const isMock = import.meta.env.VITE_USE_MOCK !== "false";
```

同一环境变量，两个文件判断逻辑相反。当前 `.env.local` = `VITE_USE_MOCK=true` → Mock 未激活（连真实后端）。

---

### BUG-F12: 所有卡片组件用 `as unknown as` 双重断言

**文件**: CodeCard / DiffCard / PreviewCard / FileCard / DeployStatusCard / DocumentCard / LinkPreviewCard

```typescript
const c = artifact.content as unknown as DiffArtifactContent;
```

`Artifact.content` 定义为 `Record<string, unknown>`，运行时字段不匹配无类型保护，直接渲染导致白屏。

---

### BUG-F13: orchestrator 消息 JSON 残留文本截断

**文件**: [MessageList.tsx:19-25](src/components/chat/MessageList.tsx)

```typescript
function cleanContent(message: Message): string {
  if (message.senderType !== "orchestrator") return raw;
  const idx = raw.search(/\{\s*"subtasks?"/);
  if (idx > 0) return raw.slice(0, idx).trim();
  return raw;
}
```

正则只匹配 `{"subtask` 格式，JSON 中换行或空格变体可能漏过。

---

### BUG-F14: sanitizeMarkdown 可能过度清洗

**文件**: [MarkdownBubble.tsx:103-113](src/components/chat/MarkdownBubble.tsx)

`EVENT_ATTR_RE` 正则会匹配代码块中展示的 HTML 属性字符串。`<textarea>` 替换为 `<pre>` 可能改变代码语义。

---

### BUG-F15: ConflictResolver 在真实模式下不可验证

**文件**: [ConflictResolver.tsx](src/components/cards/ConflictResolver.tsx)

- 仅在 DiffCard `handleSave` 收到 HTTP 409 时触发
- 后端 `conflict_detected` SSE 事件 callback 已注册但 mock 不发送
- Mock 模式下完全不可验证

---

### BUG-F16: ArtifactWorkbench 筛选功能不完整

**文件**: [ArtifactWorkbench.tsx:7-14](src/components/chat/ArtifactWorkbench.tsx)

- 定义了 7 种类型筛选选项（含"文档"）
- 但由于后端 artifact 为空，整个工作台始终显示空状态
- Agent 筛选按 `senderId` 过滤，但 `senderName` 是展示字段，匹配逻辑不一致

---

## 五、已验证正常的功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 登录/认证 | ✅ | JWT token 正确 |
| 对话列表 | ✅ | 2 个对话正确显示 |
| 消息发送 | ✅ | contentEditable 正常 |
| 消息渲染 | ✅ | Markdown 渲染正常 |
| 消息操作栏（悬停） | ✅ | 3 个按钮（复制/引用/Pin） |
| 右键菜单 | ✅ | 弹出正常 |
| 消息搜索 | ✅ | 12 个高亮，"找到 5 条" |
| 群聊 Planner 选择器 | ✅ | 显示正常 |
| OchestratorPlan 卡片 | ✅ | plan_draft 后显示 |
| Agent 标签 | ✅ | 正确显示 |
| Dark/Light 模式 | ✅ | theme-mode 切换 |
| Console 错误 | ✅ | 0 个错误 |
| ErrorBoundary | ✅ | 0 个触发 |
| ArtifactWorkbench UI | ✅ | 结构存在但为空 |

---

## 六、总计

| 级别 | 数量 | 关键 Bug |
|------|------|---------|
| P0 | 3 | Pin 双数据源、PinnedMessages 死代码、卡片全部不可见 |
| P1 | 7 | fallback 覆盖不全、DocumentCard 空壳、ChatHeader 无 Pin、附件重复、iframe 重建、Monaco 主题不同步 |
| P2 | 6 | Mock/Real 矛盾、as unknown as、JSON 截断、过度清洗、Conflict 不可验证、筛选不一致 |
| **合计** | **16** | |

---

## 七、修复优先级

### 第 1 轮（阻塞，1 天）
1. **后端 B1**: 修复 ADK invocation_id → 所有卡片恢复
2. **F1**: 统一 Pin 数据源为 zustand `pinnedMessageIds`，ChatArea.handlePin 同步更新
3. **F2**: 集成 PinnedMessages 面板到 ChatHeader

### 第 2 轮（功能，1-2 天）
4. **F4/F5**: renderFallbackCards 添加 streaming 支持 + 补全 Preview/File/Document fallback
5. **F8**: 附件上传去重
6. **F10**: Monaco 主题改为 React state 响应

### 第 3 轮（质量，1 天）
7. **F6**: DocumentCard 集成 mammoth/xlsx，安装 react-pdf
8. **F11**: 统一 Mock/Real 切换逻辑
9. **F12**: Artifact 类型改为泛型/discriminated union
