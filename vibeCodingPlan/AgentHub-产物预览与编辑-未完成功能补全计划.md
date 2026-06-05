# 产物预览与编辑 · 未完成功能补全计划

> 盘点目标功能清单（内联预览卡片 / 全屏预览 / 代码编辑器 / Diff / 版本历史 / 对话式局部修改）在当前代码中的实现状态，仅列出**未实现 / 不完整**项及补全方案。
>
> 盘点日期：2026-06-05　范围：`agenthub-web/src/components/cards/`、`backend/app/services/artifact*`

---

## 一、目标功能清单与现状

原始需求三条：

1. Agent 回复中内联产物预览卡片（网页 iframe、文档渲染、【P2】PPT 浏览）
2. 点击卡片展开全屏预览 / 代码编辑器
3. 【P2】支持 Diff 视图、版本历史、对话式局部修改（选中代码 → 在聊天中描述修改）

| 子功能 | 状态 | 说明 |
|--------|------|------|
| 内联卡片渲染（完成 + 流式） | ✅ 已完成 | `MessageList.tsx:371` / `:449` + `renderFallbackCards` 兜底 |
| 网页 iframe 预览 | ✅ 已完成 | `PreviewCard.tsx`，sandbox + MinIO 发布 |
| 文档渲染 — PDF / Word / Excel | ✅ 已完成 | `DocumentCard.tsx`（iframe / mammoth / XLSX） |
| Diff 视图 | ✅ 已完成 | `DiffCard.tsx` Monaco DiffEditor + 冲突解决 |
| 链接预览 | ✅ 已完成 | `LinkPreviewCard.tsx`（OG 元数据） |
| **文档渲染 — PPT 浏览**【P2】 | ❌ 未实现 | `pptx` 直接落下载分支 |
| **全屏预览（代码 / Diff / 文档卡）** | ⚠️ 不完整 | 仅 `PreviewCard` 有全屏 Modal |
| **代码编辑器回写** | ⚠️ 不完整 | 能编辑，保存仅本地下载，不回写 artifact / DB |
| **版本历史 UI**【P2】 | ⚠️ 不完整 | 后端 version 数据齐全，前端无浏览/切换 UI |
| **对话式局部修改（选区级）**【P2】 | ❌ 未实现 | 仅整条消息「引用」，无代码选区→定向改写 |

---

## 二、未完成项明细与补全方案

### 1. 代码编辑器回写后端（⚠️ 不完整 · 优先级最高）

**现状**　`CodeCard.tsx` 内嵌 Monaco 可编辑，但 `handleSave` 是 `Blob` + `URL.createObjectURL` **本地下载文件**，不回写 artifact，刷新会话即丢失改动。最违反用户直觉——看起来"已保存"，实际没存进系统。

**根因**　缺少「更新 artifact 内容」的后端端点与前端调用；`ArtifactService` 只有 `append_version`（追加），无"用户编辑后落版本"的入口。

**补全方案**
- 后端：新增 `PATCH /conversations/{conv_id}/artifacts/{artifact_id}`，body `{ content }`，内部走 `ArtifactService.append_version` 追加新版本（复用现有 merge_key + version 递增逻辑，天然衔接版本历史）。响应遵循 `{ code, data, message }`。
- 前端：`CodeCard` 保存改为调该端点，成功后 `invalidateQueries(["messages", convId])` 刷新；保留"下载"为次要操作。
- 验证：编辑→保存→刷新页面，改动仍在；DB `artifacts` 表 version +1。

**涉及文件**　`backend/app/api/v1/conversations.py`（或 `messages.py`）、`backend/app/services/artifact.py`、`agenthub-web/src/components/cards/CodeCard.tsx`、`agenthub-web/src/lib/api.ts`

---

### 2. 版本历史 UI（⚠️ 不完整 ·【P2】· 后端已就绪）

**现状**　后端 `ArtifactService.append_version` 已完整维护 `version`（按 `_mergeKey` 去重 + 递增），同一 artifact 的多版本已落库；但前端只渲染最新版，**无版本切换 / 浏览入口**，历史版本不可见。

**补全方案**
- 后端：新增 `GET /conversations/{conv_id}/artifacts/{merge_key}/versions` 返回该 artifact 的版本列表（`{ list, total, ... }` 分页格式）。
- 前端：卡片头部加版本下拉 / "v1 v2 …" 切换器，切换时重渲染对应版本内容；与上面「编辑回写」联动（每次保存产生新版本）。
- 验证：多次编辑同一代码卡后，下拉可见多版本，切换内容正确。

**涉及文件**　`backend/app/api/v1/conversations.py`、`agenthub-web/src/components/cards/CodeCard.tsx`（+ 可复用到 DiffCard）、`agenthub-web/src/lib/api.ts`、`agenthub-web/src/types/chat.ts`

