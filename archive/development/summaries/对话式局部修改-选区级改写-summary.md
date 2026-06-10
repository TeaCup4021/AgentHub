# 对话式局部修改 / 选区级改写 — 实施总结

**日期**: 2026-06-05
**类型**: 前后端闭环新功能（产物预览补全计划 · 任务 #5 ·【P2】）

---

## 目标

实现「在代码卡中选中片段 → 在聊天中描述修改 → Agent 定向改写选中部分（返回 Diff）」的闭环。
此前仅有**整条消息**「引用」，无选区级定向改写。

来源：`vibeCodingPlan/AgentHub-产物预览与编辑-未完成功能补全计划.md` 第 5 节。

---

## 关键发现

排查中发现 `pendingQuote` 这条「引用」链路**本就是死代码**：`MessageActions.handleQuote` 把整条消息写进
`pendingQuote`、`ChatInput` 渲染出引用条，但 `ChatInput.handleSend` **从未读取 `pendingQuote`** —— 引用条只是
摆设，引用的内容根本没拼进发送给 Agent 的 prompt。

因此本任务不仅新增「选区捕获」UI，还顺带把这条死链路接通（整条引用与选区引用共用同一发送路径）。

---

## 实现方案

数据流：选区 → `pendingQuote.codeRange` → `composeQuotedPrompt` 组装 prompt → 随消息发送（同时落库 +
作为 SSE `prompt` query 参数）→ 后端 `inject_artifact_reminder` 检测 `[选区修改]` sentinel → 注入 diff 定向指令。

- **选区捕获在前端完成**，无需新增接口。组装后的 prompt 是自包含文本（含代码 fence + 修改要求），天然
  随现有 `messageApi.send` + `/stream` 链路流转，无需改动 `context_assembler` 或消息 Schema。
- **后端仅做指令增强**：识别 sentinel 后追加「只改选区、以 diff 返回」的 system 指令，引导 Agent 输出
  `<artifact type="diff">`，复用既有产物检测/渲染链路。

---

## 修改清单

### 前端

| 文件 | 改动 |
|------|------|
| `agenthub-web/src/stores/chatStore.ts` | `pendingQuote` 类型扩展为 `PendingQuote { messageId, content, codeRange? }`；新增导出 `QuoteCodeRange { fileName?, language?, snippet }`、`PendingQuote` 接口 |
| `agenthub-web/src/components/cards/CodeCard.tsx` | 只读视图 `onMouseUp` 捕获选区 → 在选区上方浮出「引用此片段修改」按钮 → 写入 `pendingQuote.codeRange`（含文件名/语言/片段）。`bodyRef` + `position:relative` 定位，限定选区须落在本卡 body 内 |
| `agenthub-web/src/components/chat/ChatInput.tsx` | **接通死链路**：`handleSend` 现读取 `pendingQuote`，经 `composeQuotedPrompt`（导出）组装后再发送、发送后清空引用；引用条区分「选区 · 语言」标签（蓝边 + 等宽）与普通整条引用（灰边）；存在引用时即使输入框为空也允许发送 |
| `agenthub-web/src/components/chat/MessageActions.tsx` | 顺带修复（见下）：`useQueryClient()` hook → `@/lib/queryClient` 单例 import |

`composeQuotedPrompt` 规则：
- **选区引用**（有 `codeRange`）→ `[选区修改] 请仅修改以下选中的代码片段（文件 · 语言），其余代码保持不变，并以 diff 形式给出改动：\n\n\`\`\`lang\n<片段>\n\`\`\`\n\n修改要求：<用户描述>`
- **整条引用**（无 `codeRange`）→ 原文转 `> ` blockquote + 用户描述

`[选区修改]` 是与后端约定的稳定 sentinel，两端各留注释互指。

### 后端

