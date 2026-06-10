# AgentHub-前端-Day01-P0核心体验链路

## 实施目标
打通前端核心消息体验全链路：Markdown渲染、自动滚底、时间戳、Toast通知、Mock新对话、SSE断连UI。使前端在无后端环境下可独立演示完整聊天交互。

## 计划实现功能

| 模块 | 说明 |
|------|------|
| M1 Markdown渲染 | react-markdown + shiki 语法高亮，替换纯文本气泡 |
| M2 自动滚底 | 新消息自动滚底，历史浏览不打扰，浮动回底按钮 |
| M3 时间戳 | IM行业标准5分钟分组 + hover精确时间 |
| M4 Toast通知 | sonner 覆盖发送失败/删除/Agent创建 |
| M5 Mock新对话 | 动态模板生成SSE回复，引用用户输入 |
| M6 SSE断连 | 指数退避重试 + 连接状态Banner |

---

## 1. 组件设计

### 新增组件

| 组件 | 路径 | 用途 |
|------|------|------|
| MarkdownBubble | `src/components/chat/MarkdownBubble.tsx` | react-markdown 封装，13种元素自定义样式 |
| HighlightedCode | `src/components/chat/HighlightedCode.tsx` | shiki v4 + JS引擎，17种语言，折叠+复制 |

### 改造组件

| 文件 | 改动 |
|------|------|
| `MessageList.tsx` | 替换TextBubble → MarkdownBubble，加自动滚底/时间戳/失败气泡 |
| `ChatArea.tsx` | Toast通知，SSE断连重试 + Banner UI |
| `Sidebar.tsx` | 乐观删除 + 失败回滚 |
| `CodeCard.tsx` | 委托 HighlightedCode，代码量缩减70% |
| `CreateAgentModal.tsx` | 创建成功/失败 Toast |
| `App.tsx` | 挂载 sonner Toaster |

---

## 2. Store 变更

| Store | 新增字段 |
|-------|---------|
| `chatStore.ts` | `connectionStatus`, `retryCount`, `interruptedMessageId` + 3个action |

---

## 3. Mock 变更

| 文件 | 改动 |
|------|------|
| `handlers.ts` | 导出 `getLastUserMessage`、`getMockAgents`；支持 `localStorage` 模拟失败 |
| `sse.ts` | 动态模板生成（新Agent无预设数据时）；`localStorage` 模拟SSE断连 |

---

## 4. 依赖变更

```bash
npm install react-markdown remark-gfm rehype-raw shiki sonner
```

---

## 5. 验证检查点

- [x] `npx tsc -b --noEmit` 零错误
- [x] Markdown 渲染：表格/列表/引用/代码块正确显示
- [x] shiki 高亮：代码块显示 dark-plus 主题，折叠/复制可用
- [x] 自动滚底：新消息平滑滚动，向上浏览时浮动按钮出现
- [x] 时间戳：5分钟分组，hover显示精确时间
- [x] Toast：发送失败/删除/Agent创建全部有通知
- [x] Mock模板：新Agent发消息有引用用户内容的回复
- [x] SSE断连：`localStorage.setItem("mock_fail_mode", "sse_disconnect")` 触发重试→失败Banner

---

## 6. 依赖与风险

- 后端 SSE 连接错误时需触发 `onConnectionError`（当前仅 mock 有，真实 fetch 已预留 `.catch` 路径）
- `finalizeStreaming` 后需要后端 `GET /messages` 返回包含中断标记的消息（当前 mock 已处理，真实后端待对齐）
