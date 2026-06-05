# AgentHub 全量审计 Bug 报告

审计日期：2026-06-04 | 审计范围：前端 Mock/SSE/卡片/群聊/Pin/附件 全链路

---

## 总览

| 级别 | 数量 | 影响 |
|------|------|------|
| P0 — 功能不可用 | 7 | Diff/Preview/File 卡片 Mock 模式不可见；Pin 全链路断裂 |
| P1 — 体验严重受损 | 8 | 卡片渲染脆弱；附件重复；群聊状态混乱；DocumentCard 空壳 |
| P2 — 代码质量/技术债 | 5 | 类型断言滥用；CSS 变量缺失；数据源不一致 |

---

## P0 — 功能不可用（阻塞级）

### P0-1. Mock SSE 永远不生成 diff / preview / file / link_preview 产物

- **文件**: [mocks/sse.ts](src/mocks/sse.ts)
- **根因**: `createMockSSEStream()` 只硬编码了两种 artifactType：
  - `"code"`（第 594 行 `artifactType: "code"`）
  - `"deploy_status"`（第 668-693 行）
- **后果**: 在 Mock 模式下，DiffCard、PreviewCard、FileCard、LinkPreviewCard、DocumentCard **永远不可达**。所有声称"Mock 数据已验证卡片功能"的说法均为虚假。
- **证据**: 全文搜索 `artifactType` 在 `mocks/sse.ts` 中，仅出现 `"code"` 和 `"deploy_status"` 两个值。
- **修复方向**: 在 mock SSE 的 `mockResponseTexts` 或独立的 fallback 流程中，为每种 artifactType 添加至少一条 mock 数据。

---

### P0-2. Diff 卡片完全依赖脆弱的 renderFallbackCards 正则匹配

- **文件**: [MessageList.tsx:27-114](src/components/chat/MessageList.tsx)
- **机制**: `renderFallbackCards()` 用三套正则从 markdown 文本中"猜测"生成 Diff 卡片：
  1. `` ```diff ``` `` 代码块（标准 diff 格式）
  2. "修改前/before" 配对 ` ```...``` ` 块（中文/英文关键词）
  3. 任意代码块中检测 `+/-` 行首标记
- **问题列表**:
  - **只在 `message.status === "done"` 时调用**（第 343 行），流式状态下用户看不到任何卡片
  - 正则配对方式不可靠：如果 Agent 输出格式稍有偏差（如换行位置、关键词变体），卡片就不出现
  - 生成的所有 fallback diff card 的 `language` 固定为 `"diff"`，`fileName` 固定为 `""`
  - 第三种检测（`+/−` 标记）会把带有行内 `+` 的代码块误判为 diff
- **修复方向**: 重写 mock SSE 直接生成完整的 `artifactType: "diff"` SSE 事件，而非依赖文本解析。

---

### P0-3. Pin 消息全链路断裂（6 个子 Bug）

#### P0-3a. 双数据源导致 UI 永远不同步

- **文件**: [MessageList.tsx:189-201](src/components/chat/MessageList.tsx) + [chatStore.ts](src/stores/chatStore.ts) + [MessageActions.tsx:18-21](src/components/chat/MessageActions.tsx)
- **根因**: 
  - 数据源 A: `message.isPinned` (API 返回的字段)
  - 数据源 B: `pinnedMessageIds: string[]` (zustand store)
  - 蓝色左边框 读 B，书签图标 读 A，右键菜单 读 A，悬停 Pin 按钮 读 B
- **后果**:
  - 通过悬停 Pin 按钮固定 → 蓝色边框出现，书签图标不出现
  - 通过右键菜单固定 → 书签图标出现，蓝色边框不出现
  - 两种操作路径结果不一致

#### P0-3b. ChatArea.handlePin/handleUnpin 不更新 zustand store

- **文件**: [ChatArea.tsx:74-94](src/components/layout/ChatArea.tsx)
- **根因**: 调了 API + invalidateQueries，但没有调 `addPinnedMessage(msgId)` / `removePinnedMessage(msgId)`
- **后果**: 右键菜单 Pin/Unpin 后，zustand 的 `pinnedMessageIds` 不同步，MessageActions 的 Pin 按钮状态错误

