# Spec: Design Token 体系重构 — 对齐 Semi DSM + 飞书风格双主题

**日期**: 2026-05-27
**范围**: 仅前端，CSS/TSX 视觉层改造

---

## 目标

将 AgentHub 前端从"原型感"升级为"精致产品感"，建立完整 Design Token 体系，对齐 Semi Design 设计系统，深色/浅色各有独立审美方案。

---

## 原则

1. **能不写就不写** — Semi 已有的 token 直接用，不重复定义
2. **AgentHub 专属 token** — 仅定义 Semi 没有的（气泡、侧边栏、代码块）
3. **浅色≠反色** — 浅色主题参考飞书独立设计，非简单变量翻转
4. **增量改造** — 每步 tsc 零错误，不影响功能

---

## Phase 1: Token 体系重构（本次）

### 1.1 Token 清单

#### Semi 原生替换（删除自定义，直接用 Semi）

| 删除 | 替换为 |
|------|--------|
| `--color-text-primary` | `--semi-color-text-0` |
| `--color-text-secondary` | `--semi-color-text-1` |
| `--color-text-tertiary` | `--semi-color-text-2` |
| `--color-text-disabled` | `--semi-color-disabled-text` |
| `--color-border-light` | `--semi-color-border` |
| `--color-border-medium` | `--semi-color-border` |
| `--color-bg-app` | `--semi-color-bg-0` |
| `--color-bg-elevated` | `--semi-color-bg-1` |
| `--color-bg-hover` | `--semi-color-fill-0` |
| `--color-bg-active` | `--semi-color-fill-1` |
| `--color-bg-mask` | `--semi-color-overlay-bg` |
| `--color-primary` | `--semi-color-primary` |
| `--color-primary-hover` | `--semi-color-primary-hover` |
| `--color-primary-active` | `--semi-color-primary-active` |
| `--color-success` | `--semi-color-success` |
| `--color-warning` | `--semi-color-warning` |
| `--color-danger` | `--semi-color-danger` |
| `--radius-sm` | `--semi-border-radius-small` |
| `--radius-md` | `--semi-border-radius-medium` |
| `--radius-lg` | `--semi-border-radius-large` |
| `--radius-round` | `9999px`（常量） |
| `--shadow-sm` | `--semi-shadow-elevated` |
| `--shadow-md` | `--semi-shadow-overlay` |
| `--font-size-xs` | 11px（常量） |
| `--font-size-sm` | 12px（常量） |
| `--font-size-md` | 14px（常量） |
| `--font-size-lg` | 16px（常量） |
| `--duration-fast` | 150ms（常量） |
| `--duration-normal` | 300ms（常量） |

#### AgentHub 专属 Token（新增 `--ah-` 前缀）

**深色主题值：**

```css
--ah-bubble-user-bg: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.08));
--ah-bubble-user-text: #d4d4d8;
--ah-bubble-agent-bg: rgba(255,255,255,0.03);
--ah-bubble-agent-border: rgba(255,255,255,0.06);
--ah-sidebar-bg: #18181b;
--ah-conv-list-bg: #1a1a1f;
--ah-chat-bg: #0f0f14;
--ah-input-bg: rgba(255,255,255,0.03);
--ah-input-border: rgba(255,255,255,0.08);
--ah-code-block-bg: #0d0d10;
```

**浅色主题值（飞书风格）：**

```css
--ah-bubble-user-bg: #3370ff;
--ah-bubble-user-text: #ffffff;
--ah-bubble-agent-bg: #fafbfc;
--ah-bubble-agent-border: #e5e6e8;
--ah-sidebar-bg: #f5f6f7;
--ah-conv-list-bg: #fafbfc;
--ah-chat-bg: #ffffff;
--ah-input-bg: #f5f6f7;
--ah-input-border: transparent;
--ah-code-block-bg: #f5f6f7;
```

### 1.2 文件改动

| 文件 | 改动 |
|------|------|
| `src/styles/tokens.css` | 重写：删除被 Semi 替换的变量，新增 `--ah-*` 变量，分深色/浅色两个 `:root` 块 |
| `src/App.tsx` | 删除 `lightColors`/`darkColors` 硬编码 map（~100行），精简为只注入 `--ah-*` 变量 |
| `src/components/chat/MessageList.tsx` | 气泡色引用换为新 token |
| `src/components/chat/ChatInput.tsx` | 输入框色引用换为新 token |
| `src/components/layout/ConversationList.tsx` | 侧边栏色引用换为新 token |
| `src/components/layout/IconSidebar.tsx` | 导航栏色引用换为新 token |
| `src/components/layout/ChatArea.tsx` | 聊天区背景换为新 token |
| `src/components/chat/ChatHeader.tsx` | 顶部栏色引用换为新 token |
| `src/components/settings/SettingsPage.tsx` | 设置页背景换为新 token |
| 其余 10+ 组件 | 全局替换 `--color-*` → `--semi-color-*` 等 |

替换策略：用 `sed` 或全局搜索替换，然后逐文件检查是否有语义错误。

### 1.3 不在本次范围

- 玻璃拟态效果（Phase 2）
- framer-motion 微动效（Phase 3）
- 消息气泡尾巴/代码块顶栏（Phase 2）
- 字体系统调整

---

## Phase 2: 气泡重设计 + 玻璃拟态（后续）

### 预览

- 用户气泡：品牌蓝实心（浅色）/ 紫色渐变半透明（深色）
- Agent 气泡：浅灰底 + 1px 边框（浅色）/ 半透明底 + 微边框（深色）
- 侧边栏：玻璃拟态 `backdrop-filter: blur(20px)`
- 代码块：顶栏（文件名 + 语言 + 复制按钮）
- 输入框：圆角 12px + focus 蓝边框过渡

---

## Phase 3: 微动效系统（后续）

### 清单

- 消息入场：`y: 8 → 0` + 淡入 200ms（已有但可调优）
- 按钮 hover：背景色过渡 150ms
- 输入框 focus：边框色过渡 200ms
- 侧边栏 hover：背景色过渡 150ms
- Loading skeleton 增强
- 流式光标：当前已有 blink 动画，可加打字机效果

---

## 验证

1. `npx tsc -b --noEmit` — 零错误
2. 深色/浅色切换无闪烁、无颜色错乱
3. 所有 Semi 组件主题跟随正确
4. 消息气泡、侧边栏、输入框在双主题下视觉一致
