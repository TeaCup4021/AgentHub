# Pin 状态前端单一数据源原则 — 架构决策

**日期**：2026-06-05
**类型**：Bug Fix & Frontend State Architecture
**影响范围**：前端 Pin 消息状态管理（PinnedMessages、MessageActions、MessageList、ChatArea）

---

## 背景

Pin 消息功能在前后端联调中接连暴露三个状态不同步 BUG，根因相同：**同一份 Pin 状态在 UI 上有多个视图，但数据来源混用了 Zustand store 和 React Query，写操作只更新了部分数据源。**

后端侧无问题：pin/unpin 为同步 `db.commit()` 落库，`message_pins` 关联表数据始终正确。所有问题都在前端的状态一致性。

### Pin 状态的多个视图与原数据源

| 视图 | 位置 | 原数据源 | 时效 |
|------|------|----------|------|
| 「已固定」按钮计数 | `PinnedMessages.tsx` | store `pinnedMessageIds` | 即时 |
| 「已固定」弹窗列表 | `PinnedMessages.tsx` | React Query `["pins", convId]` | 滞后/陈旧 |
| 消息左侧蓝边框 | `MessageList.tsx` | store `pinnedMessageIds` | 即时 |
| 消息右上角书签角标 | `MessageList.tsx` | `message.isPinned`（`["messages"]` 字段） | 滞后 |
| 右键菜单 Pin/取消 | `MessageList.tsx` | `message.isPinned` | 滞后 |
| 悬浮 Pin 按钮高亮 | `MessageActions.tsx` | store `pinnedMessageIds` | 即时 |

`message.isPinned` 由后端 `list_messages` 批量查 `MessagePin` 表后写入每条消息，**只有 `["messages"]` query 重新拉取才会变化**。

---

## 根本原因分析

### BUG 1：「已固定」列表"先 1 条、过一会才全部"

`ChatArea.handlePin` 每次 pin 立即 `addPinnedMessage()` 更新 store、并 `invalidateQueries(["messages"])`，但**从未 invalidate `["pins"]`**。React Query 默认 `staleTime: 0` 的 stale-while-revalidate 行为：再次打开弹窗命中旧缓存 `[pin1]`，先立即渲染旧列表（`isLoading=false`、`isFetching=true`），同时后台 refetch，请求返回后才补全。组件 spinner 只绑 `isLoading`，后台 refetch 走 `isFetching` 未被覆盖，所以用户看到残缺列表而非 loading。

### BUG 2：取消 pin 后右上角角标残留

右上角角标用 `message.isPinned`、左边框用 store。从「已固定」弹窗取消 pin 时，`PinnedMessages.handleUnpin` 只 `removePinned()`（更新 store）+ invalidate `["pins"]`，**没有 invalidate `["messages"]`**。于是 store 即时更新（左边框消失、计数减 1），但 `message.isPinned` 仍是旧的 `true`，角标不消失。

### BUG 3：悬浮 Pin 按钮入口漏刷 query

`MessageActions.handlePin` 只更新 store，`["messages"]` 和 `["pins"]` 两个 query 都没刷新。与之对比，右键菜单走的 `ChatArea.handleUnpin` 回调有刷 `["messages"]`——同一动作的不同入口行为不一致。

---

## 决策

### 原则：同一状态的所有视图绑定单一即时数据源

**Pin 状态以 Zustand store `pinnedMessageIds` 为单一真相来源（single source of truth）。** 理由：store 更新是同步的，React Query 字段更新要等一次网络往返，二者并存必然产生"边框已变、角标未变"的时间窗。

### 实施

| 改动 | 文件 | 说明 |
|------|------|------|
| 右上角角标、右键菜单 `isPinned` 改用 store 派生值 `isPinnedByStore` | `MessageList.tsx` | 与左边框、计数、悬浮按钮统一，彻底消除双数据源 |
| 弹窗 useQuery 加 `staleTime: 0` + `refetchOnMount: "always"`，spinner 改用 `isFetching` 兜底 | `PinnedMessages.tsx` | 每次打开强制校准；refetch 期间且无数据时才显示 loading，不渲染陈旧部分列表 |
| 所有 pin/unpin 入口统一 `invalidateQueries(["pins"])` + `["messages"])` | `PinnedMessages.tsx`、`MessageActions.tsx`、`ChatArea.tsx` | 兜底层：即使展示性字段（如列表的 `content_preview`）仍依赖 query，写操作后也会及时校准 |

### 双保险策略

- **治本**：纯状态指示（角标/边框/计数/按钮高亮）一律走 store，不依赖 query 字段。
- **兜底**：需要后端附加信息的视图（如弹窗列表的消息预览文本、发送者）仍走 query，但所有写操作在所有入口同时失效相关 query key。

---

## 顺带变更：支持 Pin 用户消息

`MessageList.tsx` 右键菜单触发条件移除 `!isUser` 守卫。后端 pin 端点不校验 `sender_type`，悬浮 Pin 按钮本就对用户消息可用，右键菜单是被前端守卫单独挡掉的另一个入口。角标已对用户消息显示（store 派生值不带 `!isUser`）。左边框仍保留 `!isUser`——用户消息右对齐，左边框高亮视觉对不上，角标已足够指示。

---

## 后果

**正面：**
- Pin 状态所有视图严格同步，消除三类不一致 BUG。
- 单一数据源降低后续维护时的认知负担——改 pin 逻辑只需关心 store。

**约束（已写入 CLAUDE.md 纠正类规则）：**
- 同一状态多视图时，优先绑定 store；写操作必须在所有入口同时失效所有相关 query key。

**已知权衡：**
- 弹窗列表的展示文本仍依赖 `["pins"]` query（store 只存 `message_id`，不含 `content_preview`）。若未来要完全摆脱该 query，需在 store 中冗余存储预览文本，当前判断不值得。

---

## 验证清单

- [x] `npx tsc -b` 通过
- [x] 连续 pin 多条 → 打开「已固定」即时显示全部，无"先 1 条"
- [x] 弹窗内取消 pin → 角标、边框、计数同步消失
- [x] 悬浮按钮 pin/unpin → 列表与消息视图同步
- [x] 右键菜单可 pin 用户消息，角标正常出现在用户气泡右上角