#### P0-3c. PinnedMessages 和 PinManager 是死代码

- **文件**: [PinnedMessages.tsx](src/components/chat/PinnedMessages.tsx) + [PinManager.tsx](src/components/chat/PinManager.tsx)
- **根因**: 两个组件都未被任何其他文件 import 或渲染。ChatHeader 中没有 Pin 入口，ChatArea 中没有集成。
- **后果**: 写了 200+ 行代码的 Pin 消息列表面板从未被用户看到过

#### P0-3d. scrollToMessageId 被移除，跳转到 Pin 消息彻底不可用

- **文件**: 当前 git diff 从 [MessageList.tsx](src/components/chat/MessageList.tsx) 移除了整个 `scrollToMessageId` 相关的 useEffect 和 prop 传递链
- **根因**: diff 中删除了 `scrollToMsgId` state、`handleJumpToMessage` 回调、`flashTimerRef` 动画
- **替代方案不存在**: MessageList 监听的 `scroll-to-message` 自定义事件无人触发

#### P0-3e. ChatHeader 完全缺失 Pin 入口

- **文件**: [ChatHeader.tsx](src/components/chat/ChatHeader.tsx)
- **根因**: 组件没有"已固定 (N)"按钮或任何 Pin 相关 UI，之前的 `onPinChanged` / `onJumpToMessage` props 已从接口中移除

#### P0-3f. Pin 数据字段命名不一致

- **文件**: [types/chat.ts:375-382](src/types/chat.ts) vs [types/api.ts](src/types/api.ts)
- **根因**: `PinInfo` 用 snake_case (`message_id`、`content_preview`)，`PinnedMessage` 用 camelCase (`messageId`、`contentPreview`)。两个组件的字段访问不一致，API 类型用 `Record<string, any>` 无类型保护。

---

### P0-4. PreviewCard 渲染有严重缺陷

- **文件**: [PreviewCard.tsx](src/components/cards/PreviewCard.tsx)
- **问题**:
  1. iframe sandbox 只有 `allow-scripts`，没有安全策略（应至少 `allow-same-origin` 用于可信源）
  2. 没有 loading 状态 — iframe 加载慢时用户看到白屏
  3. 错误处理后只显示"预览不可用"文字，无重试按钮
  4. `IframeEl` 定义为组件内函数（非 memo），每次渲染都是新组件实例，iframe 会被销毁重建
  5. 全屏 Modal 中的 iframe 与内联卡片中的 iframe 是两个独立实例

---

### P0-5. FileCard 在 mock 模式下依赖 fileUrl 字段但 mock 数据不提供

- **文件**: [FileCard.tsx](src/components/cards/FileCard.tsx) + [mocks/sse.ts](src/mocks/sse.ts)
- **根因**: FileCard 需要 `fileUrl` 或 `code` 才能显示下载按钮（第 91 行），但 mock SSE 从不生成 file 类型的 artifact
- **后果**: 如果通过 renderFallbackCards 也没有 file 类型的 fallback（只有 diff 和 link_preview），FileCard 在 mock 模式下完全不可见

---

### P0-6. 附件上传流程产生重复条目

- **文件**: [ChatInput.tsx:276-292](src/components/chat/ChatInput.tsx)
- **根因**: `uploadFile()` 先添加一个 `fileId: ""` 的临时附件（第 280-283 行），上传成功后再添加一个 `fileId: d.id` 的附件（第 288 行），**没有移除旧的**。
- **后果**: 
  - pendingAttachments 中每个上传成功的文件有 2 条记录
  - `handleSend` 过滤 `fileId` 非空的（第 159 行），所以只发送完成的 — 功能"碰巧"正常
  - 但临时附件永远残留在 store，内存泄漏

---

### P0-7. DocumentCard 是空壳实现

- **文件**: [DocumentCard.tsx](src/components/cards/DocumentCard.tsx)
- **根因**: 
  - `react-pdf` **未安装**（package.json 中无此依赖）
  - PDF 使用原生 `<iframe>` 而非 `react-pdf`（无翻页、缩放等交互）
  - docx 和 xlsx 显示 `<Empty>` 占位符，尽管 `mammoth` 和 `xlsx` 已安装但未集成
  - `loading` 状态仅靠 600ms 的 `setTimeout`，不做真正的文件加载检测

