# AgentHub UI 体验升级计划

> 基于 Claude Code 源码 UI 模式分析，逐步提升 AgentHub 的交互与视觉体验。每步独立可验证，完成后复盘再进入下一步。

## 前置约束

- Color Token 体系：`agenthub-web/src/styles/tokens.css` 已定义完整 `--color-*` CSS 变量，改造全部使用这些变量，不引入 Tailwind 类名
- 每步完成后跑 `npx tsc -b --noEmit` 零错误 + `npx vitest run` 全通过 + dev server 手动验收
- 未经过设计稿审阅同意，不写代码

---

## Step 1: ThinkingBlock + ToolCallCard + Shimmer

**思路：照搬 Claude Code 的简洁风格，不做多余设计。**

### 设计稿

**ThinkingBlock 折叠态：**
```
∴ 推理中...  (点击展开)
```
- 一行，dimColor + italic，和 Claude Code 的 `∴ Thinking` 一致
- streaming 时自动展开；done 后默认折叠，可手动点击切换

**ThinkingBlock 展开态：**
```
∴ 推理中...
  搜索 useAuth 在 hooks 目录中...
  找到 3 个匹配文件...
  读取 useAuth.ts 内容...
  [收起]
```
- 灰色斜体文字，左边缩进 8px
- 每一步就是一行纯文本，不需要时间轴、彩色左边框
- 底部一个 `[收起]` 文字按钮

**ToolCallCard — 只在 running 时加 shimmer 条：**
```
┌──────────────────────────────────────────┐
│ ≡ grep "useAuth" src/hooks/              │
│ ░░░░░░░░ shimmer 条 ░░░░░░░░░░░░░░░░░░ │  ← 仅 running 时显示
│                             ● 执行中     │
└──────────────────────────────────────────┘
```
- 复用已有的 `skeleton-shimmer` CSS class
- 非 running 状态保持不变

### 涉及文件
- `src/components/chat/ThinkingBlock.tsx` — 简化重构
- `src/components/chat/ToolCallCard.tsx` — 加 shimmer 条
- `src/index.css` — shimmer keyframe 已有，确认可用

---

## Step 2: 对话列表拖拽 + 移动到项目

### 设计稿

**拖拽：从对话列表拖到左侧项目图标松手即移动。**

```
IconSidebar                    ConversationList
┌────┐   ┌─────────────────────────────┐
│ 💬 │   │ ┌── 前端重构 ──────────┐═══│  ← 拖拽中，半透明跟随
│    │   │ │ 2 分钟前              │═══│
│ 📁 │←──│─│───────────────────────│───│  ← 拖到项目图标高亮松手
│ A  │   │ └──────────────────────┘   │
│    │   │ ┌── 后端联调 ──────────┐   │
│ 📁 │   │ │ 1 小时前              │   │
│ B  │   │ └──────────────────────┘   │
└────┘   └─────────────────────────────┘
```
- 对话条目 `draggable=true`，拖拽时半透明跟随
- 左侧项目图标 `onDragOver` + `onDrop` 接收
- 拖到"全部项目"图标 → 清除项目归属
- 松手时 toast "已移至 项目X"

**右键菜单也保留"移动到项目"作为后备：**
```
┌──────────────┐
│ 📌 置顶      │
│ ✏️ 重命名    │
│ 📦 归档      │
│ 📤 导出      │
│ ──────────   │
│ 📁 移动到项目 ▸│  ← 子菜单弹出项目列表
│ 🗑️ 删除      │
└──────────────┘
```

### 涉及文件
- `src/components/layout/ConversationList.tsx` — 拖拽 + 右键菜单
- `src/components/layout/IconSidebar.tsx` — 接受 drop
- `src/lib/api.ts` — 新增 updateConversation（改 projectId）

---

## Step 3: 新建对话对话框改造

### 设计稿

