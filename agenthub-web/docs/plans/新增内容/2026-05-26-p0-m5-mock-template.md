# P0 M5 — Mock 新对话可用 实施计划

日期：2026-05-26 | 状态：已完成

## 目标

新 Agent 也能产生合理的 SSE 流回复，模板引用用户输入内容。

## 文件变更

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `src/mocks/handlers.ts` | +10 行，导出 `getLastUserMessage` |
| 修改 | `src/mocks/sse.ts` | +26 行，模板 blocks 生成 + fallback 逻辑 |