---

### 3. 其余卡片全屏预览（⚠️ 不完整）

**现状**　只有 `PreviewCard` 有全屏 `Modal`（`PreviewCard.tsx:91`）。`CodeCard` / `DiffCard` / `DocumentCard` 仅支持拖拽 resize，无全屏入口，长代码 / 大表格阅读体验差。

**补全方案**
- 抽一个通用 `<FullscreenCardModal>`（或共用 hook），在 Code / Diff / Document 卡头部加全屏按钮（复用 PreviewCard 那枚 `M15 3h6v6...` 图标）。
- 全屏内复用各卡现有渲染体（Monaco / DiffEditor / 文档 HTML），只是放进 `Modal fullScreen`。
- 验证：三类卡点全屏弹出 Modal，内容完整，ESC / 关闭正常。

**涉及文件**　`agenthub-web/src/components/cards/CodeCard.tsx`、`DiffCard.tsx`、`DocumentCard.tsx`（+ 可新增 `cards/FullscreenModal.tsx`）

---

### 4. PPT 内联浏览（❌ 未实现 ·【P2】）

**现状**　`DocumentCard.tsx:26-29` 对 `pdf` / `pptx` 提前 `setLoading(false)`，PDF 走 iframe，**pptx 落到 Empty + 下载**分支，无内联渲染。

**方案权衡**（PPT 浏览器端渲染无成熟轻量方案）
- 方案 A（推荐，省事）：后端转换——上传时用 LibreOffice headless / `unoconv` 把 pptx 转 PDF，前端复用现有 PDF iframe 渲染。需后端装 LibreOffice，较重。
- 方案 B：前端 `pptx` 解析库（如 `pptxgenjs` 逆向 / `js-pptx`）——生态不成熟，渲染保真度低。
- 方案 C（兜底）：明确标注"PPT 暂不支持内联预览"，提供下载 + 缩略图。当前即此状态。

**结论**　【P2】，建议留待二期，按方案 A 实现。短期保持下载兜底即可。

**涉及文件**　`backend/app/services/storage.py`（转换）、`agenthub-web/src/components/cards/DocumentCard.tsx`

---

### 5. 对话式局部修改 / 选区级改写（❌ 未实现 ·【P2】）

**现状**　仅有**整条消息**「引用」：`MessageActions.tsx:33` 的 `handleQuote` 把整条 `message.content` 塞进 `pendingQuote`，输入框 `ChatInput.tsx:339` 显示引用条。**没有**「在代码卡中选中片段 → 在聊天中描述修改 → Agent 定向改写选中部分」的闭环。

**补全方案**（较重，建议拆子任务）
- 前端：`CodeCard` Monaco / `HighlightedCode` 支持选区捕获，划选后浮出"引用此片段修改"按钮 → 写入 `pendingQuote`（扩展为 `{ messageId, content, codeRange?: {fileName, language, snippet} }`）。
- 输入框：引用条区分"整条消息"与"代码片段"，提交时把片段 + 用户描述一起发给 Agent。
- 后端：prompt 组装时把选区片段作为明确的"待修改目标"注入（可经 `context_assembler` / artifact_format），引导 Agent 输出 `<artifact type="diff">` 仅改该片段。
- 验证：选中代码 + 描述"把循环改成列表推导" → Agent 返回针对性 Diff 卡。

**涉及文件**　`agenthub-web/src/components/cards/CodeCard.tsx`、`MessageActions.tsx`、`ChatInput.tsx`、`stores/chatStore.ts`、`backend` prompt 组装链路

---

## 三、建议实施顺序

| 序 | 任务 | 优先级 | 工作量 | 理由 |
|----|------|--------|--------|------|
| 1 | 代码编辑回写后端 | P0 | 中 | 最违反直觉的"假保存"，后端改动小 |
| 2 | 版本历史 UI | P1【P2】 | 中 | 后端数据已就绪，纯前端 + 1 个 GET，且与 #1 天然联动 |
| 3 | 其余卡片全屏 | P1 | 小 | 纯前端，复用现有 Modal 模式 |
| 4 | PPT 内联浏览 | P2 | 大 | 需后端转换链路，二期 |
| 5 | 选区级对话改写 | P2 | 大 | 跨前后端闭环，二期 |

---

## 四、备注

- 标【P2】项（PPT、版本历史、选区改写）本就是二期规划，当前缺失符合预期。
- #1 与 #2 共用 `ArtifactService.append_version` 的版本机制，建议合并为一个迭代实现。
- 按项目 Vibe Coding 工作流：本计划 → Review → 实现 → 写 Summary（`vibeCodingSummary/`）。
