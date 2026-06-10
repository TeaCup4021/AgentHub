# Phase T1 — 对话与项目关联

## 目标

对话类型、API、hooks、Mock 全链路支持 `projectId` 参数，对齐后端新增字段。

## Task 拆解

| # | 步骤 | 文件 | 内容 |
|---|------|------|------|
| 1 | Mock 数据 | `mocks/data.ts` | Conversation 加 `projectId` |
| 2 | Mock 拦截器 | `mocks/handlers.ts` | GET `/conversations` 支持 projectId 过滤；POST 存储 projectId |
| 3 | 类型定义 | `types/chat.ts`, `types/api.ts` | Conversation/CreateConversationParams/ConversationListParams 加 projectId |
| 4 | API 层 | `lib/api.ts` | conversationApi.list/create 透传 projectId |
| 5 | Hooks 层 | `hooks/useConversations.ts` | useConversations 接受 projectId 参数 |
| 6 | 验证 | — | tsc 零错误 + vitest 通过 |

## 验证标准

- [ ] `npx tsc -b --noEmit` 零错误
- [ ] `npx vitest run` 86 tests 通过
- [ ] Mock 模式下 useConversations("proj-1") 只返回该项目对话
