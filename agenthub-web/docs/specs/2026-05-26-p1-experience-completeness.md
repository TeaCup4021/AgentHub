# P1 — 体验完整度 Spec

日期：2026-05-26 | 状态：已确认

---

## 模块 7：暗色模式

**方案：** Tailwind `darkMode: 'class'` + 全组件适配

**主题三态：**
```typescript
type Theme = 'light' | 'dark' | 'system';
```
存 localStorage。system 模式通过 `matchMedia('(prefers-color-scheme: dark)')` 初始化。

**实现原理：**
1. `tailwind.config.js` 设 `darkMode: 'class'`
2. `<html class="dark">` 切换全局暗色模式
3. 所有组件样式层加 `dark:` 前缀的对应色值
4. 监听 `prefers-color-scheme` change 事件，system 模式自动跟随

**适配范围（11 个组件文件）：**
- 布局层：`Sidebar`（sidebar-bg/hover/active）、`ChatArea`（chat-bg）、`AppLayout`
- 聊天气泡：`MessageList`（chat-bubble-user/agent）
- 卡片层：`CodeCard`（bg 从 gray-900 调为 `[#1e1e1e]`）、`DiffCard`、`PreviewCard`、`FileCard`、`DeployStatusCard`
- 输入：`ChatInput`
- 模态框：`CreateAgentModal`、`SettingsPage`
- 标题栏：`ChatHeader`

**变更清单：**
- 修改 `tailwind.config.js` — 设 `darkMode: 'class'`
- 修改 `uiStore.ts` — theme 改为三态
- 修改 `AppLayout.tsx` — 挂载时读取 theme + 设置 class
- 修改 11 个组件文件（约 150+ 处 `dark:` 样式）

---

## 模块 8：代码块增强

**方案：** shiki 高亮 + GitHub Gist 风格外壳

**功能清单：**
- 文件名 bar（从 artifact.title / content.fileName 取）
- 语言标签（右上角，如 `TSX`）
- 行号（shiki transformer `@shikijs/transformers` 的 `transformerLineNumbers`）
- 一键复制 → `toast.success("已复制")` 对接 sonner
- 代码折叠（超过 30 行自动折叠，点击展开）

**实现原理：**
shiki 异步渲染，`useEffect` 中调 `codeToHtml(code, { lang, theme, transformers })`，`dangerouslySetInnerHTML` 挂载。主题用 `dark-plus`（VS Code Dark+ 配色）。

折叠通过 CSS `max-height` + `overflow: hidden`，展开按钮覆盖渐变遮罩在底部。

**变更清单：**
- 重写 `CodeCard.tsx` — shiki 渲染 + 行号 + 折叠 + 复制对接 sonner
- 安装 `@shikijs/transformers`

---

## 模块 9：Agent 管理完整化

**方案：** Agent 管理中心模态框 + 详情面板

**交互流：**
1. Sidebar 底部新增"管理 Agent"按钮
2. 点击弹出 `AgentManageModal`（卡片网格 + 搜索）
3. 点击卡片 → 右侧滑出 `AgentDetailPanel`
4. 编辑 → `CreateAgentModal` 复用为编辑模式
5. 删除 → 确认对话框 → toast + 乐观移除

**实现原理：**
- `AgentManageModal`：Grid 布局 + `useAgents()` 数据源 + 本地搜索状态过滤
- `AgentDetailPanel`：CSS `transition` 从右滑入，固定宽度面板
- 编辑复用：`CreateAgentModal` 加 `initialData?: Agent` prop → `useUpdateAgent` mutation
- 删除：`useDeleteAgent` 用 `useMutation` + `onMutate` 乐观移除 card

**变更清单：**
- 新增 `AgentManageModal.tsx` — 卡片网格 + 搜索
- 新增 `AgentDetailPanel.tsx` — 滑出详情面板
- 修改 `CreateAgentModal.tsx` — 支持编辑模式
- 修改 `useAgents.ts` — 补充 `useDeleteAgent` hook
- 修改 `Sidebar.tsx` — 加入口按钮

---

## 模块 10：消息操作

**方案：** hover 出现操作栏

**三个操作：**
| 操作 | 行为 | 实现 |
|------|------|------|
| 复制文本 | 复制消息纯文本到剪贴板 | `navigator.clipboard.writeText` + toast |
| 引用回复 | 输入框插入 `> 原文\n` | chatStore 暂存引用文本，ChatInput 读取后插入 |
| 重新生成 | 调 API 重新建立 SSE 流 | `messageApi.regenerate()`（已有）+ SSE 连接 |

**规则：** 流式消息不显示操作栏；失败消息只显示"重新生成"

**实现原理：**
CSS `opacity-0 group-hover:opacity-100` 控制操作栏显示。消息气泡外层 `group` class，操作栏在气泡下方绝对定位。

**变更清单：**
- 新增 `MessageActions.tsx` — 操作栏组件
- 修改 `MessageList.tsx` — `MessageBubble` 集成操作栏

---

## 模块 11：会话功能补全

### 11.1 会话内搜索

**原理：** 纯前端过滤。关键词存在 chatStore 的 `searchQuery` 字段（复用），匹配已加载的 messages。

**关键词高亮方案：** 预处理 markdown 源码，将关键词替换为 `<hl>关键词</hl>` 自定义标记，react-markdown `components` 注册 `<hl>` → `<mark>` 标签。跳转时 `document.querySelector('mark')` 第 N 个匹配项 `scrollIntoView`。

### 11.2 批量操作

