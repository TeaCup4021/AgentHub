# Pin 消息列表显示延迟修复 — 实施总结

**日期**: 2026-06-05
**类型**: 前端缓存一致性 Bugfix

---

## 问题

前后端联调时，手动 Pin 3 条消息后点击「已固定」按钮，弹窗只显示第 1 条 Pin 的消息，过一会（一次网络往返后）才补全其余 Pin 消息。

---

## 根因

「已固定」按钮组件 `PinnedMessages.tsx` 的**计数**与**列表内容**来自两个不同数据源，且后者缓存陈旧：

| 数据 | 来源 | 时效 |
|------|------|------|
| 按钮计数 `已固定 (N)` | `chatStore.pinnedMessageIds`（store） | 即时正确 |
| 弹窗列表内容 | React Query `["pins", convId]` | 陈旧 |

- `ChatArea.handlePin` 每次 Pin 会立即 `addPinnedMessage()` 更新 store，并 `invalidateQueries(["messages"])`，但**从未 invalidate `["pins"]`**。
- React Query 默认 `staleTime: 0` 的 stale-while-revalidate 行为：再次打开弹窗时命中旧缓存 `[pin1]`，**先立即渲染旧列表**（此时 `isLoading=false`、`isFetching=true`），同时后台 refetch；请求返回后列表才补全。
- 组件的 spinner 只绑定 `isLoading`（首次无缓存），后台 refetch 走 `isFetching` 未被覆盖，所以用户看到的是残缺列表而非 loading。

`PinManager.tsx`（书签图标入口）无此问题——它每次打开都全量 `loadPins()` 并有独立 `loading` 兜底。

---

## 修改清单

### `agenthub-web/src/components/chat/PinnedMessages.tsx`

| 改动 | 说明 |
|------|------|
| `isLoading` → `isFetching` 控制 spinner | 后台 refetch 期间且无数据时显示 loading，不再渲染陈旧的部分列表 |
| useQuery 增加 `staleTime: 0` + `refetchOnMount: "always"` | 每次打开弹窗强制重新校准列表 |
| 引入 `useQueryClient`，`handleUnpin` 后 `invalidateQueries(["pins", convId])` | 组件内取消固定后缓存立即失效 |

### `agenthub-web/src/components/layout/ChatArea.tsx`

| 改动 | 说明 |
|------|------|
| `handlePin` 成功后新增 `qc.invalidateQueries({ queryKey: ["pins", activeId] })` | Pin 后「已固定」列表缓存即时失效 |
| `handleUnpin` 成功后新增同上 | Unpin 后同步失效 |

---

## 验证结果

`npx tsc -b` 通过（无类型错误）。

修复后任何 Pin/Unpin 操作都会让 `["pins", convId]` 缓存作废，下次打开弹窗直接拉取最新全量列表；即便命中旧缓存，`isFetching` 兜底也会在 refetch 完成前显示 loading 而非残缺列表。「先 1 条、过一会才全部」不再出现。

后端 Pin 为同步 `db.commit()` 落库，数据无误，本次无后端改动。

---

## 涉及文件总览

```
agenthub-web/src/components/
├── chat/PinnedMessages.tsx     ← 数据源/缓存策略修复（主因）
└── layout/ChatArea.tsx         ← Pin/Unpin 后失效 ["pins"] 缓存
```
