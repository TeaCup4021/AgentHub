# Diff 卡「应用到源文件」— 启发式回链源产物 架构决策

**日期**：2026-06-05
**类型**：Feature & Frontend Heuristic Matching
**影响范围**：前端 DiffCard、新增 `lib/diffApply.ts` 纯函数模块、后端选区改写指令增强
**关联**：[产物代码编辑回写后端](2026-06-05-artifact-edit-writeback.md)（复用其 `update_content` 版本链）、选区改写闭环（`vibeCodingSummary/对话式局部修改-选区级改写-summary.md`）

---

## 背景

选区级改写闭环落地后，Agent 能针对用户选中的代码片段返回一张 **Diff 卡**。但链路缺最后一环：**改动无法落回**第一次生成的源代码卡（如 `quicksort.py`）。

`DiffCard` 原有的「保存文件」按钮名不副实——它调 `files/apply-diff` 把 `newCode` 当作**一个全新文件**写进 MinIO 并触发下载，与会话里那张源代码卡**零关联**。用户看到 diff 后无法"接受"它，只能手动复制粘贴回代码卡再保存，违反直觉。

目标：在 Diff 卡上提供「应用到源文件」——一键把改动写回对应的源代码卡（追加新版本，刷新保留）。

---

## 核心难点：diff 卡不携带我方 artifact id

要写回，先得知道"写回哪张卡"。但：

- Diff 卡是后端 `artifact_detector` 从 **Agent 输出的 `<artifact type="diff">`** 解析出来的。
- **Agent 从来看不到我们的 DB artifact id**，自然不会在 diff 里回填源卡 id。
- 因此 diff 卡和源代码卡之间**没有任何显式外键关联**。

只能靠**启发式匹配**把 diff 回链到候选源卡。

---

## 决策

### 决策 1：匹配以「片段内容」为最强信号，文件名为次要线索

`lib/diffApply.ts` 的 `findApplyTarget(diff, candidates)` 匹配顺序：

1. **若 diff 带 `fileName`** → 先把候选收窄到同名代码卡；否则候选为全部代码卡。
2. **在候选池里找"代码实际包含 diff 的 `oldCode`（改前片段）"的那张卡** → 这是最强信号。命中后把 `newCode` splice 进该卡全文。
3. **文件名匹配上、但片段定位不到** → 退化为「整文件替换」，用 `newCode` 覆盖同名卡全文（`filename-full`）。
4. 都不中 → 返回 `no-match`，提示用户手动复制。

**为什么不以文件名为主**：选区改写产出的 diff **经常没有 `file=` 属性**（Agent 只盯着那段代码改），纯文件名匹配会大面积失败。而 `oldCode` 是用户选中的原片段、必然出现在源卡里，内容匹配在选区场景下命中率最高。文件名只在 Agent 恰好带了 `file=` 时作为收窄手段。

### 决策 2：片段定位用「精确子串 + 空白容忍逐行匹配」两段式

`applySnippet(source, oldSnippet, newSnippet)`：

1. **精确子串** `source.indexOf(oldSnippet)` —— 最快、最准。
2. **失败则逐行匹配**：把片段按行 `trim` 后，在源码里找连续若干行（逐行 `trim` 后）全等的区段，命中则把这段替换为 `newSnippet`。

**理由**：DOM 选区（`window.getSelection().toString()`）常丢掉首行缩进或带上行尾空白，精确匹配会脆。逐行 `trim` 比较容忍这类空白噪声，又不至于跨行误配。

### 决策 3：写回复用 `update_content` 版本链，不新开端点

命中源卡后，直接调既有的 `PATCH /messages/artifacts/{id}`（`ArtifactService.update_content`），把 splice 后的**全文**作为该卡的**新版本**追加。与代码卡编辑回写走同一条路径和语义（编辑=追加新版本、读取去重取最新）。无需新增后端端点。

### 决策 4：纯函数与 React/缓存解耦

匹配与 splice 全部放在 `lib/diffApply.ts`，**不依赖 React、queryClient、artifact 类型**——入参是朴素的 `CodeCandidate[]` 和 `{ fileName, oldCode, newCode }`，出参是 `{ target, newFullCode, matchType }` 或 `{ error }`。`DiffCard` 只负责"从缓存收集候选 → 调纯函数 → 调 API"。

