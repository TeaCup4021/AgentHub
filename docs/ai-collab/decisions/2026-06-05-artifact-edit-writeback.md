# 代码产物编辑回写后端 — 架构决策

**日期**：2026-06-05
**类型**：Feature & Frontend State Architecture
**影响范围**：后端 artifact 服务/路由、消息查询去重、前端 CodeCard、queryClient 单例化

---

## 背景

`CodeCard` 此前内嵌 Monaco 编辑器可改代码，但「保存」只是把内容打成 `Blob` 触发**浏览器下载**，从不回写后端。结果：用户改完看似存了，刷新页面卡片又变回 Agent 原始版本，编辑成果丢失。这是产物预览/编辑功能里最违反直觉的缺口。

目标：让代码卡的编辑像真正的「保存」——刷新后仍是改过的内容。

---

## 决策

### 决策 1：编辑 = 追加新版本，不覆盖旧行

`artifacts` 表本就有 `version` 字段，且 `ArtifactService.append_version` 已实现「同 `_mergeKey` 版本链递增」的去重逻辑。编辑保存复用这套机制：新增 `update_content(artifact_id, new_content)`，加载原 artifact → 复用其 `_mergeKey` → 在同一版本链上 `append` 一行 `version = max + 1`。

**为什么不 UPDATE 原行**：
- 保留完整编辑历史，为后续「版本历史 UI」（已规划的 P1 项）留好数据基础——后端数据天然就绪，只差前端切换器。
- 与流式重新生成、多 Agent 协作产生的版本链行为一致，读取侧只有一套「取最新版本」规则。

### 决策 2：读取侧按版本链折叠，只渲染最新版

`update_content` 追加新行后，`list_messages` 原本「拉取该消息所有 artifact 行并全部渲染」会导致**同一张卡渲染两次**（v1 + v2）。

修复：`MessageService.list_messages` 的 artifact 批查后，按 `(message_id, _mergeKey or id)` 分组，每组只保留 `version` 最大的一行。无 `_mergeKey` 的行以自身 id 为键独立保留。

这条去重对所有版本链生效（不止编辑场景），是读取侧的统一规则。

### 决策 3：内容字段合并而非整体替换

`update_content` 从旧 content 出发，剔除下划线开头的内部簿记键（`_mergeKey`/`_eventId`），叠加调用方传入的新字段，再刷新 `_mergeKey`（复用）和 `_eventId`（新值，避免被 event_id 去重拦截）。

**理由**：CodeCard 只改 `code`，但 content 还有 `language`/`fileName` 等字段。合并语义保证未触及的字段存活，调用方只需传变化的部分。

### 决策 4：queryClient 提取为模块级单例

`CodeCard` 保存成功后需 `invalidateQueries(["messages", convId])` 触发刷新。原本 `queryClient` 定义在 `App.tsx` 内部，组件只能通过 `useQueryClient()` hook 取用——但卡片埋在消息树深处、被孤立单元测试渲染时没有 `QueryClientProvider`，hook 直接抛 `No QueryClient set`。

决策：把 `queryClient` 抽到 `lib/queryClient.ts` 单例模块，`App.tsx` 引用它，`CodeCard` 直接 `import` 调用 `.invalidateQueries()`。

**理由**：
- 与卡片已有的 `useChatStore.getState()`（React 外取 store）风格一致——失效查询是副作用，不必走 hook。
- 免去给每个卡片单元测试都套 `QueryClientProvider` 包装。
- 单例本就是 React Query 的推荐用法，全局唯一实例无副作用。

---

## 实施

### 后端

| 改动 | 文件 | 说明 |
|------|------|------|
| `ArtifactService.update_content()` | `services/artifact.py` | 加载原 artifact → 复用 `_mergeKey` → 追加新版本行 |
| `PATCH /messages/artifacts/{artifact_id}` | `api/v1/messages.py` | 接收 `{ content }`，调用 service，404 当 artifact 不存在；返回 `ArtifactBrief` |
| `ArtifactUpdate` schema | `schemas/message.py` | `{ content: dict }` |
| 版本链折叠去重 | `services/message.py` `list_messages` | 按 `(message_id, _mergeKey or id)` 取最新版本 |

### 前端

| 改动 | 文件 | 说明 |
|------|------|------|
| `lib/queryClient.ts` 单例 | 新建 | 模块级 `QueryClient`，供组件树外调用 |
| `App.tsx` 引用单例 | `App.tsx` | 删除内部 `new QueryClient`，import 共享实例 |
| `messageApi.updateArtifact` | `lib/api.ts` | `PATCH /messages/artifacts/{id}` |
| `CodeCard` 保存回写 | `cards/CodeCard.tsx` | 持久化卡 → 调 API + 失效 `["messages"]`；fallback 卡 → 降级下载 |

### Fallback 卡的降级处理

前端文本兜底解析出的代码卡（id 以 `fallback-` 开头）没有 DB 行，无法回写。`CodeCard` 用 `isPersistable = !artifact.id.startsWith("fallback-")` 判定：可持久化的走 API 保存（toast「已保存」）；fallback 卡的「保存」按钮降级为本地下载（toast「已下载到 …」），并隐藏多余的独立下载按钮。

---

## 后果

**正面：**
- 代码卡编辑真正持久化，刷新不丢，符合用户对「保存」的直觉。
- 版本链数据完整保留，「版本历史 UI」可直接在此基础上构建。
- queryClient 单例化让卡片类组件可在 React 树外失效查询，也简化了组件测试。

**已知权衡 / 约束：**
- 编辑追加新版本会让 `artifacts` 表行数随编辑次数增长；当前无清理策略，长期可能需要版本数上限或归档。
- queryClient 单例是全局可变状态，多个独立 React 根（理论上）会共享同一缓存——本项目单根应用无此问题。
- Diff 卡的「保存文件」仍走 `files/apply-diff`（写 MinIO 文件 + 下载），与代码卡的「回写 artifact」是两条不同语义的路径，未统一。

**写入 CLAUDE.md 的规则：**
- 组件树外（卡片、工具函数、store 回调）需要失效 React Query 缓存时，import `lib/queryClient` 单例，不用 `useQueryClient()` hook。

---

## 验证清单

- [x] 后端 `app.main:app` 用 venv 正常启动，`PATCH /messages/artifacts/{id}` 路由注册
- [x] `update_content` 单测通过（版本递增、字段合并、merge_key 复用）
- [x] 既有 artifact service 测试无回归（仅 1 个 pre-existing 失败，与本次无关）
- [x] 前端 `tsc` 类型检查 0 错误
- [x] CardRenderer 单元测试通过（queryClient 单例化后不再需要 Provider 包装）
- [ ] 端到端：编辑代码卡 → 保存 → 刷新页面仍是改后内容（待用户联调确认）
