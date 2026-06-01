# Spec: Layer 1 — 设计地基 tokens.css 翻新

**日期**: 2026-06-01
**状态**: review
**关联**: 全局 UI 优化分层计划 — Layer 1/5

---

## 动机

`tokens.css` 定义了基础色彩、圆角、阴影、间距变量，但实际只覆盖了约 40% 的样式需求。组件层大面积硬编码颜色值，缺乏灰度色阶、状态语义色、按钮统一令牌。这导致视觉不统一，后续精调需要逐个文件手动对齐。

## 设计原则

- **令牌是唯一真相源**：组件层不写裸色值，全部引 token
- **命名语义化**：灰阶级按灰度深浅编号，状态色按语义命名，不用"blue-500"这种具体颜色名
- **向后兼容**：现有 token 名不变，只新增
- **深色模式齐全**：每个新 token 都有 dark 对应值

## 变更内容

### 1. 灰度色阶系统（新增）

```
--color-gray-950: #18181b  最深黑灰 — 按钮填充、最高强调文字
--color-gray-900: #3f3f46  次深灰 — 次要按钮填充 hover
--color-gray-600: #52525b  中深灰 — 次要文字、非主要描边
--color-gray-400: #a1a1aa  中浅灰 — 禁用文字、placeholder、弱图标
--color-gray-200: #e4e4e7  浅灰 — 分割线、描边、禁用背景
--color-gray-100: #f4f4f5  极浅灰 — 凹入底色、input 背景
--color-gray-50:  #fafafa  微灰 — 卡片/气泡浅底色
```

### 2. 状态色语义令牌（新增）

```
--color-status-running:  #3b82f6  执行中
--color-status-queued:   var(--color-text-disabled)  等待中
--color-status-done:     var(--color-success)  完成
--color-status-failed:   var(--color-danger)  失败
--color-status-timeout:  var(--color-warning)  超时

--color-phase-thought:      #8b5cf6  思考阶段
--color-phase-action:       #e37318  行动阶段
--color-phase-observation:  #00a870  观察阶段
```

### 3. 统一按钮令牌（新增）

```
--btn-radius: 6px
--btn-height-sm: 28px
--btn-height-md: 36px
--btn-fill: var(--color-gray-950)
--btn-fill-hover: var(--color-gray-900)
--btn-outline-border: var(--color-gray-200)
--btn-outline-color: var(--color-gray-600)
--btn-ghost-color: var(--color-gray-400)
--btn-ghost-hover-bg: var(--color-gray-100)
```

### 4. 语义圆角别名（保持已有）

```
--radius-card: 8px     (已有，保持不变)
--radius-input: 6px    (已有，保持不变)
--radius-bubble: 12px  (新增，消息气泡圆角)
--radius-tag: 4px      (新增，标签/徽章圆角)
```

### 5. 深色模式

所有新增令牌在 `[theme-mode="dark"]` 下提供对应暗色值。

## 不改什么

- `--color-primary` / `--color-success` / `--color-warning` / `--color-danger` 名称不变
- `--shadow-*` / `--space-*` / `--radius-*` / `--font-size-*` 不变
- `--color-bg-*` / `--color-text-*` / `--color-border-*` 不变
- Semi Design 内部 token (`--semi-color-*`) 不变

## 文件变更

| 文件 | 改动 |
|------|------|
| `src/styles/tokens.css` | 新增灰度色阶、状态色、按钮令牌、深色模式对应值 |

## 验收标准

1. `npx tsc -b --noEmit` 零错误（tokens.css 仅 CSS 变量，不涉及 TS）
2. 新增令牌覆盖：灰度 7 级 + 状态色 9 个 + 按钮 8 个 + 圆角 2 个
3. `[theme-mode="dark"]` 下所有新令牌有对应值
4. 现有页面功能不受影响（token 新增不影响已有样式）
