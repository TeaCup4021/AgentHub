# 开发路线图 — Bug 修复 + 功能补全顺序

2026-05-29

---

## 说明

本文档将 [Bug 清单](./2026-05-29-bug-list-and-fix-plan.md) 和 [功能待办](./2026-05-29-feature-backlog.md) 合并为一个按优先级排序的执行序列。

每轮完成后跑 `npx tsc -b --noEmit`，零错误再进入下一轮。

---

## 第 1 轮：堵漏 — 影响功能可用性的 Bug (预计 1 天)

| 序号 | 编号 | 任务 | 文件 | 预估 |
|------|------|------|------|------|
| 1.1 | B4 | 修复中文输入法 Enter 误发送 | `ChatInput.tsx` | 15min |
| 1.2 | B3 | Mock SSE subtask_id 同一 Agent 复用 | `mocks/sse.ts` | 15min |
| 1.3 | B1 | 暂时禁用图片粘贴（或完善发送链路） | `ChatInput.tsx` | 30min |
| 1.4 | B2 | SSE 断连后保留已有流式内容 | `ChatArea.tsx` | 30min |
| 1.5 | B9 | cursor 分页 hasMore 逻辑修正 | `mocks/handlers.ts` | 20min |
| 1.6 | B10 | 重试计数统一用 zustand store | `ChatArea.tsx` | 20min |

---

## 第 2 轮：提效 — 影响日常使用感受的 Bug (预计 0.5 天)

| 序号 | 编号 | 任务 | 文件 | 预估 |
|------|------|------|------|------|
| 2.1 | B5 | MarkdownBubble components 提取为模块常量 | `MarkdownBubble.tsx` | 10min |
| 2.2 | B7 | 补全暗色模式 CSS 变量 | `App.tsx` | 20min |
| 2.3 | B8 | 验证输入框聚焦在切换会话时的表现 | `ChatInput.tsx` | 10min |
| 2.4 | B6 | 搜索高亮改为 DOM 层标记 | `MessageList.tsx` | 30min |
| 2.5 | B13 | shouldFail 改用计数器控制 | `mocks/handlers.ts` | 15min |

---

## 第 3 轮：补齐 P1 体验 — 用户高频接触的功能 (预计 2-3 天)

| 序号 | 编号 | 任务 | 文件 | 预估 |
|------|------|------|------|------|
| 3.1 | F3 | 消息操作栏：悬停显示复制/引用/重新生成 | `MessageActions.tsx` + `ChatInput.tsx` | 1天 |
| 3.2 | F2 | 代码块增强：标题栏 + 复制按钮 + 折叠 | `HighlightedCode.tsx` | 0.5天 |
| 3.3 | F4 | 搜索增强：命中计数 + 跳转 + 无结果提示 | `ChatArea.tsx` + `MessageList.tsx` | 0.5天 |
| 3.4 | F1 | 暗色模式完善（配合 B7 已做变量补全） | `App.tsx` + `tokens.css` | 0.5天 |
| 3.5 | F5 | 空状态引导 + 错误状态重试 | `ChatArea.tsx` + `Skeleton.tsx` | 0.5天 |
| 3.6 | F6 | Token 用量图表 | `TokenCharts.tsx` + `TokenUsagePanel.tsx` | 0.5天 |

---

## 第 4 轮：P2 独立功能 — 不依赖后端的亮点 (预计 3-4 天)

| 序号 | 编号 | 任务 | 文件 | 预估 |
|------|------|------|------|------|
| 4.1 | F12 | 首页/落地页 | 新建 `WelcomePage.tsx` + `AppLayout` 集成 | 1天 |
| 4.2 | F8 | ReAct 推理浮动面板 | 新建 `ReActPanel.tsx` + `ChatArea` 集成 | 1天 |
| 4.3 | F9 | 产物工作台 | 新建 `ArtifactWorkbench.tsx` + `ArtifactViewer.tsx` | 1天 |
| 4.4 | F11 | @提及 task_hints 增强 | `ChatInput.tsx` + `mentionParser.ts` | 0.5天 |
| 4.5 | F13 | 微动效打磨 | `index.css` + 各组件微调 | 0.5天 |

