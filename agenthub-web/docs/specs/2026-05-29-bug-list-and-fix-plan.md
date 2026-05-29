# Bug 清单与修复计划

代码审查日期：2026-05-29

---

## P0 — 严重 Bug（影响功能可用性）

### B1. 图片粘贴到输入框后发送时丢失

- **文件**: `src/components/chat/ChatInput.tsx:258-344`
- **现象**: 用户可以粘贴/拖入图片，在 contentEditable 中以 `<img src="data:...">` 展示，但 `handleSend` 调用 `getPlainText()` 提取纯文本，图片 base64 数据被丢弃
- **根因**: contentEditable 支持富内容插入，但发送链路将内容简化为纯文本
- **修复方案**:
  1. 从 contentEditable 中提取 `<img>` 元素的 src 数据
  2. 将图片作为消息的附件字段（需扩展 `SendMessageRequest` 类型）
  3. 或暂时禁用图片粘贴功能，仅保留纯文本输入

### B2. SSE 断连后流式内容被清零

- **文件**: `src/components/layout/ChatArea.tsx:255-289`
- **现象**: 重连时调用 `finalizeStreaming` 清除流式状态 → 发起新 SSE 请求，用户已生成的半屏内容消失
- **根因**: 重连逻辑没有保留已接收的流式内容，`streamMsgIdRef` 被重置
- **修复方案**: 重连时不清除已有内容，在新 SSE `onMessageStart` 中覆盖 `streamingContent`，或在 `finalizeStreaming` 前将已生成文本写入消息缓存

### B3. Mock SSE 中 subtask_id 每个事件都新建

- **文件**: `src/mocks/sse.ts:155-215`
- **现象**: 群聊模式下每个 Agent 的 4 个状态事件 (queued → running → running → success) 各自生成不同 subtask_id
- **根因**: 每个 `setTimeout` 回调中独立调用 `generateId()`
- **修复方案**: 在 forEach 循环开始处为每个 Agent 预生成固定的 `subtaskId`，4 个事件共用

### B4. Enter 发送与中文输入法冲突

- **文件**: `src/components/chat/ChatInput.tsx:224-227`
- **现象**: 中文输入法选词过程中按 Enter 会直接发送消息
- **根因**: `keyDown` 事件未处理 `compositionstart` / `compositionend` 状态
- **修复方案**: 新增 `isComposing` ref，在 `compositionstart` 设为 true，`compositionend` 设为 false，`handleKeyDown` 中 `isComposing` 为 true 时跳过 Enter 发送

---

## P1 — 体验 Bug（影响使用感受）

### B5. MarkdownBubble components 对象每次渲染重新创建

- **文件**: `src/components/chat/MarkdownBubble.tsx:8-88`
- **现象**: `components` 在组件函数体内定义，每次渲染都是新引用，导致 `ReactMarkdown` 在 `useMemo([text])` 下仍强制重渲染
- **修复方案**: 将 `components` 对象提取到组件外部（文件顶层），作为模块级常量

### B6. highlightText 拼接 HTML 破坏 Markdown 结构

- **文件**: `src/components/chat/MessageList.tsx:299-302`
- **现象**: `highlightText` 返回带 `<mark>` 标签的 HTML 字符串，当搜索词命中 Markdown 语法字符时（如 `**`），会破坏 markdown 解析边界
- **修复方案**: 在 Markdown 渲染完成后在 DOM 层做高亮，而非在原始文本中插入 HTML。或使用 react-markdown 的 custom renderer 在渲染时标记匹配文本

### B7. 暗色模式下 CSS 变量不完整

- **文件**: `src/App.tsx`
- **现象**: 只定义了 `lightColors`，暗色模式使用 Semi UI 默认值，与本项目的 `--color-bg-*` 系列 token 冲突
- **修复方案**: 参照 `lightColors` 结构补全 `darkColors` 对象，确保 `--semi-color-bg-0` 到 `bg-4`、`--semi-color-fill-0` 等关键变量在暗色下有合理值

### B8. 流式完成后切换会话，输入框不自动聚焦

- **文件**: `src/components/chat/ChatInput.tsx:153-156`
- **现象**: `useEffect` 仅在 `disabled` 从 true 变 false 时聚焦。若 disabled 始终为 false 时切换会话，焦点可能未回到输入框
- **修复方案**: 增加对 `key` 属性的依赖——`ChatInput` 已通过 `key={activeId}` 重新挂载，验证该机制在所有场景下生效

### B9. cursor 分页 hasMore 有 off-by-one 隐患

- **文件**: `src/mocks/handlers.ts:111-121`
- **现象**: `hasMore = msgs.length > limit` 使用的是 filter 后的数组长度，但 `items = msgs.slice(0, limit)` 也是在 filter 之后。当过滤后恰好有 limit 条数据时，hasMore 为 false
- **修复方案**: 先判断 `msgs.length > limit`，再 slice。然而当前逻辑的意图是"过滤后按 cursor 截断"，应改为：全部数据按 cursor 过滤 → 排序 → 取前 limit+1 条 → 若实际取到 limit+1 条则 hasMore=true，返回前 limit 条

### B10. retryRef.count 与 zustand retryCount 双源追踪

- **文件**: `src/components/layout/ChatArea.tsx:39,259`
- **现象**: `retryRef.current.count`（闭包 ref）和 `retryCount`（zustand store）各自独立维护，极端情况下 UI 显示"重连(1/3)"但实际已是第 3 次
- **修复方案**: 去掉 ref，统一用 zustand store 管理重试计数；或去掉 store 中的 retryCount，通过回调更新 store

---

## P2 — 代码质量（技术债）

### B11. 卡片组件大量 `as unknown as` 类型断言

- **文件**: `src/components/cards/CodeCard.tsx:13`、`DiffCard.tsx:11`、`PreviewCard.tsx:11`、`FileCard.tsx:11`、`DeployStatusCard.tsx:10`
- **现象**: 每个卡片组件都做 `artifact.content as unknown as XxxContent`
- **修复方案**: 在 `Artifact` 类型上使用泛型或 discriminated union，使 `artifactType` 能推断 `content` 的具体类型

### B12. 无前端测试

- **现象**: `package.json` 无 test 脚本，0 个测试文件
- **修复方案**: 添加 vitest + @testing-library/react，优先覆盖关键链路：mentionParser、chatStore、messageApi mock、SSE 解析

### B13. `shouldFail` 读取后立即删除 localStorage 导致状态不可复现

- **文件**: `src/mocks/handlers.ts:19-24`
- **现象**: `shouldFail` 调用后删除 `mock_fail_mode`，React Query retry 导致第二次调用返回 null
- **修复方案**: 用 sessionStorage 替代，或添加计数器控制失败次数

---

## 修复执行顺序

```
第1轮 (B1-B4, P0-Bug):
  1. B4  输入法冲突         ← 一行改动，影响最大
  2. B3  subtask_id 重复    ← Mock 数据修复
  3. B2  断连内容清零       ← 体验关键
  4. B1  图片发送丢失       ← 需要类型扩展

第2轮 (B5-B10, P1-Bug):
  5. B5  components 重构    ← 性能优化
  6. B10 重试计数统一       ← 稳定性
  7. B7  暗色变量补全       ← UI 一致性
  8. B9  分页逻辑修正       ← 数据正确性
  9. B6  highlight 修复     ← 搜索体验
  10. B8  输入框聚焦        ← 小修复

第3轮 (B11-B13, P2-技术债):
  11. B11 类型重构          ← 类型安全
  12. B13 shouldFail 修复   ← Mock 稳定性
  13. B12 测试引入          ← 长期保障
```