**原理：** Sidebar 加 `batchMode` 本地状态。进入批量模式后每个会话项前置 checkbox，底部浮现批量操作栏（归档/删除）。Esc 退出批量模式。

### 11.3 会话导出

**原理：** 从 React Query 缓存读取消息列表，转换为 Markdown 纯文本。`Blob` + `URL.createObjectURL` + `<a download>` 触发浏览器下载。

**变更清单：**
- 新增 `ConversationSearch.tsx` — 搜索栏 + 高亮逻辑
- 修改 `Sidebar.tsx` — 批量选择模式 + 右键菜单加导出
- 新增 `src/lib/exportConversation.ts` — Markdown 生成 + 下载

---

## 模块 12：空状态 & 加载态

### 12.1 加载骨架屏

**原理：** `animate-pulse bg-gray-200 rounded` Tailwind 原生实现。3 条灰色脉冲条模拟标题 + 副标题。

### 12.2 空状态

**原理：** CSS/SVG 简单插画 + 引导文案。会话列表空状态提示"创建第一个对话"，消息列表空状态加"快捷提示"（conversation starters）点一下填入输入框。

### 12.3 错误状态

**原理：** React Query 的 `isError` 状态渲染。列表加载失败显示重试按钮 + 错误信息。

**变更清单：**
- 新增 `Skeleton.tsx` — 骨架屏通用组件
- 修改 `Sidebar.tsx` — 加载态 + 空状态
- 修改 `MessageList.tsx` — 空状态 + 快捷提示 + error
- 修改 `AppLayout.tsx` — error state

---

## 模块 13：响应式基础

**方案：** 三段式布局 + 拖拽分隔线

**拖拽原理：** `mousedown → mousemove → mouseup` 三部曲。分隔线元素 `mousedown` 注册全局 `mousemove`（计算 delta，`uiStore.setSidebarWidth`）和 `mouseup`（清理事件，持久化到 localStorage）。宽度限定 200px-500px。

**媒体查询策略：**
- `<768px`：Sidebar 变固定覆盖抽屉（`fixed + translate + z-50`），聊天区全屏
- `768-1024px`：侧边栏 240px 固定
- `>1024px`：侧边栏可拖拽 200-500px

**变更清单：**
- 修改 `AppLayout.tsx` — 响应式布局 + 分隔线拖拽
- 修改 `Sidebar.tsx` — 移动端抽屉覆盖
- 新增 `useMediaQuery.ts` — 响应式断点 hook

---

## 模块 14：聊天输入增强

### 14.1 粘贴图片 + 拖拽文件

**粘贴原理：** `onPaste` 拦截 `clipboardData.items`，过滤 `type.startsWith("image/")`，`FileReader.readAsDataURL` 转 base64 → 创建 `<img src={base64}>` → `selection.getRangeAt(0).insertNode(img)` 插入 contentEditable 光标位置。

**拖拽原理：** `onDragOver` 阻止默认（防止浏览器打开文件）+ 蓝色提示框。`onDrop` 读取 `dataTransfer.files`，处理同粘贴逻辑。

**存储：** Mock 阶段 base64 data URL 内联。后端就绪后先调上传 API 拿 URL 再插入。消息发送时图像块序列化为 `[image:url]` 占位符。

### 14.2 高度自适应

**原理：** contentEditable 的 `scrollHeight` 随内容自然增长。MutationObserver 回调中重置 `style.height = "auto"` 让浏览器重算，再设 `style.height = Math.min(scrollHeight, 200) + "px"` 限制上限。

### 14.3 字数统计

**原理：** `textContent.length` 取纯文本字符数。右下角展示 `"1,234 / 8,000"`。超 80% 变黄色，超限变红并禁用发送。

**变更清单：**
- 修改 `ChatInput.tsx` — paste/drop/dragover + 自适应 + 字数统计

---

## 模块 15：Token 用量图表

**方案：** recharts — React 声明式图表库

### Store 改造

当前只有 `usageMap` 累计快照，无法画时间序列。新增事件数组：

```typescript
interface TokenEvent {
  timestamp: string;
  conversationId: string;
  conversationTitle: string;
  agentName: string;        // 新增字段
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}
```

### 三个图表

**折线图（面积图）：** 按天的 Token 消耗趋势。events 按 `timestamp.slice(0, 10)` 分组聚合 → `{ date, input, output }[]` → `<AreaChart>` 堆叠面积图。

**饼图：** 按 Agent 的 Token 分布。events 按 `agentName` 分组求和 → `<PieChart>`。

**柱状图：** 按会话的 Token Top 10 排名。从 `usageMap` 取 totalTokens 降序 → `<BarChart>`。

### recharts 基本用法

```typescript
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={200}>
  <AreaChart data={dailyData}>
    <XAxis dataKey="date" />
    <YAxis />
    <Tooltip />
    <Area dataKey="input" stackId="1" fill="#3b82f6" />
    <Area dataKey="output" stackId="1" fill="#10b981" />
  </AreaChart>
</ResponsiveContainer>
```

**变更清单：**
- 修改 `tokenUsageStore.ts` — 加 `events` + `agentName`
- 修改 `ChatArea.tsx` — 调用 addUsage 传入 agentName
- 新增 `src/components/settings/TokenCharts.tsx` — 三个图表
- 修改 `TokenUsagePanel.tsx` — 嵌入 TokenCharts
- 安装 `recharts`

---

## P1 依赖安装汇总

```bash
npm install recharts @shikijs/transformers
```
