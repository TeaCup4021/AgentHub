# 功能补全待办清单

代码审查日期：2026-05-29

---

## 当前进度总览

| 模块 | 完成度 | 状态 |
|------|--------|------|
| Phase 1-3 (基础设施 + 单聊 + 卡片) | 100% | 完成 |
| Phase 4 (Agent 管理) | 100% | 完成 |
| Phase 5 (群聊 + Orchestrator) | 骨架完成 | 编排全链路待后端 |
| Phase 6 (@提及 + 部署卡片) | 100% | 完成 |
| Phase 7 (ReAct 推理可视化) | 100% | 完成 |
| Phase 8 (Agent 仪表盘) | 100% | 完成 |
| Phase 9 (设置面板) | 100% | 完成 |
| P0 核心体验 | ~95% | 基本完成 |
| P1 体验完整性 | ~60% | 6/15 剩余 |
| P2 差异化亮点 | ~15% | 7/8 待做 |
| 2026-05-27 新规范 | 0% | 5 个模块待定 |

---

## 一、P1 体验完整性 — 剩余 6 项

### F1. 暗色模式完善 (P1-M7)

- **文件**: `src/App.tsx`、`src/styles/tokens.css`
- **现状**: uiStore 三态切换、Tailwind `darkMode: 'class'` 已配置
- **待做**:
  - 在 `App.tsx` 中补全 `darkColors` 对象（参照 `lightColors` 结构）
  - 确保 `--color-bg-*`、`--color-fill-*`、`--color-border-*` 系列 token 在暗色下合理
  - 在 `index.html` 的 `<html>` 上加 `class` 切换逻辑
- **预估**: 1 个文件修改

### F2. 代码块增强 (P1-M8)

- **文件**: `src/components/chat/HighlightedCode.tsx`、`src/components/cards/CodeCard.tsx`
- **现状**: shiki 语法高亮已生效
- **待做**:
  - 顶部标题栏：文件名 + 语言标签 + 一键复制按钮（接 sonner toast "已复制"）
  - 超过 30 行时默认折叠为 15 行 + "展开全部" 按钮
  - 行号显示（可选，使用 shiki transformers 的 `transformerNotationLineNumbers`）
- **预估**: 1 个组件重写

### F3. 消息操作栏完善 (P1-M10)

- **文件**: `src/components/chat/MessageActions.tsx`
- **现状**: 组件存在但功能不完整
- **待做**:
  - 悬停消息气泡时显示操作栏（复制文本 / 引用回复 / 重新生成）
  - 流式消息隐藏操作栏
  - 失败消息仅显示"重新生成"按钮
  - 引用回复：在 `ChatInput` 上方插入引用条，`chatStore.pendingQuote`
- **预估**: 1 个组件重写 + ChatInput 小幅修改

### F4. 消息搜索增强 (P1-M11a)

- **文件**: `src/components/layout/ChatArea.tsx:62-70`、`src/components/chat/MessageList.tsx`
- **现状**: 仅客户端 `filter()` 当前已加载消息
- **待做**:
  - 搜索结果在消息列表中标黄高亮（在 Markdown 渲染后做 DOM 高亮）
  - 搜索命中计数显示（"找到 3 条"）
  - 回车跳转到下一条匹配
  - 无结果时的空状态提示
- **预估**: 修改 2 个组件

### F5. 空状态与加载态完善 (P1-M12)

- **文件**: `src/components/layout/ChatArea.tsx`、`src/components/chat/Skeleton.tsx`
- **现状**: 骨架屏组件已存在
- **待做**:
  - React Query `isError` 状态下显示错误提示 + 重试按钮
  - 空对话时的引导插画（替换当前的纯文字）
  - 首次加载时骨架屏替代全屏 Spin
- **预估**: 修改 2 个组件

### F6. Token 用量图表 (P1-M15)