---

## P1 — 体验严重受损

### P1-1. renderFallbackCards 在流式消息时不执行

- **文件**: [MessageList.tsx:343](src/components/chat/MessageList.tsx)
- **根因**: `{message.status === "done" && renderFallbackCards(...)}` — streaming 状态时 fallback 卡片不可见
- **后果**: 用户在 Agent 输出流式内容时看不到任何卡片，直到 `message_end` 后才忽然弹出

---

### P1-2. DiffCard 的 Monaco DiffEditor 在暗色模式切换时不同步

- **文件**: [DiffCard.tsx:55](src/components/cards/DiffCard.tsx)
- **根因**: `isDark` 从 `document.documentElement.getAttribute("theme-mode")` 直接读 DOM 属性，不是 React state，主题切换时不触发重渲染
- **后果**: 暗色模式切换后 DiffEditor 主题不更新，需手动触发其他 state 变化

---

### P1-3. 群聊模式消息去重逻辑有缺陷

- **文件**: [MessageList.tsx:19-25](src/components/chat/MessageList.tsx) `cleanContent()`
- **根因**: `cleanContent` 通过正则 `/\{\s*"subtasks?"/` 截断 orchestrator 消息，但 JSON 格式可能包含换行和空格变体
- **后果**: 当后端返回格式稍有变化时，JSON 原文会直接暴露在用户界面上

---

### P1-4. 群聊执行计划发送后 plannerAgentId 未重置

- **文件**: [ChatArea.tsx:232-234](src/components/layout/ChatArea.tsx)
- **根因**: `setPlannerAgentId(null)` 在 `useEffect([activeId])` 中执行（第 234 行），但如果用户在同一次对话中先发送普通消息再发送执行计划，plannerAgentId 可能不是最新值
- **后果**: 第二次执行计划可能使用上次选择的 planner

---

### P1-5. 消息右键菜单仅在非用户消息上触发

- **文件**: [MessageList.tsx:204](src/components/chat/MessageList.tsx)
- **根因**: `onContextMenu` 条件 `if (onPin && onUnpin && !isUser)` 阻止用户消息出现右键菜单
- **后果**: 用户的自己的消息无法 Pin（可能是故意的，但交互不一致）

### P1-6. LinkPreviewCard 对无效 URL 静默失败

- **文件**: [LinkPreviewCard.tsx:11-14](src/components/cards/LinkPreviewCard.tsx)
- **根因**: `getHostname()` 在 URL 解析失败时返回空字符串 `""`（当前 diff 中的修复），但卡片仍正常渲染 — 仅显示 URL 文本，无任何预览信息
- **后果**: 坏了但不报错，用户不知道是链接本身有问题还是预览功能坏了

### P1-7. MarkdownBubble 的 sanitizeMarkdown 可能过度清洗

- **文件**: [MarkdownBubble.tsx:103-113](src/components/chat/MarkdownBubble.tsx)（当前 diff 新增）
- **根因**: `sanitizeMarkdown()` 移除所有 `<artifact>` XML 标签（后端 artifact_format.py 的产物格式），并移除所有事件处理器
- **问题**: `<artifact>` 标签在后端通过 `detect_artifacts()` 解析后本应在 token 流中已被移除（后端在 message_end 前从文本中提取）。但如果后端遗漏，sanitize 是最后防线。但 `EVENT_ATTR_RE` 正则太宽泛，可能匹配到代码块内的属性字符串

### P1-8. 流式断连重连时 artifacts 重复追加

- **文件**: [ChatArea.tsx:276-278](src/components/layout/ChatArea.tsx) onArtifact 回调
- **根因**: 重连时新建 SSE，backend 可能重新发送已接收的 artifact。前端没有去重逻辑（与 token 不同，token 只在 append 时操作字符串，artifact 直接 push 到数组）
- **后果**: 重连后同一卡片出现多次

---

## P2 — 代码质量/技术债

### P2-1. 所有卡片组件使用 `as unknown as` 双重类型断言

