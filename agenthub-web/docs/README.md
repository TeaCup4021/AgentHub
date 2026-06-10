# AgentHub 文档索引

按实际开发顺序整理，从上到下依次推进。

---

## 一、总体设计（开发前必读）

| 文档 | 说明 |
|------|------|
| [2026-05-21-agenthub-frontend-design.md](specs/2026-05-21-agenthub-frontend-design.md) | **前端产品设计方案** — 项目概述、功能范围(P0/P1/P2)、组件架构、数据流、SSE 协议、Orchestrator 交互、决策记录、OpenAkita 借鉴分析 |
| [AgentHub-前端实施计划书-v2.md](AgentHub-前端实施计划书-v2.md) | **实施计划书 v2.0** — P0/P1/P2 共 23 个模块的完整 task 拆解、依赖安装汇总、后端协作备忘 |
| [AgentHub前端优化任务清单.md](AgentHub前端优化任务清单.md) | **P0/P1/P2 优化任务清单** — 23 个模块的现状 vs 目标表，按优先级分级 |

---

## 二、基础设施层（Phase 1-3）

| 文档 | 说明 |
|------|------|
| [phase-1-types-and-infra.md](plans/phase-1-types-and-infra.md) | **Phase 1 计划** — 类型对齐、React Query hooks、SSE 重构、chatStore/agentStore 纯 UI 化 |
| [phase-2-single-chat.md](plans/phase-2-single-chat.md) | **Phase 2 计划** — ChatArea 拆分为 ChatHeader + MessageList + ChatInput，SSE 流式渲染 |
| [phase-3-rich-cards.md](plans/phase-3-rich-cards.md) | **Phase 3 计划** — CodeCard / DiffCard / PreviewCard / FileCard + CardRenderer 可插拔注册表 |

---

## 三、前后端 API 对齐（三轮迭代）

| 文档 | 说明 |
|------|------|
| [phase-4.5-alignment-fix.md](plans/phase-4.5-alignment-fix.md) | **第一轮对齐计划** — Agent/Message/Conversation 基本字段修复 |
| [2026-05-24-api-alignment-round2.md](specs/2026-05-24-api-alignment-round2.md) | **第二轮对齐 Spec** — cursor 分页、artifactType 改名、SendMessageRequest 字段、204 响应 |
| [phase-4.6-api-alignment-round2.md](plans/phase-4.6-api-alignment-round2.md) | **第二轮对齐计划** — 具体 task 拆解 |
| [phase-4.7-optimistic-send.md](plans/phase-4.7-optimistic-send.md) | **乐观发送计划** — 消息发送乐观更新 + 失败回滚 |
| [2026-05-25-api-alignment-round3.md](specs/2026-05-25-api-alignment-round3.md) | **第三轮对齐 Spec** — verify/pin/unpin 响应类型修正、avatarUrl 去 null |

---

## 四、群聊 + Agent 协作（Phase 4-6）

| 文档 | 说明 |
|------|------|
| [phase-4-agent-management.md](plans/phase-4-agent-management.md) | **Phase 4 计划** — CreateAgentModal 表单 + Sidebar 集成 |
| [2026-05-25-phase4-completion-phase6-enhancement.md](specs/2026-05-25-phase4-completion-phase6-enhancement.md) | **Phase 4 补全 + Phase 6 增强 Spec** — 新建对话 Agent 选择器、头像 Popover/右键菜单、@mention chip 渲染 |
| [phase-4-completion-phase6-enhancement.md](plans/phase-4-completion-phase6-enhancement.md) | **Phase 4 补全计划** — 对应 task 拆解 |
| [2026-05-25-phase-5-group-chat.md](specs/2026-05-25-phase-5-group-chat.md) | **Phase 5 Spec** — OrchestratorPlan 卡片、AgentProgressBar、ChatArea group mode 集成 |
| [phase-5-group-chat.md](plans/phase-5-group-chat.md) | **Phase 5 计划** |
| [2026-05-25-phase6-at-mention-deploy-card.md](specs/2026-05-25-phase6-at-mention-deploy-card.md) | **Phase 6 Spec** — @mention 自动补全、DeployStatusCard |
| [phase-6-at-mention-deploy-card.md](plans/phase-6-at-mention-deploy-card.md) | **Phase 6 计划** |
| [2026-05-25-at-mention-ux-closed-loop.md](specs/2026-05-25-at-mention-ux-closed-loop.md) | **@mention 体验闭环 Spec** — chip 可视化、多词 Agent 名解析修复、单聊 @ 其他 Agent 智能切换 |
| [at-mention-ux-closed-loop.md](plans/at-mention-ux-closed-loop.md) | **@mention 闭环计划** |

