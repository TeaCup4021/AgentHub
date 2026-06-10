# @mention 体验闭环 — Spec

## 背景

当前 @mention 存在三个缺口：

1. **输入框没有 chip 可视化** — `@AgentName` 是纯文本，用户看不出"在对谁说话"
2. **多词 Agent 名解析有 bug** — 如 `@Claude Code` 正则只捕获到 `Claude`，`@OpenCode` 却能正常工作
3. **单聊中 @ 其他 Agent 无提示** — 用户在 Claude Code 单聊中 @Codex，系统没有任何反应，消息还是发给 Claude Code

## Feature 1: 输入框 @mention Chip 渲染

### 交互流程
1. 用户通过 `@` 下拉选中 Agent → 输入框不插入纯文本，而是插入一个 chip 占位元素
2. Chip 样式：蓝色背景圆角标签 `@AgentName`，右侧有 × 可删除
3. Chip 不可编辑内部文字，按 Backspace 删除整个 chip
4. 用户可继续输入普通文字，chip 和文字混排
5. 多行支持：chip 随着文字换行

### 实现方案

Textarea 不支持内联富文本，需要改用 **contenteditable div + 隐藏 input** 方案：

**数据结构：**
```typescript
type InputSegment =
  | { type: "text"; text: string }
  | { type: "mention"; agentId: string; agentName: string };
```

- 内部维护 `segments: InputSegment[]`
- 渲染时：mention 段渲染为 `<span class="mention-chip">@AgentName</span>`
- text 段渲染为普通文本
- 光标管理：在隐藏 input 上监听键盘事件，在 contenteditable div 上显示

**更简单的方案（推荐）：**
保留 textarea，但用覆盖层（overlay div）在 textarea 上方同步渲染 chip 高亮：

- textarea 仍然存纯文本（便于表单提交）
- 覆盖层用 `contenteditable="false"` 的 div，绝对定位在 textarea 上方
- 解析 text 中的 `@AgentName` 模式，在对应位置渲染 chip 背景
- textarea 文字颜色设为透明，覆盖层显示带 chip 的渲染结果
- 用户交互仍走 textarea（输入、选择、删除）

**关键逻辑：**
- `renderTextWithMentions(text, agents)`: 解析 `@Name` 模式，拆分为 text/mention 段
- mention regex 修复：支持带空格的 Agent 名（如 `@Claude Code`）
  - 方案：不用正则贪婪匹配，而是遍历 agents 列表，在文本中查找 `@AgentName` 字面量
- 覆盖层高度、滚动位置与 textarea 实时同步

### 视觉规范
- Chip: `bg-blue-100 text-blue-800 rounded px-1 py-0 text-sm font-medium`
- 普通文字：黑色，与 chip 在同一行自然排列

---

## Feature 2: 多词 Agent 名解析修复

### 问题
当前正则 `/@(\S+?)(?=\s|$)/g` 对 `@Claude Code 帮我写代码` 只捕获 `Claude`，丢掉了 ` Code`。

### 修复方案
**不依赖正则捕获 Agent 名**，改为遍历 agents 列表做字面量匹配：

```typescript
function parseMentions(text: string, agents: Agent[]): InputSegment[] {
  // 按 agent name 长度降序排列，优先匹配长名（避免 "Code" 误匹配 "Codex"）
  const sorted = [...agents].sort((a, b) => b.name.length - a.name.length);
  
  // 找所有 @AgentName 出现位置，拆分为 segments
  const mentions: { start: number; end: number; agent: Agent }[] = [];
  for (const agent of sorted) {
    const pattern = `@${agent.name}`;
    let idx = text.indexOf(pattern);
    while (idx !== -1) {
      // 检查不重叠
      if (!mentions.some(m => idx >= m.start && idx < m.end)) {
        mentions.push({ start: idx, end: idx + pattern.length, agent });
      }
      idx = text.indexOf(pattern, idx + 1);
    }
  }
  
  // 按位置排序，切分 segments
  mentions.sort((a, b) => a.start - b.start);
  // ... 生成 segments
}
```

这个修复同时服务于 Feature 1 的 chip 渲染和 Feature 3 的发送前检测。

---

## Feature 3: 单聊中 @ 其他 Agent → 智能切换

### 交互流程
1. 用户在单聊（绑定 Agent A）中输入消息，@ 了 Agent B
2. 点击发送时，检测到 `mentions` 包含非当前会话绑定的 Agent
3. 弹出确认对话框：
   - 标题："你想对哪个 Agent 说话？"
   - 选项 A（推荐）："切换为 @AgentB 的单聊" — 自动创建与 B 的新单聊并发送
   - 选项 B："转为群聊（AgentA + AgentB）" — 把当前单聊升级为群聊
   - 选项 C："仅发送给当前 AgentA" — 忽略 @mention，保持原样
4. 用户选择后执行对应操作

### 数据流
- `handleSend` 在发送前检查 `mentions` 数组
- 对比 `mentions` 中的 agentId 与当前 `conversation.agentIds`
- 如果有不在当前会话中的 Agent，阻止发送，弹出对话框
- 对话框选项对应的操作：
  - A: `createConversation({ title: "与 Codex 的对话", type: "single", agentIds: [agentB.id] })` → 发送消息
  - B: `updateConversation({ id: currentConvId, type: "group", agentIds: [...current, agentB.id] })` → 发送消息
  - C: 清除 mentions 中的外部 Agent，直接发送

### 群聊中的行为（保持不变）
- 群聊中 @ 任何已在会话中的 Agent → 正常发送，mentions 传给后端做定向路由
- 群聊中 @ 不在会话中的 Agent → 同上弹出对话框，但选项只有"添加 Agent 到群聊"和"忽略"

---

## 边界情况

- **发送纯文本不含 @**：不弹对话框，正常发送
- **@ 了一个不存在的 Agent 名**：作为普通文本处理，不渲染 chip
- **连续 @ 多个 Agent**：多个 chip 并排显示
- **删除 chip**：Backspace 删除整个 `@AgentName`（包括后面的空格）
- **正在 streaming 时无法发送**：现有 disabled 逻辑已覆盖

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/lib/mentionParser.ts` | parseMentions / renderTextWithMentions |
| 修改 | `src/components/chat/ChatInput.tsx` | 覆盖层 chip 渲染 + 多词解析 + 发送前检测 |
| 新建 | `src/components/chat/MentionSwitchDialog.tsx` | 单聊 @ 其他 Agent 的确认对话框 |
| 修改 | `src/components/layout/ChatArea.tsx` | handleSend 集成切换逻辑 |

## 不做什么

- 不改为 contenteditable（复杂度太高，覆盖层方案够用）
- 不在消息气泡中高亮 @mention（那是另一个迭代）
- 不修改后端 API 的 mentions 字段