- **文件**: `src/components/settings/TokenCharts.tsx`、`src/stores/tokenUsageStore.ts`
- **现状**: TokenUsagePanel 用列表展示，tokenUsageStore 记录了 `TokenEvent` 时间序列
- **待做**: 用 recharts 绘制三个图表（recharts 已安装）
  - 按天的 Token 消耗面积图
  - 按 Agent 的用量饼图
  - 按对话的用量排名柱状图
- **预估**: 1 个组件重写

---

## 二、P2 差异化亮点 — 剩余 7 项

### F7. 群聊 Orchestrator 全链路 (P2-M16) ⚠ 依赖后端

- **文件**: `src/components/chat/OrchestratorPlan.tsx`、`src/components/layout/ChatArea.tsx`
- **现状**: OrchestratorPlan 卡片、AgentProgressBar 骨架存在
- **待做**:
  - 计划确认交互相应：展示子任务列表 → 用户点"确认执行"→ 发送 `mode: "confirm_plan"`
  - SSE `agent_status` 与 subtask_id 逐一对应追踪
  - 执行完成后展示 OrchestratorSummary 聚合卡片
  - 后端 Planner 两阶段协议联调
- **预估**: 3 个组件修改 + 后端配合

### F8. ReAct 推理面板 (P2-M17)

- **文件**: 新建 `src/components/chat/ReActPanel.tsx`
- **现状**: ThinkingBlock 内联在消息气泡中
- **待做**: 提取为全局可拖拽浮动面板
  - Streaming 时自动展开，新步骤高亮闪烁
  - 图钉按钮保持面板常驻
  - 可拖拽标题栏，记住位置
- **预估**: 1 个新组件 + ChatArea 集成

### F9. 产物工作台 (P2-M18)

- **文件**: 新建 `src/components/chat/ArtifactWorkbench.tsx`、`src/components/chat/ArtifactViewer.tsx`
- **现状**: 无产物聚合视图
- **待做**:
  - ChatArea 新增"产物"标签页
  - 汇总当前会话所有 Agent 产物
  - 筛选：类型（代码/差异/文件/预览/部署）+ Agent + 关键词
  - 点击放大查看（Modal 全屏）
- **预估**: 2 个新组件

### F10. 对话分支 (P2-M20) ⚠ 依赖后端

- **文件**: 新建 `src/components/chat/BranchDialog.tsx`
- **现状**: Message 类型有 `parentMessageId` 字段，后端未实现
- **待做**:
  - 在任意消息处创建新分支，可选携带上下文
  - 分支可视化（分支树指示器）
  - 需要后端 `POST /api/v1/conversations/{id}/branch` 端点
- **预估**: 1 个新组件 + 后端端点

### F11. @提及增强 (P2-M21)

- **文件**: `src/components/chat/ChatInput.tsx`、`src/lib/mentionParser.ts`
- **现状**: 基础 @mention 和 MentionSwitchDialog 已完成
- **待做**:
  - 解析 `@Agent 具体指令` 为 `task_hints` 发送
  - Agent 补全列表显示能力标签和模型信息
- **预估**: 修改 2 个文件

### F12. 首页/落地页 (P2-M22)

- **文件**: 新建 `src/components/WelcomePage.tsx`
- **现状**: 空对话时仅显示静态 starter 提示
- **待做**:
  - 快捷操作卡片：新建单聊、新建群聊、浏览 Agent、查看产物
  - 最近对话列表（取最近 3 条）
  - 可用 Agent 网格
- **预估**: 1 个新组件 + AppLayout 集成

### F13. 微动效打磨 (P2-M23)

- **文件**: 全局 CSS + framer-motion
- **现状**: framer-motion 用于消息入场动画
- **待做**:
  - 发送按钮缩放反馈 (`scale(0.95)` on click)
  - 卡片展开/收起过渡动画
  - 移动端侧边栏滑入动画
  - 骨架屏微光扫过效果
  - 流式光标平滑闪烁
  - 全部需 `@media (prefers-reduced-motion: reduce)` 降级
- **预估**: 修改 `src/index.css` + `tokens.css` + 各组件微调

---

## 三、2026-05-27 新规范 — 全部未开始

### F14. Design Token 重构 (3 Phase)