---

## 五、面板扩展（Phase 7-9）

| 文档 | 说明 |
|------|------|
| [phase-7-thinking-visualization.md](plans/phase-7-thinking-visualization.md) | **Phase 7 计划** — ThinkingBlock ReAct 推理可视化 + SSE `thinking` 事件 |
| [2026-05-26-phase8-agent-dashboard.md](specs/2026-05-26-phase8-agent-dashboard.md) | **Phase 8 Spec** — AgentDashboard 可展开面板 + dashboardStore 集中管理 |
| [phase-8-agent-dashboard.md](plans/phase-8-agent-dashboard.md) | **Phase 8 计划** |
| [2026-05-26-phase9-llm-config-token-usage.md](specs/2026-05-26-phase9-llm-config-token-usage.md) | **Phase 9 Spec** — /settings 路由、LLMConfigSection、TokenUsagePanel、tokenUsageStore |
| [phase-9-settings-panels.md](plans/phase-9-settings-panels.md) | **Phase 9 计划** |

---

## 六、P0/P1/P2 统一 Spec（2026-05-26 重构）

Phase 1-9 完成后，重新按体验层级整理为三个优先级。这些 Spec 与上面各 Phase 有重叠，但视角不同（面向用户体验而非技术模块）。

| 文档 | 说明 |
|------|------|
| [2026-05-26-p0-core-experience.md](specs/2026-05-26-p0-core-experience.md) | **P0 核心体验** — M1 Markdown+shiki、M2 自动滚底、M3 时间戳、M4 sonner Toast、M5 Mock 新对话、M6 SSE 断连重试 |
| [2026-05-26-p1-experience-completeness.md](specs/2026-05-26-p1-experience-completeness.md) | **P1 体验完整度** — M7 暗色模式、M8 代码块增强、M9 Agent 管理完整化、M10 消息操作栏、M11 会话搜索/批量/导出、M12 骨架屏/空状态、M13 响应式/拖拽分隔线、M14 粘贴图片/拖拽/字数统计、M15 Token 图表 |
| [2026-05-26-p2-highlights.md](specs/2026-05-26-p2-highlights.md) | **P2 差异化亮点** — M16 群聊全链路、M17 ReAct 推理面板、M18 产物工作台、M19 Agent 对话式创建、M20 会话分支、M21 @提及增强(task_hints)、M22 首页落地页、M23 微动效 |

**P0 Plan 文件：**

| 文档 | 对应模块 |
|------|---------|
| [2026-05-26-p0-m1-markdown.md](plans/新增内容/2026-05-26-p0-m1-markdown.md) | M1 — Markdown + shiki 代码高亮 |
| [2026-05-26-p0-m2-autoscroll.md](plans/新增内容/2026-05-26-p0-m2-autoscroll.md) | M2 — 消息列表自动滚底 |
| [2026-05-26-p0-m3-timestamps.md](plans/2026-05-26-p0-m3-timestamps.md) | M3 — 消息时间戳 |
| [2026-05-26-p0-m4-toast.md](plans/2026-05-26-p0-m4-toast.md) | M4 — 全局 Toast |
| [2026-05-26-p0-m5-mock-template.md](plans/2026-05-26-p0-m5-mock-template.md) | M5 — Mock 新对话模板 |

---

## 七、接口契约

| 文档 | 说明 |
|------|------|
| [2026-05-26-orchestrator-api-contract.md](specs/2026-05-26-orchestrator-api-contract.md) | **Orchestrator 前后端接口契约** — plan/summary SSE meta 结构、confirm_plan 请求格式、agent_status subtask_id 追踪、完整 SSE 时序、TypeScript 类型定义 |

---

## 八、OpenSpec 规范（结构化需求管理）

| 文档 | 说明 |
|------|------|
| [agenthub-web.md](openspec/specs/agenthub-web.md) | OpenSpec 主规范 |
| [agent-management/spec.md](openspec/changes/phase4-agent-management/specs/agent-management/spec.md) | Agent 管理 spec |
| [at-mention/spec.md](openspec/changes/phase4-agent-management/specs/at-mention/spec.md) | @提及 spec |

---

## 九、UI 重构 Design Token + 卡片升级 (2026-05-27)

