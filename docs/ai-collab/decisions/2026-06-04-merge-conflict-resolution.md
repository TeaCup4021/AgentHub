# Merge Conflict Resolution — 2026-06-04

## 背景

两名开发者在 `main` 分支各自修改后，rebase 合并时产生 4 个文件冲突。目标：**合并双方功能，零丢失。**

## 冲突文件与决策

| # | 文件 | 冲突内容 | 决策 | 理由 |
|---|------|----------|------|------|
| 1 | `LoginPage.tsx` | catch 块错误处理逻辑 | 用 A 版本 | B 的错误处理是 A 的超集：先检测 Axios error（`"response" in e`），再 fallback 到 `instanceof Error`。B 版本完全覆盖 A 的功能。 |
| 2 | `ChatHeader.tsx` | Pin 组件选择 | 用 B 版本 (`PinnedMessages`) | `PinnedMessages` 不依赖外部传参，内部自给；`PinManager` 依赖的 `onJumpToMessage`/`onPinChanged` 在 `ChatArea.tsx` 中未传入，实际上不可用。`PinManager.tsx` 文件保留不删。 |
| 3A | `MessageList.tsx` | content 清洗函数 | **合并两者** | `stripArtifactTags`（去 artifact XML）和 `cleanContent`（去 orchestrator JSON）功能正交，合成一个函数：先去 XML 标签，再对 orchestrator 消息去末尾 JSON。同时保留独立的 `stripArtifactTags` 供 `StreamingMessageBubble` 使用。 |
| 3B | `MessageList.tsx` | MarkdownBubble text 属性 | 用合并后函数 | `cleanContent(message)` 同时具备去 artifact XML 和去 orchestrator JSON 的能力。 |
| 3C | `MessageList.tsx` | `renderFallbackCards` 守卫条件 | 用 B 版本（无条件） | B 版本移除 `status === "done"` 守卫，修复流式过程中 fallback 卡片不显示的 bug。A 的 done 情况被包含在内。 |
| 4A | `api.ts` | pins 方法名 | `getPins` + `PinInfo[]` 类型 | 下游 `PinnedMessages.tsx` 和 `PinManager.tsx` 都调用 `getPins`。类型使用 A 的精确类型 `PinInfo[]` 替代 B 的 `Record<string, any>[]`。 |
| 4B | `api.ts` | `ApplyDiffParams` 接口 | 保留 A 版本 | A 的命名接口 + A 的 `UploadFileResponse` 类型更规范。额外保留 B 的 `getDownloadUrl` 方法。 |
| 4C | `api.ts` | `fileApi` 方法实现 | A 为基础 + B 的 `getDownloadUrl` | `upload`/`updateContent`/`applyDiff` 使用 A 的签名（`UploadFileResponse`、`PUT /files/:id/content`、命名接口），并在末尾追加 B 的 `getDownloadUrl` 快捷方法。 |

> A = 对家 (HEAD/main)，B = 你 (temp/save-my-work)

## 下游适配修改

为解决类型变更引入的编译错误，额外修改：

| 文件 | 变更 | 原因 |
|------|------|------|
| `api.ts:imports` | 新增 `PinInfo`, `UploadFileResponse` 导入 | `getPins` 和 `upload` 使用了精确类型 |
| `ChatArea.tsx:246` | `listPins` → `getPins` | 方法名变更 |
| `PinnedMessages.tsx` | `messageId` → `message_id`、`content` → `content_preview`、`senderName` → `sender_type` | 适配 `PinInfo` 接口的 snake_case 字段 |

## 验证结果

- `npx tsc -b --noEmit` — 零错误
- `npx vitest run` — 14 files / 86 tests 全部通过