| 文件 | 改动 |
|------|------|
| `backend/app/services/artifact_format.py` | `inject_artifact_reminder` 检测 prompt 含 `_SELECTION_EDIT_MARKER`（`[选区修改]`）时，在常规 artifact 提醒后追加 `_SELECTION_EDIT_DIRECTIVE`：要求 Agent 只改选区、以 `<artifact type="diff">` 返回。该函数已在 `conversations.py:stream_conversation` 对每个 prompt 调用，无需改动调用点 |

---

## 顺带修复（红测试归零）

跑全量前端测试时，`MessageList.test.tsx` 2 条用例红，崩在 `MessageActions.tsx` 的 `useQueryClient()` —— 孤立
渲染无 `QueryClientProvider`。这正违反 CLAUDE.md 既有规则「深埋消息树的组件禁用 `useQueryClient()` hook，
必须用 `@/lib/queryClient` 单例」（与 `CodeCard` 同款）。非本次引入，但属同一前端区域且为 2 行确定性修复，已一并纠正。

后端 `test_artifact_service.py::test_build_merge_key_fallback` 1 条红：断言仍是旧 merge-key 格式
`fallback:{mid}:code:demo`，但实现早已改为 `fallback:{mid}:{type}:{md5(content)[:12]}`（content hash）。测试断言
陈旧，已更新为校验真实的 content-hash 方案。

---

## 验证结果

| 验证项 | 结果 |
|--------|------|
| 前端 `npx tsc -b` | ✅ 通过，无类型错误 |
| 前端 `vitest run`（全量） | ✅ 15 文件 / 93 用例全绿（修复 2 条预存红测试后） |
| 新增 `ChatInputQuote.test.tsx` | ✅ 7 用例：`composeQuotedPrompt` 选区/整条/无描述分支 + 引用条渲染 + 回车发送组装并清空引用 |
| 后端 `pytest tests/services/` | ✅ 11 用例全绿 |
| 新增 `test_artifact_format.py` | ✅ 4 用例：sentinel 命中追加 diff 指令、未命中只追加常规提醒、空 prompt 原样返回 |

> 备注：后端 `tests/api/` 与 `test_stream_sequentializer.py` 的 7 条 async 用例报
> `async def functions are not natively supported`（本机未启用 pytest-asyncio 插件），为**预存环境问题**，
> 涉及文件本次均未触碰，与本改动无关。

---

## 涉及文件总览

```
agenthub-web/src/
├── stores/chatStore.ts                          ← pendingQuote 类型扩展（codeRange）
├── components/cards/CodeCard.tsx                 ← 选区捕获 + 浮动「引用此片段修改」按钮
├── components/chat/ChatInput.tsx                 ← 接通引用链路 + composeQuotedPrompt + 引用条区分
├── components/chat/MessageActions.tsx            ← 顺带：queryClient 单例（修红测试）
└── components/chat/__tests__/ChatInputQuote.test.tsx  ← 新增前端测试

backend/
├── app/services/artifact_format.py              ← [选区修改] sentinel → diff 定向指令
└── tests/services/
    ├── test_artifact_format.py                  ← 新增后端测试
    └── test_artifact_service.py                 ← 顺带：更新陈旧断言（merge-key content hash）
```

---

## 验证操作建议（联调）

按 `docs/ai-collab/debug-artifact-cards.md` 前提（`VITE_USE_MOCK=false` + 后端走 `.venv`）：

1. 让 Agent 输出一段代码（生成 code 卡）。
2. 在卡片只读视图中划选若干行 → 上方浮出「引用此片段修改」→ 点击。
3. 输入框出现「选区 · python」蓝边引用条；输入「把循环改成列表推导」→ 回车。
4. 期望：Agent 返回**针对选区的 Diff 卡**（而非整文件重写），引用条发送后自动清空。

---

# 追加迭代（2026-06-05）— Diff 应用回源代码卡

## 缺口