---

## 第 5 轮：P2 后端依赖 — 需后端配合完成后才能验收 (预计 2 天)

| 序号 | 编号 | 任务 | 文件 | 预估 |
|------|------|------|------|------|
| 5.1 | F7 | 群聊 Orchestrator 全链路联调 | `OrchestratorPlan.tsx` + `ChatArea.tsx` + `OrchestratorSummary.tsx` | 1.5天 |
| 5.2 | F10 | 对话分支 | 新建 `BranchDialog.tsx` | 0.5天 |

> **注意**: 第 5 轮需等待后端完成 Orchestrator Planner 两阶段协议和 branch API 端点后才能开始。

---

## 第 6 轮：新规范 — 2026-05-27 规范 (预计 5-7 天)

| 序号 | 编号 | 任务 | 文件 | 预估 |
|------|------|------|------|------|
| 6.1 | F16 | 交互体验升级 — 第 1 层（发送状态图标、悬停操作、按钮反馈） | 多组件 | 1天 |
| 6.2 | F16 | 交互体验升级 — 第 2 层（Ctrl+K 命令面板、Ctrl+Tab、斜杠命令、草稿保存） | 新组件 + `ChatInput.tsx` | 2天 |
| 6.3 | F15 | Diff 卡片升级 — shiki 高亮 + 行级标记 | `DiffCard.tsx` | 0.5天 |
| 6.4 | F16 | 交互体验升级 — 第 3 层（未读红点、@Agent 可点击、粘贴检测） | 多组件 | 1天 |
| 6.5 | F14 | Design Token 重构 — Phase 1 (迁移到 Semi token) | `tokens.css` + 15+ 组件 | 1.5天 |
| 6.6 | F14 | Design Token 重构 — Phase 2 (气泡 + 侧边栏玻璃态) | 多组件 | 1天 |
| 6.7 | F17 | Onboarding 引导（3 步向导） | 新建 3 组件 | 1天 |
| 6.8 | F18 | 多项目工作区 ⚠ 依赖后端 | 新建 projectStore + 2 组件 | 1.5天 |

> **注意**: F18 需后端项目表 + CRUD 端点。F14 涉及大面积 CSS 变更，建议在第 6 轮中靠前做以留出回归验证时间。

---

## 第 7 轮：长期保障

| 序号 | 编号 | 任务 | 文件 | 预估 |
|------|------|------|------|------|
| 7.1 | B11 | 卡片类型重构（泛型 Artifact） | `types/chat.ts` + 5 个卡片组件 | 0.5天 |
| 7.2 | B12 | 引入 vitest + 关键链路测试 | 新建测试文件 | 1天 |
| 7.3 | — | 前端性能优化（消息列表虚拟化） | `MessageList.tsx` | 1天 |
| 7.4 | — | 桌面通知（Web Notification API） | `ChatArea.tsx` | 0.5天 |

---

## 总览甘特图

```
第1轮  ████         1天   B1-B4, B9-B10 (P0 Bug)
第2轮  ██           0.5天  B5-B8, B13 (P1 Bug)
第3轮  ████████     2.5天  F1-F6 (P1 功能补齐)
第4轮  ████████████ 3.5天  F8-F9, F11-F13 (P2 独立)
第5轮  ██████       2天    F7, F10 (P2 后端依赖) ⏸ 等待后端
第6轮  ████████████████████ 6天  F14-F18 (新规范)
第7轮  ██████       2.5天  B11-B12 + 虚拟化 + 通知
```

**总计**: 约 18 天工作量（不含后端等待时间）

---

## 建议执行策略

1. **立即做第 1-2 轮**（1.5 天），消除已知 Bug，提升开发体验
2. **接着做第 3 轮**（2.5 天），把 P1 体验缺口补完，产品基本可用
3. **第 4 轮选做**，优先 F12 首页和 F13 微动效——投入小见效快
4. **第 5-6 轮**视后端进度和产品规划决定节奏
5. **第 7 轮**作为持续技术债偿还，穿插在其他轮次中
