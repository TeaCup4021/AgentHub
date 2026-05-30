# AgentHub Web — AI 协作规范

## 核心原则：Spec-Driven Development

**永远不要先写代码再补文档。** 所有功能开发必须遵循：

```
讨论需求 → 输出 spec 到 docs/specs/ → review 确认 → 拆 task 到 docs/plans/ → 实现代码
```

如果特殊情况需要先写代码验证效果，验证完后必须：
1. 把增量部分回写 spec/plan 文档
2. 重新整理 task 状态
3. 确认文档和代码对齐后，再提交

## 项目架构约定

### 数据流方向（单向）

```
AppLayout (数据获取层，React Query hooks)
  ↓ props 向下传递
Sidebar / ChatArea (消费数据，不直接调 hooks)
  ↓
子组件 (ChatHeader / MessageList / ChatInput / Cards)
```

- AppLayout 是唯一的数据获取入口
- 子组件通过 props 接收数据，不直接依赖 React Query hooks
- 好处：组件可独立测试、可复用于 Storybook

### 状态管理：严格分离

| 数据类型 | 管理方式 | 例子 |
|---------|---------|------|
| 服务端状态（REST 数据） | React Query | 会话列表、消息历史、Agent 列表 |
| 流式临时状态 | Zustand chatStore | streamingContent、isStreaming |
| UI 交互状态 | Zustand uiStore / agentStore | sidebarOpen、selectedAgentIds |
| 聚合缓存状态 | Zustand dashboardStore / tokenUsageStore | agentStatuses、token 用量 |

**禁止混用：** React Query 不管 UI 状态，Zustand 不管服务端缓存。

### 组件分层

```
components/
├── layout/     # 布局 + 数据获取 + SSE 管理
├── chat/       # 聊天子组件（纯渲染，通过 props 接收数据）
├── cards/      # 可插拔产物卡片（按 artifact_type 注册）
├── agent/      # Agent 管理组件
└── settings/   # 设置页组件
```

### 卡片可插拔模式

新增产物卡片类型时：
1. 在 `types/chat.ts` 的 `MessageContent` 联合类型中添加新类型
2. 创建卡片组件 `components/cards/XxxCard.tsx`
3. 在 `CardRenderer.tsx` 注册表中加一行映射
4. MessageList 不需要改动

## 技术规范

### TypeScript

- 每次改动后运行 `npx tsc -b --noEmit`，必须零错误
- 新增类型定义在 `src/types/` 对应文件中
- 禁止使用 `any`，不确定类型时用 `unknown` + type guard

### Zustand selector 规则（重要）

```typescript
// ❌ 错误：selector 中调用会产生新引用的函数
const conversations = useChatStore((s) => s.filteredConversations());

// ✅ 正确：只订阅原始数据，用 useMemo 做派生计算
const raw = useChatStore((s) => s.conversations);
const filtered = useMemo(() => raw.filter(...), [raw]);
```

### SSE 连接管理

- 切换会话：abort 旧连接 → 建立新连接
- 断线重连：指数退避 1s/2s/4s，最多 3 次
- 组件卸载：AbortController.abort() 清理
- 用 `useRef` 保存 disconnect 函数和 streamMsgId

### Mock 数据规范

- Mock 数据统一放在 `src/mocks/` 目录
- 每个 API 端点对应一个 mock handler
- Mock 模式下不需要真实后端，但 SSE 事件序列必须完整（message_start → token → message_end）
- 后端就绪后，切一个环境变量即可切换到真实 API

## 开发流程

### 新功能开发

1. 在 `docs/specs/` 下创建 `YYYY-MM-DD-功能名.md`，描述需求范围、用户流程、组件设计、数据流
2. Review spec，确认所有细节（UI 交互、边界情况、与后端接口对齐）
3. 在 `docs/plans/` 下创建 `phase-N-功能名.md`，拆解为 task
4. 每个 task 包含：文件清单、checklist、依赖关系、对应 spec 章节
5. 按 task 逐步实现，每完成一个 task 标记为完成

### 代码生成规则

- 指定 task 实现，不写自然语言注释
- 不写 JSDoc / 多行注释 / 解释性注释
- 命名清晰即可，代码本身就是文档
- 每个 task 完成后运行类型检查

### Git 提交

- commit message 格式：`feat: 功能描述` 或 `fix: 修复描述`
- 用户明确说"提交"时才提交，不自作主张

## 当前进度

| Phase | 内容 | 状态 |
|-------|------|------|
| 1 | 类型定义 + 基础设施 | ✅ 完成 |
| 2 | P0 单聊核心链路 | ✅ 完成 |
| 3 | P1 富媒体卡片 | ✅ 完成 |
| 4 | Agent 管理 | ✅ 完成 |
| 4.5-4.7 | API 对齐 + 乐观发送 | ✅ 完成 |
| 5 | 群聊 + Orchestrator | ✅ 完成 |
| 6 | @提及 + 部署卡片 | ✅ 完成 |
| 7 | ReAct 推理可视化 | ✅ 完成 |
| 8 | Agent 仪表盘 | ✅ 完成 |
| 9 | LLM 配置 + Token 用量 | ✅ 完成 |
| P0 M1-M6 | 核心体验链路 (Markdown/shiki/自动滚底/时间戳/Toast/SSE断连) | ✅ 完成 |
| P1 M7-M15 | 体验完整度 (暗色模式/代码行号/Agent管理/消息操作/会话增强/骨架屏/响应式/输入增强/Token图表) | ✅ 完成 |
| P2 M16-M23 | 差异化亮点 (群聊全链路/ReAct面板/产物工作台/Agent对话式创建/会话分支/@提及增强/首页落地页/微动效) | 🔵 待开发 |
| UI 重构 | Semi Design 全组件迁移 (6 Phase) | ✅ 完成 |

## 与后端协作

- 前端优先使用 Mock 数据独立开发，不阻塞于后端进度
- API 接口契约以 [Orchestrator 接口契约](docs/specs/2026-05-26-orchestrator-api-contract.md) 和 [响应格式对齐约定](../docs/AgentHub%20响应格式与前后端对齐约定.md) 为准
- 后端就绪后，切换环境变量对接真实 API
- 接口字段变更需同步更新 `src/types/api.ts`