- **文件**: CodeCard / DiffCard / PreviewCard / FileCard / DeployStatusCard / DocumentCard / LinkPreviewCard
- **根因**: `Artifact.content` 定义为 `Record<string, unknown>`，每个卡片组件都做 `artifact.content as unknown as XxxContent`
- **风险**: 运行时 content 字段不匹配时无类型保护，直接渲染导致白屏或崩溃

### P2-2. artifacts 渲染使用数组 index 作 key

- **文件**: [MessageList.tsx:342](src/components/chat/MessageList.tsx)
- **根因**: `message.artifacts.map((a) => <CardRenderer key={a.id} artifact={a} />)` — 实际上用了 `a.id` 这是对的
- **但实际上**: `renderFallbackCards()` 生成的是 `fallback-diff-0` 这种递增 key，在同一个消息有多个 fallback 卡片时 key 正确

### P2-3. ConflictResolver 触发路径不完整

- **文件**: [ConflictResolver.tsx](src/components/cards/ConflictResolver.tsx) + [DiffCard.tsx:42-46](src/components/cards/DiffCard.tsx)
- **根因**: ConflictResolver 仅在 DiffCard 的 `handleSave` 收到 HTTP 409 时触发。但前端 Mock 模式下从不触发 409（mock handler 中没有 apply-diff 端点）。`conflict_detected` SSE 事件的定义存在但有 callback 注册，mock SSE 不发送。
- **后果**: 冲突解决功能无法在 Mock 模式下验证

### P2-4. 暗色模式 CSS 变量仍然不完整

- **文件**: [App.tsx](src/App.tsx) + 全局 CSS
- **根因**: 多处内联样式使用硬编码颜色（如 `"#fff"` 作背景、`"rgba(0,0,0,0.5)"` 作叠加），在暗色模式下表现异常

### P2-5. 代码块内 `artifact` XML 标签会在前端裸展示

- **文件**: [MarkdownBubble.tsx](src/components/chat/MarkdownBubble.tsx)（当前 diff 新增的 sanitizeMarkdown）
- **但根因在后端**: `detect_artifacts()` 解析完 artifact 后，原始 XML 标签文本仍保留在消息 content 中。sanitizeMarkdown 是前端兜底方案，但可能漏掉自闭合标签 `<artifact type="file" ... />`（当前 diff 中只匹配了有/无 body 的两种情况，但正则可能会有边界问题）
- **注**: 当前 diff 的 sanitize 逻辑中，第 102 行正则 `/<artifact\b[^>]*\/>/gi` 匹配自闭合，第 103 行正则匹配有 body 的，但是用 `replace` 而非 `replaceAll` 可能丢失多次出现（需要确认是否有 `gi` flag — 有，所以 OK）

---

## 汇总表

