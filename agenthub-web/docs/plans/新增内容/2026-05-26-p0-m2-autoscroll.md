# P0 M2 — 消息列表自动滚底 实施计划

日期：2026-05-26 | 状态：进行中

## 目标

新消息自动滚底 + 历史浏览不打扰 + 浮动回底按钮。

## 三场景

- 用户在底部 → 新消息自动 scrollIntoView
- 用户向上滚动 → 浮动 "↓ N" 按钮出现
- 用户滚回底部 → 按钮消失，恢复自动滚

## 文件变更

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `src/components/chat/MessageList.tsx` | 加底部 sentinel + IO + 按钮 + 计数逻辑 |
| 修改 | `src/index.css` | 加 slide-up @keyframes |