选区改写跑通后，Agent 返回 Diff 卡，但**无法把改动落回最初的源代码卡**（如 `quicksort.py`）。
原 `DiffCard` 的「保存文件」实际只是 `applyDiff` 把 `newCode` 当**全新文件下载**，与源代码卡零关联——
Agent 产出的 diff 不携带我们的源 artifact id，系统不知道该写回哪张卡。这是计划 #5 当时未覆盖的收尾环节。

## 方案（用户选定：自动匹配文件名 + 片段替换）

新增纯函数模块 `lib/diffApply.ts`，把「diff → 源代码卡」的匹配与拼接独立出来（可单测、不依赖 React/缓存）：

1. **文件名匹配**：diff 有 `fileName` 时，优先在同名代码卡中找。
2. **片段内容匹配**（最强信号，也是无文件名时的唯一手段）：在候选卡的完整代码里定位 diff 的 `oldCode`
   片段——先精确子串，再「忽略行首尾空白」的逐行容错匹配（DOM 选区常丢首行缩进/行尾空格），命中后把
   `newCode` 拼接替换进去，得到该卡的新完整代码。
3. **整文件兜底**：文件名匹配上但片段定位失败，则把 `newCode` 当整文件覆盖同名卡。

匹配到目标后，复用既有 `PATCH /messages/artifacts/{id}`（`update_content` 追加新版本）写回——
天然接入版本链，刷新后保留，与代码卡编辑回写同一机制。

## 修改清单（追加）

| 文件 | 改动 |
|------|------|
| `agenthub-web/src/lib/diffApply.ts` | 新增。`applySnippet`（精确 + 空白容错的片段替换）、`findApplyTarget`（文件名/内容匹配 + 整文件兜底，返回目标卡 + 新完整代码 + 匹配类型，或 `no-candidates`/`no-match` 失败） |
| `agenthub-web/src/components/cards/DiffCard.tsx` | 新增「**应用到源文件**」按钮：从 `["messages", convId]` 缓存（经 `queryClient` 单例读取，非 hook）收集全部代码卡为候选→`findApplyTarget` 匹配→`messageApi.updateArtifact` 写回→`invalidateQueries`。原「保存文件」更名「**另存为文件**」并降为次要色，名实相符（它本就是下载）。fallback 卡（无 DB 行）/ 无匹配 / 无候选均有明确 toast 提示 |
| `backend/app/services/artifact_format.py` | 强化 `_SELECTION_EDIT_DIRECTIVE`：要求 Agent 在 diff 的 `--- before` 段**逐字复制原片段**、并带上源文件名 `file="..."`，让前端两条匹配路径（文件名 + 内容）都更可靠 |
| `agenthub-web/src/components/cards/__tests__/CardRenderer.test.tsx` | 顺带：diff 卡断言从旧「保存文件」更新为「应用到源文件」+「另存为文件」 |

## 验证结果（追加）

| 验证项 | 结果 |
|--------|------|
| 新增 `lib/__tests__/diffApply.test.ts` | ✅ 11 用例：精确/容错片段替换、缩进容错、文件名优先、内容兜底匹配、整文件兜底、`no-match`/`no-candidates`、CRLF 归一 |
| 前端 `vitest run`（全量） | ✅ 16 文件 / 104 用例全绿 |
| 前端 `npx tsc -b` | ✅ 通过 |
| 后端 `pytest tests/services/` | ✅ 全绿（含 `test_artifact_format.py`） |

## 用法（联调）

承接上面选区改写流程，拿到 Diff 卡后：

1. 点 Diff 卡头部「**应用到源文件**」。
2. 系统自动匹配源代码卡（优先同名，其次按选中片段内容定位）。
3. 成功 toast「已应用到「quicksort.py」（追加为新版本）」；源代码卡刷新为改后内容，刷新页面仍保留。
4. 若 diff 来自临时解析卡（`fallback-` 开头、无 DB 行）或匹配不上，会提示手动复制——此时用「另存为文件」下载。