```
┌──────────────────────────────────────────┐
│  新建对话                           [✕]  │
│                                          │
│  标题: [_____________________________]   │
│  模式:  [单聊] [群聊]                    │
│  项目:  [全部项目 ▾]                     │
│                                          │
│  🔍 [搜索 Agent...]                      │
│  ┌──────────────────────────────────┐    │
│  │ 🅰 前端开发               ✓     │    │  ← 卡片式，选中蓝色边框
│  │    Claude Sonnet · 5 个工具     │    │
│  └──────────────────────────────────┘    │
│  ┌──────────────────────────────────┐    │
│  │ 🅱 后端开发               ○     │    │
│  │    Claude Haiku · 3 个工具       │    │
│  └──────────────────────────────────┘    │
│                                          │
│  已选: [前端 ✕] [后端 ✕]                │
│                    [取消] [创建对话]      │
└──────────────────────────────────────────┘
```
- 宽度 448→560px，Agent 列表 maxH 192→340px
- Agent 行从 borderless button → 小卡片
- 增加项目下拉
- 底部已选 chips

### 涉及文件
- `src/components/layout/ConversationList.tsx` — 改 Modal 部分

---

## Step 4: Agent 管理弹窗优化

### 设计稿

```
┌─ Agent 管理 ─────────────────────────┐
│ 🔍 [搜索...]    [AI 辅助创建 💡]     │
│                                      │
│ ┌────────────────────────────────┐   │
│ │ 🤖 前端开发                    │   │
│ │    Claude Sonnet · anthropic   │   │
│ │            [编辑] [删除] [对话]│   │
│ └────────────────────────────────┘   │
│                                      │
│ ┌─ 编辑 ─────────────────────────┐   │  ← 点击编辑后原地展开
│ │ 名称: [____]  模型: [▾]       │   │
│ │ ...           [取消] [保存]    │   │
│ └────────────────────────────────┘   │
└──────────────────────────────────────┘
```
- 编辑原地展开，不弹独立 Modal
- 删除用 sonner toast + undo

### 涉及文件
- `src/components/agent/AgentManageModal.tsx`

---

## Step 5: Token 图表重做

### 设计稿

```
┌─ Token 用量 ────────────────────────────────┐
│  1,245,000        890,320          $2.47     │
│  输入 Token        输出 Token      预估费用   │
│  ─────────────────────────────────────────── │
│                                              │
│  Agent 占比              Top 对话            │
│  前端开发  45% ████████  按钮重构 ██████ 3k  │
│  后端开发  30% ██████    SSE调试 ████   2k  │
│  代码审查  18% ████      样式修改 ███  1.5k  │
│  测试       7% ██                              │
└──────────────────────────────────────────────┘
```
- 去掉 recharts，纯 CSS bar
- 两个并排卡片

### 涉及文件
- `src/components/settings/TokenCharts.tsx` — 重写
- `src/components/settings/TokenUsagePanel.tsx` — 小调

---

## Step 6: `/context` 上下文查看指令

### 设计稿

```
┌─ 系统 ─────────────────────────────────────┐
│ 📊 上下文用量                               │
│ 12,450 / 200,000 tokens (6.2%)             │
│ ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ 系统提示词   4,200 · 对话历史   7,800       │
│ 附件            450                        │
│ ─────────────────────────────────────────  │
│ 模型: Claude Sonnet 4.6 · 窗口: 200k       │
│ 累计输入 45k · 输出 8.9k · 费用 $0.42     │
└────────────────────────────────────────────┘
```
- 输入 `/context` 回车 → 对话流中插入此消息卡片
- 纯 CSS 进度条，数据从 `tokenUsageStore` + SSE `message_end.usage` 取

### 涉及文件
- 新建 `src/components/chat/ContextMessage.tsx`
- 改 `src/components/chat/MessageList.tsx` — contentType context 分支
- 改 `src/components/layout/ChatArea.tsx` — 检测 `/context` 前缀

---

## Step 7: 细节打磨

- 代码块右上角 copy 按钮 (`HighlightedCode.tsx`)
- 空状态定制插画 (`WelcomePage.tsx`)
- 消息操作：选中文字弹"引用"按钮

### 涉及文件
- `src/components/chat/HighlightedCode.tsx`
- `src/components/chat/WelcomePage.tsx`