**理由**：匹配逻辑是这个功能里最易错、最值得测的部分，解耦后可脱离组件单测（11 个用例覆盖精确/容忍/文件名/内容/无匹配各分支）。

### 决策 5：缓存读取走 `queryClient` 单例，且不可再 reverse

`DiffCard` 同样深埋消息树，收集候选用 `queryClient.getQueryData(["messages", convId])`（单例，非 `useQueryClient()` hook，遵循既有规则）。

**易错点**：该缓存是**最新消息在前**（后端 `ORDER BY created_at DESC`），`ChatArea` 仅在**渲染**时 `.flatMap().reverse()`。直接读缓存按原顺序遍历即为"最新在前"，**不能再 reverse**——否则"多张同名卡时取最近一张"会反向取到最旧。（实现中一度误加 reverse，已纠正并写入 CLAUDE.md 规则。）

### 决策 6：后端指令增强，提升两条匹配路径命中率

`_SELECTION_EDIT_DIRECTIVE` 加码要求 Agent：
- 在 diff 带 `file="<源文件名>"`（喂文件名匹配）；
- `--- before` 段**逐字复制**原片段（喂内容匹配的精确子串）。

这是"尽力而为"的提示，不保证 Agent 遵守，所以前端两段式匹配仍是兜底主力。

---

## 实施

| 改动 | 文件 | 说明 |
|------|------|------|
| 新增纯函数模块 | `agenthub-web/src/lib/diffApply.ts` | `findApplyTarget` / `applySnippet` / 类型 `CodeCandidate`·`DiffApplyResult`·`DiffApplyFailure` |
| 「应用到源文件」按钮 + 收集候选 + 写回 | `agenthub-web/src/components/cards/DiffCard.tsx` | `gatherCodeCandidates(convId)` 从缓存取代码卡 → `findApplyTarget` → `PATCH` + 失效 `["messages"]`；原「保存文件」更名「另存为文件」 |
| 选区改写指令增强 | `backend/app/services/artifact_format.py` | `_SELECTION_EDIT_DIRECTIVE` 要求带 `file=` + 逐字复制 before 段 |
| 单测 | `agenthub-web/src/lib/__tests__/diffApply.test.ts` | 11 用例：精确/空白容忍 splice、文件名收窄、内容匹配、整文件退化、无候选/无匹配 |
| 更新陈旧断言 | `agenthub-web/src/components/cards/__tests__/CardRenderer.test.tsx` | 「保存文件」更名后改断言「应用到源文件」+「另存为文件」 |

---

## 后果

**正面：**
- Diff 卡有了真正的"接受改动"通道，选区改写闭环完整：选中 → 描述 → Agent diff → 一键写回源卡（刷新保留）。
- 匹配逻辑纯函数化、可单测，回归风险低。
- 复用版本链，diff 写回与代码卡编辑是同一套持久化语义，无第二套规则。

**已知权衡 / 约束：**
- 启发式匹配非 100% 可靠：Agent 大幅重排、改动跨越多个不连续片段、或同一文件有多张内容高度相似的卡时，可能匹配不中或匹配错。已通过"无匹配明确提示 + 保留手动复制兜底"降级，不静默失败。
- `filename-full`（整文件替换）分支在 Agent 返回的是完整文件而非片段时才安全；若 Agent 只返回片段又恰好带了文件名但 `oldCode` 没对上，会误把整卡覆盖成片段。当前依赖 `oldCode` 匹配优先级在前来规避，但属潜在锐角。
- fallback 卡（`fallback-` 前缀、无 DB 行）无法写回，只能提示手动复制。
- 与 Diff 卡的「另存为文件」（写 MinIO 新文件）是两条并存路径，语义不同，未统一。

**写入 CLAUDE.md 的规则：**
- 回链 Agent 产出的 artifact 到我方源产物：禁止假设输出带我方 DB id，以内容匹配为最强信号；读 `["messages"]` 缓存注意其"最新在前"、不要再 reverse。

---

## 验证清单

- [x] `diffApply.ts` 单测 11 用例全绿（各匹配/失败分支）
- [x] 前端 `tsc -b` 0 错误
- [x] 前端 `vitest run` 全量 104 用例绿（更名后修 CardRenderer 断言）
- [x] 后端 `test_artifact_format.py` 绿（指令增强未破坏 sentinel 检测）
- [ ] 端到端：选区改写得 diff 卡 → 点「应用到源文件」→ 源卡变更 + 刷新保留（待用户联调确认）
