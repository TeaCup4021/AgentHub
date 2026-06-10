# Spec: 第三轮前后端 API 对齐 — 前端类型修正

**日期**: 2026-05-25
**范围**: 仅修前端，不改后端

## 背景

第二轮对齐后，15 个端点中 13 个完全对齐。剩余 5 个前端类型声明与后端实际返回不匹配。

## 变更点

### 1. POST /agents/verify — 响应类型修正

**问题**: 前端声明返回裸 `{ status: string; message: string }`，但后端 `ResponseWrapperMiddleware` 会包一层 `ApiResponse<T>`，实际返回结构是：

```json
{ "code": 200, "data": { "status": "ok", "message": "..." }, "message": "success" }
```

前端直接读 `res.data.status` 会拿到 `undefined`，正确路径是 `res.data.data.status`。

**修改**: [src/lib/api.ts:109] — 泛型改为 `ApiResponse<{ status: string; message: string }>`

### 2. POST /conversations/:id/pins — 响应类型修正

**问题**: 前端声明 `ApiResponse<null>`，后端实际返回 `{ status: "pinned" }`（被包装后为 `{ code: 201, data: { status: "pinned" }, message: "success" }`）。

**修改**: [src/lib/api.ts:83] — 泛型改为 `ApiResponse<{ status: string }>`

### 3. DELETE /conversations/:id — 204 响应类型修正

**问题**: 后端返回 204 No Content（空 body），前端声明 `ApiResponse<null>`。调用方不读 body 所以功能正常，类型不精确。

**修改**: [src/types/api.ts:42] — `DeleteConversationResponse` 改为 `ApiResponse<void>`

### 4. DELETE /conversations/:id/pins/:msgId — 同上 204 问题

**修改**: [src/lib/api.ts:87] — 泛型 `ApiResponse<null>` 改为 `ApiResponse<void>`

### 5. Agent.avatarUrl — 去掉 null

**问题**: 约定文档规定前端 `avatarUrl: string` 非可选，实际代码是 `string | null`。代码库中所有赋值处已经传的是 `""`，不存在传 `null` 的场景。

**修改**: [src/types/agent.ts:4] — `string | null` 改为 `string`

## 影响面

- `verify`、`pinMessage`、`unpinMessage` 目前无调用方
- `DELETE /conversations/:id` 的调用方（`useConversations.ts`）只 `await` 不读 body
- `avatarUrl` 所有赋值处已使用空字符串 `""`，无传 `null` 的代码路径
- 纯类型层面修正，运行时行为不变

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/lib/api.ts` | 83、87、109 行泛型修正 |
| `src/types/api.ts` | 42 行 `null` → `void` |
| `src/types/agent.ts` | 4 行去掉 `\| null` |
