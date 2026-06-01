# Spec: 可拖拽容器尺寸显示与约束统一修复

**日期**: 2026-06-01
**状态**: completed
**关联**: useResizable hook、artifact-card 尺寸标签、拖拽体验

---

## 动机

产物卡片（CodeCard / DiffCard / FileCard / PreviewCard / DeployStatusCard）使用 `useResizable` hook 支持拖拽调整宽高。存在三组问题：

### 问题 1：尺寸显示逻辑割裂

- 初始状态 label 隐藏（CSS `opacity:0`），仅拖拽中才 `addClass("visible")` 显示
- 5 个 Card 组件各自硬编码假文本 `"100% × 260"`，非真实尺寸
- 尺寸更新：`onMove` 手动写 `textContent`，`resetSize` 手动隐藏 label——三套逻辑各管各的

### 问题 2：拖拽秒跳转

当卡片自然宽度（CSS flex 撑满容器）超过 `maxW=1200` 时：
- 初始渲染：卡片 flex 撑满 → border-box ≈ 1282px
- `onDown` 捕获 `sw = 1282`
- `onMove` 第一帧：`clamp(1282 + delta, 320, 1200)` = **1200** → 瞬间跳变
- 用户看到 label 从 1282 秒变成 1199

根因：硬上限 `maxW` 在拖拽首帧就切断了自然布局宽度，卡片无法平滑从初始尺寸缩小。

### 问题 3：测量基准不一致

ResizeObserver 使用 `contentRect`（content-box），拖拽 `onDown` 使用 `getBoundingClientRect()`（border-box）。两个测量体系混用，label 显示的数字与拖拽逻辑不在同一基准上。

---

## 设计目标

1. label 始终显示当前实际宽高 `W×H`（border-box），初始加载即显示
2. 拖拽平滑无跳变——初始自然宽度不被 clamp 突变
3. 可自由拖回初始尺寸区域
4. 所有 5 个卡片组件行为一致

---

## 最终实现

### 1. `src/hooks/useResizable.ts`

**核心修复一：ResizeObserver 统一尺寸监听**

```ts
useEffect(() => {
  const observer = new ResizeObserver(() => {
    const rect = card.getBoundingClientRect();  // border-box，与拖拽逻辑统一
    label.textContent = Math.round(rect.width) + "×" + Math.round(rect.height);
  });
  observer.observe(card);
  return () => observer.disconnect();
}, []);
```

覆盖挂载初始、拖拽过程、容器 resize、resetSize 所有场景，不再需要手动操作 label。

**核心修复二：拖拽 clamp 防止秒跳转**

```ts
// 修复前
const w = clamp(sw + delta, minW, maxW);

// 修复后
const w = clamp(sw + delta, minW, Math.max(maxW, sw));
```

逻辑：如果拖拽起点宽度超过硬上限，本次拖拽有效上限临时提升为起点宽度。用户平滑缩小卡片，第一帧不会被 clamp 到 maxW。

**清理**：
- 删除 `onMove` 中 `textContent` + `classList.add("visible")` 三行
- 删除 `resetSize` 中 label 操作
- 删除 `initialSizeRef`
- 简化 `resetSize`：`card.style.width = ""; card.style.height = defaultHeight + "px"` — 宽度回归 CSS flex

### 2. `src/index.css`

```css
.artifact-card__size-label {
  opacity: 0.65;  /* 始终可见，不再需要 .visible 切换 */
}
/* 删除 .artifact-card__size-label.visible 规则 */
```

### 3. 5 个 Card 组件

CodeCard / DiffCard / FileCard / PreviewCard / DeployStatusCard — 移除硬编码 `<span>{"100% × " + DEFAULT_HEIGHT}</span>`，改为空 `<span />`，ResizeObserver 自动填充真实尺寸。

---

## 不变项

- 拖拽约束 `minW=320, maxW=1200, minH=140, maxH=700` 不变
- `DEFAULT_HEIGHT` 各卡片默认高度不变
- 拖拽手柄 SVG、reset 按钮行为不变
- `artifact-card--resizing` / `artifact-card--restoring` class 逻辑保留
- 过渡动画保留

---

## 验证

- `npx tsc -b --noEmit` — 零错误
- `npx vitest run` — 14 files / 86 tests 全部通过
- 页面加载后卡片右上角立即显示真实 `W×H`
- 拖拽时数字实时变化，无秒跳转
- 初始宽度 > maxW 时拖拽平滑缩小，不突变
- reset 恢复默认高度，宽度回归 flex 布局