| Bug # | 级别 | 分类 | 功能 | 一句话 |
|-------|------|------|------|--------|
| P0-1 | P0 | 数据流 | Mock SSE | 只生成 code/deploy_status artifact，diff/preview/file 卡片 Mock 不可达 |
| P0-2 | P0 | 渲染 | Diff 卡片 | 完全依赖 markdown 文本正则解析，脆弱且仅 done 态触发 |
| P0-3a | P0 | 数据流 | Pin 消息 | message.isPinned vs pinnedIds 双数据源，UI 状态自相矛盾 |
| P0-3b | P0 | 数据流 | Pin 消息 | ChatArea.handlePin 不更新 zustand store |
| P0-3c | P0 | 架构 | Pin 消息 | PinnedMessages/PinManager 是死代码，从未被集成 |
| P0-3d | P0 | 功能 | Pin 消息 | scrollToMessageId 被移除，跳转到 Pin 消息功能归零 |
| P0-3e | P0 | 架构 | Pin 消息 | ChatHeader 缺失 Pin 入口 UI |
| P0-3f | P0 | 数据 | Pin 消息 | snake_case vs camelCase 字段命名不一致 |
| P0-4 | P0 | 渲染 | Preview 卡片 | 无 loading 态、iframe 每次渲染重建、错误处理简陋 |
| P0-5 | P0 | 数据流 | File 卡片 | Mock 模式无数据源，卡片完全不可见 |
| P0-6 | P0 | 数据流 | 附件上传 | 上传后 pendingAttachments 重复条目，临时附件残留 |
| P0-7 | P0 | 实现 | Document 卡片 | react-pdf 未安装，mammoth/xlsx 未集成，纯空壳 |
| P1-1 | P1 | 渲染 | 所有卡片 | fallback 卡片仅在 done 态触发，流式时不显示 |
| P1-2 | P1 | UI | Diff 卡片 | 暗色模式切换时 Monaco 主题不更新 |
| P1-3 | P1 | 数据 | 群聊消息 | cleanContent JSON 截断正则不够鲁棒 |
| P1-4 | P1 | 数据流 | 群聊执行 | plannerAgentId 跨消息残留 |
| P1-5 | P1 | 交互 | 消息操作 | 用户消息无法右键 Pin（设计意图 or Bug？） |
| P1-6 | P1 | UI | Link Preview | 无效 URL 静默失败无提示 |
| P1-7 | P1 | 安全 | Markdown | sanitizeMarkdown 正则可能影响代码块内内容 |
| P1-8 | P1 | 数据流 | SSE 重连 | artifacts 重连后重复追加无去重 |
| P2-1 | P2 | 质量 | 所有卡片 | `as unknown as` 双重类型断言遍布 7 个组件 |
| P2-2 | P2 | 质量 | 冲突解决 | ConflictResolver 在 Mock 模式下完全不可验证 |
| P2-3 | P2 | 质量 | CSS | 硬编码颜色值未适配暗色模式 |
| P2-4 | P2 | 质量 | Markdown | 后端 artifact XML 标签残留最终靠前端 sanitize 兜底 |

---

## 关于"功能完整"的结论

**文档声称"P1 体验完整度全部完成、P2 差异化亮点全部完成"，经代码级审计，实际情况如下：**

| 功能 | 文档声称 | 实际状态 |
|------|---------|---------|
| Diff 卡片 | 完成 | Mock 模式不生成 diff artifact，仅靠脆弱正则回退方案，功能覆盖率 <30% |
| Preview 卡片 | 完成 | 组件存在但 iframe 实现简陋，Mock 下无数据源 |
| File 卡片 | 完成 | 组件存在但 Mock 下无数据源，从未在 Mock 环境被渲染过 |
| Document 卡片 | 完成 | 空壳实现 — 依赖库未安装，docx/xlsx 渲染未集成 |
| Link Preview 卡片 | 完成 | 仅靠文本中 URL 正则提取，无 OG 元数据 Mock |
| Pin 消息 | 完成 | **全链路断裂** — 双数据源冲突、面板死代码、跳转功能已删除 |
| 附件上传 | 完成 | 基础流程可用但有重复条目 bug，message 渲染可用 |
| 群聊 Orchestrator | 骨架完成 | 计划卡片可渲染，但 plannerAgentId 残留、cleanContent 正则脆弱 |
| ArtifactWorkbench | 完成 | 可用但仅展示 Message.artifacts（不含 fallback 卡片） |

---

## 建议修复优先级

**第 1 轮（1 天）— 让 Mock 模式下卡片可验证**:
1. P0-1: Mock SSE 补全 diff/preview/file/link_preview artifact 生成
2. P0-2: renderFallbackCards 增加 streaming 状态支持

**第 2 轮（1 天）— 修 Pin**:
3. P0-3a/b: 统一 pinnedMessageIds 为唯一数据源，ChatArea.handlePin 同步更新 store
4. P0-3c/d/e: 集成 PinnedMessages 到 ChatHeader，恢复消息跳转功能
5. P0-3f: 统一 PinInfo/PinnedMessage 字段命名

**第 3 轮（1.5 天）— 修卡片功能**:
6. P0-4: PreviewCard 加 loading 和错误重试
7. P0-5: Mock 数据中补 file artifact
8. P0-7: DocumentCard 集成 mammoth/xlsx，安装 react-pdf
9. P0-6: 附件上传去重

**第 4 轮（1 天）— 体验打磨**:
10. P1-1 ~ P1-8: 流式卡片显示、暗色 Monaco 同步、cleanContent 正则优化、artifact 去重