| 文档 | 说明 |
|------|------|
| [2026-05-27-design-token-refactor.md](specs/2026-05-27-design-token-refactor.md) | **Design Token 体系重构 Spec** — Semi DSM 对齐 + 飞书风格双主题 |
| [2026-05-27-diff-card-upgrade.md](specs/2026-05-27-diff-card-upgrade.md) | **Diff 卡片升级 Spec** — 可拖拽 resize、分割线、reset 按钮 |
| [2026-05-27-interaction-experience.md](specs/2026-05-27-interaction-experience.md) | **交互体验升级 Spec** — 三层递进 |
| [2026-05-27-onboarding-wizard.md](specs/2026-05-27-onboarding-wizard.md) | **Onboarding 引导流程 Spec** — 待实现 |
| [2026-05-27-project-workspace.md](specs/2026-05-27-project-workspace.md) | **多项目工作区 Spec** — 待实现 |
| [2026-05-27-frontend-implementation-summary.md](specs/2026-05-27-frontend-implementation-summary.md) | **前端实现清单** — 各模块完成状态汇总 |

## 十、代码审查与路线图 (2026-05-29)

| 文档 | 说明 |
|------|------|
| [2026-05-29-bug-list-and-fix-plan.md](specs/2026-05-29-bug-list-and-fix-plan.md) | **Bug 清单与修复计划** — 13 个 Bug 分 P0/P1/P2 三级，含根因分析、修复方案、执行顺序 |
| [2026-05-29-feature-backlog.md](specs/2026-05-29-feature-backlog.md) | **功能补全待办清单** — 18 项待开发功能，按 P1/P2/新规范 分类，标注依赖关系 |
| [2026-05-29-development-roadmap.md](specs/2026-05-29-development-roadmap.md) | **开发路线图** — 7 轮执行序列（Bug → P1 → P2 → 新规范），含时间估算和甘特图 |
| [2026-05-29-frontend-testing-spec.md](specs/2026-05-29-frontend-testing-spec.md) | **前端测试方案** — Vitest + Testing Library 技术栈、测试规范、分层策略、具体用例、配置和集成流程 |

---

## 十一、开发日志与验证

| 文档 | 说明 |
|------|------|
| [开发日志.md](开发日志.md) | **全流程开发日志** — Phase 1 到 Phase 6 的问题记录和架构决策：React 无限重渲染、消息顺序反转、乐观更新位置错误、contentEditable vs textarea、mention 解析 bug |
| [verification-checklist.md](plans/verification-checklist.md) | **验证清单** — 各阶段验收项 |
| [README.md](plans/README.md) | **实施计划总览** — Phase 列表、执行顺序、文件结构 |

---

## 快速导航

**按角色查找：**

- **新人上手** → 先读「一、总体设计」两个文档
- **了解当前进度** → 看「六、P0/P1/P2」三个 Spec，对比「十一、开发日志」
- **查找接口定义** → 「七、接口契约」+ 「三、API 对齐」
- **实现新功能** → 找到对应 Phase 的 Spec + Plan，按 task 逐条实现
- **排查问题** → 「十一、开发日志」记录了主要的坑和解决方案

**按开发阶段查找：**

| 阶段 | 状态 | 核心文档 |
|------|------|---------|
| Phase 1-3（基础设施） | ✅ 完成 | phase-1/2/3 plans |
| Phase 4-6（群聊+Agent） | ✅ 完成 | phase-4/5/6 specs + plans |
| Phase 7-9（面板扩展） | ✅ 完成 | phase-7/8/9 specs + plans |
| P0（核心体验链路） | ✅ 完成 | 2026-05-26-p0-core-experience.md |
| P1（体验完整度） | ✅ 完成 | 2026-05-26-p1-experience-completeness.md — 2026-05-30 全量完成 |
| P2（差异化亮点） | ✅ 6/8 完成 | 2026-05-26-p2-highlights.md — M16-M19, M22-M23 已实现；M20 会话分支、M21 task_hints 待开发 |
| 代码审查 | 📋 2026-05-29 | 13 个 Bug + 18 项功能 → [路线图](specs/2026-05-29-development-roadmap.md) |
| 前后端对齐 | ✅ 2026-05-30 | [对齐差距分析](specs/2026-05-30-frontend-backend-alignment-gaps.md) — 34 个端点全量审计 |
| 群聊集成排查 | ✅ 2026-05-30 | [Bug 排查报告](specs/2026-05-30-group-chat-integration-bugs.md) — 群聊前后端集成前审查 |
