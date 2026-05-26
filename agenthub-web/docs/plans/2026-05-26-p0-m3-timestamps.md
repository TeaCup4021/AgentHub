# P0 M3 — 消息时间戳 实施计划

日期：2026-05-26 | 状态：已完成

## 目标

IM 行业标准时间分组 + hover 精确时间。

## 规则

- 相邻消息 < 5 分钟 → 不重复显示
- >= 5 分钟 → 插入分隔条
- 当天/HH:mm、昨天/HH:mm、本周/周X HH:mm、更早/MM-DD HH:mm
- hover 显示 "YYYY-MM-DD HH:mm:ss"

## 文件变更

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `src/lib/formatTime.ts` | formatTime + formatFullTime + 3 个辅助函数 |
| 修改 | `src/components/chat/MessageList.tsx` | TimeSeparator + 分组逻辑 + hover title |