- **文件**: `src/styles/tokens.css` + 15+ 组件文件
- **Phase 1**: 将 25+ 自定义 CSS 变量迁移到 Semi 原生 token + 11 个 `--ah-` 前缀自定义 token
- **Phase 2**: 气泡重新设计（品牌蓝用户气泡 / 浅灰底 Agent 气泡）、侧边栏玻璃态 `backdrop-filter`、代码块顶栏
- **Phase 3**: 统一微动效系统（消息入场 200ms、按钮过渡 150ms、输入框聚焦 200ms）
- **风险**: 大面积 CSS 变更，容易引入 UI 回归

### F15. Diff 卡片升级

- **文件**: `src/components/cards/DiffCard.tsx`
- **待做**: 纯文本并排 → shiki 语法高亮 + 行级红绿标记 + 统计栏 + "应用修改"按钮

### F16. 交互体验升级 (3 层)

- **第 1 层 — 即时感知**:
  - 用户消息旁显示发送状态图标（时钟 → 勾号 → 脉冲点）
  - 对话列表项悬停时显示操作图标（置顶/归档/删除）
  - 全局按钮按压反馈 `:active { transform: scale(0.97) }`
- **第 2 层 — 效率操作**:
  - `Ctrl+K` 命令面板（搜索对话/Agent/命令）
  - `Ctrl+Tab` 最近 5 个对话快速切换
  - 对话列表拖拽排序
  - 输入框 `/` 斜杠命令（`/code` `/review` `/explain` `/fix` `/refactor`）
  - 输入框草稿自动保存（`chatStore.drafts`）
  - 消息多选批量操作
- **第 3 层 — 智能辅助**:
  - 对话红点 + 未读计数（`notificationStore`）
  - @Agent 名称可点击弹出 AgentDetailPopover
  - 粘贴代码自动检测并弹出"包裹为代码块"提示
  - 粘贴文件路径自动转为上下文引用

### F17. Onboarding 引导

- **文件**: 新建 3 个组件
- **待做**: 首次使用 3 步向导（欢迎 → LLM 配置 → 试用），`localStorage` 标记控制

### F18. 多项目工作区 ⚠ 依赖后端

- **文件**: 新建 `projectStore`、`useProjects` hook、`CreateProjectModal`、`ProjectSettingsModal`
- **待做**: 对话按项目分组过滤，项目切换器，需要后端项目表 + CRUD

---

## 四、汇总表

| 编号 | 功能 | 优先级 | 预估 | 依赖 |
|------|------|--------|------|------|
| F1 | 暗色模式完善 | P1 | 1 文件 | 无 |
| F2 | 代码块增强 | P1 | 1 组件 | 无 |
| F3 | 消息操作栏完善 | P1 | 2 组件 | 无 |
| F4 | 消息搜索增强 | P1 | 2 组件 | 无 |
| F5 | 空状态与加载态 | P1 | 2 组件 | 无 |
| F6 | Token 用量图表 | P1 | 1 组件 | 无 |
| F7 | 群聊 Orchestrator | P2 | 3 组件 | 后端 Planner |
| F8 | ReAct 推理面板 | P2 | 1 组件 | 无 |
| F9 | 产物工作台 | P2 | 2 组件 | 无 |
| F10 | 对话分支 | P2 | 1 组件 | 后端 branch API |
| F11 | @提及增强 | P2 | 2 文件 | 无 |
| F12 | 首页/落地页 | P2 | 1 组件 | 无 |
| F13 | 微动效打磨 | P2 | 全局 | 无 |
| F14 | Design Token 重构 | 新规范 | 15+ 文件 | 无 |
| F15 | Diff 卡片升级 | 新规范 | 1 组件 | 无 |
| F16 | 交互体验升级 | 新规范 | 多组件 | 无 |
| F17 | Onboarding 引导 | 新规范 | 3 组件 | 无 |
| F18 | 多项目工作区 | 新规范 | 4 文件 | 后端 projects API |

**总计**: 18 项待开发功能
