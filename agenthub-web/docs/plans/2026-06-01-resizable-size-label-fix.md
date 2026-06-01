# Plan: 可拖拽容器尺寸显示与约束统一修复

**关联 Spec**: [2026-06-01-resizable-size-label-fix](../specs/2026-06-01-resizable-size-label-fix.md)
**日期**: 2026-06-01
**状态**: completed

## Task 1: 修复 `useResizable.ts`

**文件**: `src/hooks/useResizable.ts`

- [x] 新增 ResizeObserver effect，使用 `getBoundingClientRect()` 统一测量基准为 border-box
- [x] 修复 `onMove` clamp：`Math.max(maxW, sw)` 防止拖拽首帧秒跳转
- [x] 删除 `onMove` 中手动 label 更新（textContent + classList）
- [x] 删除 `resetSize` 中手动 label 操作
- [x] 删除 `initialSizeRef`
- [x] 简化 `resetSize`：`style.width = ""` 回归 flex 宽度

## Task 2: 修复 `index.css`

**文件**: `src/index.css`

- [x] `.artifact-card__size-label` 默认 `opacity: 0.65`
- [x] 删除 `.artifact-card__size-label.visible` 规则

## Task 3: 修复 5 个 Card 组件

**文件**: CodeCard / DiffCard / FileCard / PreviewCard / DeployStatusCard

- [x] 5 个组件全部移除硬编码假文本 `"100% × " + DEFAULT_HEIGHT`
- [x] 改为空 `<span />`，ResizeObserver 自动填充

## Task 4: 验证

- [x] `npx tsc -b --noEmit` — 零错误
- [x] `npx vitest run` — 14 files / 86 tests 全部通过
- [x] 初始加载即显示真实 `W×H`（无须拖拽触发）
- [x] 拖拽秒跳转已修复（初始宽度 > maxW 时平滑缩小）
- [x] 所有 5 个卡片行为一致
