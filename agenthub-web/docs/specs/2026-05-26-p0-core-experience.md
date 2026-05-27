# P0 — 核心体验链路 Spec

日期：2026-05-26 | 状态：已确认

---

## 模块 1：Markdown 渲染 + 代码高亮

**技术方案：** 方案 B（全功能）
- `react-markdown` + `remark-gfm`（表格/删除线/任务列表）
- `rehype-raw`（支持 HTML 内联）
- `shiki`（VS Code 同款语法高亮引擎，主题丰富、行号、Diff 高亮）

**改造方式：**
- 替换 `TextBubble` 为 react-markdown 组件，嵌入消息气泡内
- 自定义 `components` 把 `code` 映射到增强版 `CodeCard`，保持卡片注册表模式
- `CodeCard` 从纯 `<pre><code>` 升级为 shiki 高亮 + 语言标签 + 一键复制

**变更清单：**
- 新增 `react-markdown` `remark-gfm` `rehype-raw` `shiki` 依赖
- 修改 `MessageList.tsx` — 替换 TextBubble
- 重写 `CodeCard.tsx` — shiki 高亮
- 消息气泡样式适配 Markdown 排版

---

## 模块 2：消息列表自动滚底

**方案：** 阈值判断 + 浮动按钮 + 未读计数徽标

**三个场景：**
1. 用户在底部 → 新消息自动 `scrollIntoView`（离底部 < 100px 时）
2. 用户在上方查看历史 → 不打扰，右下角浮现"↓"按钮（带未读消息计数）
3. 用户手动滚回底部 → IntersectionObserver 监听 sentinel，按钮消失，恢复自动滚

**变更清单：**
- 修改 `MessageList.tsx` — 添加 scroll 逻辑 + sentinel + 浮动按钮

---

## 模块 3：消息时间戳

**方案：** 分组显示（IM 行业标准）

**规则：**
- 相邻消息时间差 < 5 分钟时不重复显示
- 超过 5 分钟插入时间分隔条
- 每条消息 hover 时 tooltip 显示精确到秒
- 当天的显示 "HH:mm"，昨天的显示 "昨天 HH:mm"，本周的显示 "周X HH:mm"，更早的显示 "MM-DD HH:mm"

**变更清单：**
- 修改 `MessageList.tsx` — 时间分组逻辑 + 分隔条组件 + hover tooltip
- 新增 `src/lib/formatTime.ts` — 时间格式化工具函数

---

## 模块 4：全局 Toast 通知

**方案：** `sonner` + 乐观撤销

**覆盖场景：**

| 类别 | 类型 | 行为 |
|------|------|------|
| 消息发送失败 | `toast.error` + 重试按钮 | 点击重试重新发送 |
| SSE 连接断开 | `toast.error` + "正在重连..." | 可关闭 |
| SSE 重连失败 | `toast.error` persistent | 手动重新连接 |
| Agent 创建成功/失败 | `toast.success` / `toast.error` | 3秒消失 |
| 会话删除 | `toast.success` + 撤销按钮 | 乐观恢复，5秒 |

**改造清单：**
- 安装 `sonner`，在 `App.tsx` 添加 `<Toaster />`
- 修改 `ChatArea.tsx` — 发送失败 + SSE 断连 toast
- 修改 `CreateAgentModal.tsx` — 创建成功/失败 toast
- 修改 `Sidebar.tsx` — 删除会话 + 乐观撤销 toast
- 消息重发逻辑：在 toast action 中重新调用 `messageApi.send()`

---

## 模块 5：Mock 新对话可用

**方案：** 模板生成回复（场景 A 级别）

**逻辑：**
1. `mocks/handlers.ts`：拦截 `POST /messages`，缓存 `{ convId → userMessage }`
2. `mocks/sse.ts`：未命中预设数据时，读缓存生成模板回复
3. 模板包含完整 SSE 事件序列：`message_start → token → message_end`
4. 模板引用用户输入内容，让评审看到 Agent 理解消息

**变更清单：**
- 修改 `mocks/handlers.ts` — 添加消息缓存
- 修改 `mocks/sse.ts` — 添加模板生成逻辑
- 不改 UI 组件

---

## 模块 6：SSE 断连 UI 反馈

**发现：** 重试逻辑从未实现，需要从零构建

**重试逻辑（ChatArea.tsx）：**
- `onConnectionError` 触发指数退避重试：1s → 2s → 4s，最多 3 次
- 每次重试重新调用 `createSSEStream`
- 3 次耗尽后停止，等待用户手动重连

**状态管理（chatStore 新增字段）：**
```
connectionStatus: 'connected' | 'reconnecting' | 'failed'
retryCount: number
```

**Banner UI（ChatArea.tsx 顶部）：**
- 断连中：黄色 `⚠ 连接已断开，正在重连... (1/3)`
- 恢复：绿色 `✓ 已恢复连接`，1.5s 后自动消失
- 失败：红色 `✕ 连接失败` + [手动重连] 按钮 + [✕] 关闭

**中断处理：**
- 流式消息被中断 → 消息标 `error` 状态 + 末尾追加"（响应中断）"
- chatStore 的 streamingContent 保留不丢

**变更清单：**
- 修改 `chatStore.ts` — 新增 connectionStatus / retryCount / 相关 action
- 修改 `ChatArea.tsx` — 重试逻辑 + Banner 渲染 + 中断标记
- 修改 `sse.ts` — 无需改动（重试由 ChatArea 层负责）

---

## 依赖安装汇总

```bash
npm install react-markdown remark-gfm rehype-raw shiki sonner
```
