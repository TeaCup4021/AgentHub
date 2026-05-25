# AgentHub Web — 前端规格

## 概述

AgentHub 前端是一个以 IM 聊天为核心交互范式的多 Agent 协作平台。技术栈：React 19 + TypeScript + Vite + TailwindCSS。状态管理：Zustand（UI 状态）+ React Query（服务端状态）。流式通信：SSE。

## Requirements

### 单聊对话

系统 SHALL 支持用户与单个 Agent 进行一对一对话，包含流式消息输出。

#### Scenario: 用户发送消息并接收流式回复

- GIVEN 用户已选择一个 Agent 对话
- WHEN 用户输入消息并发送
- THEN 系统创建消息气泡，通过 SSE 连接实时接收 token 流并渲染
- AND 消息完成后 content 数组冻结，状态变为 done

#### Scenario: 切换会话断开旧连接

- GIVEN 用户正在会话 A 中接收流式消息
- WHEN 用户切换到会话 B
- THEN 系统 SHALL abort 会话 A 的 SSE 连接，建立会话 B 的 SSE 连接

#### Scenario: 断线重连

- GIVEN SSE 连接意外断开
- WHEN 连接断开
- THEN 系统 SHALL 以指数退避（1s / 2s / 4s）自动重连，最多 3 次

### 群聊 + Orchestrator 多 Agent 协作

系统 SHALL 支持群聊模式，Orchestrator 自动拆解任务并调度多 Agent 并行执行。

#### Scenario: 群聊消息自动切换 orchestrate 模式

- GIVEN 用户在群聊（type: "group"）中
- WHEN 用户发送消息
- THEN POST /messages 请求 MUST 携带 `mode: "auto_orchestrate"`

#### Scenario: 单聊消息保持 direct 模式

- GIVEN 用户在单聊中
- WHEN 用户发送消息
- THEN POST /messages 请求 MUST 携带 `mode: "direct"`

#### Scenario: Agent 状态实时更新

- GIVEN 群聊中有多个 Agent 正在执行
- WHEN SSE 推送 `agent_status` 事件
- THEN AgentProgressBar SHALL 按 agentId upsert 状态（queued / running / success / failed / timeout）
- AND 全部 Agent 完成后进度条自动清空

#### Scenario: Orcherstrator 计划展示

- GIVEN Orchestrator 返回子任务计划
- WHEN 前端收到计划消息
- THEN OrchestratorPlan 卡片 SHALL 渲染子任务列表（序号 + 描述 + @AgentName）
- AND 用户可点击「确认执行」或「调整分派」

### 富媒体卡片渲染

系统 SHALL 支持可插拔的产物卡片渲染器，按 artifact_type 路由到对应组件。

#### Scenario: 卡片类型注册

- GIVEN 新增了 CodeCard 组件
- WHEN 在 CardRenderer 注册表中添加映射 `code: CodeCard`
- THEN MessageList 收到 code 类型 artifact 时自动渲染 CodeCard
- AND MessageList 本身无需修改

#### Scenario: 流式渲染卡片

- GIVEN SSE 流中收到 `artifact` 事件
- WHEN 前端解析 artifact 的 artifact_type
- THEN 在当前消息 content 数组中插入对应的卡片组件

### Agent 管理

系统 SHALL 支持创建和管理 Agent。

#### Scenario: 表单创建 Agent

- GIVEN 用户点击 Sidebar 的创建 Agent 按钮
- WHEN 用户填写名称、System Prompt、能力标签、工具集并提交
- THEN 系统调用 POST /agents 创建 Agent
- AND 创建成功后关闭模态框

### @提及

系统 SHALL 支持在 ChatInput 中通过 `@` 触发 Agent 提及补全。

#### Scenario: @触发补全

- GIVEN ChatInput 获得焦点
- WHEN 用户输入 `@` 字符
- THEN 弹出 Agent 提及下拉列表，支持模糊搜索
- AND 选中后插入 `@AgentName ` 到输入框

### SSE 流式协议

系统 SHALL 处理 6 种 SSE 事件类型，组装消息 content 数组。

#### Scenario: 完整消息生命周期

- GIVEN 用户发送消息
- WHEN SSE 推送 message_start → token → (artifact) → message_end
- THEN 前端 SHALL 依次创建空白气泡 → 增量追加文本 → 插入卡片 → 冻结 content

#### Scenario: 错误处理

- GIVEN Agent 执行异常
- WHEN SSE 推送 error 事件
- THEN 系统 SHALL 显示错误提示，标记重试状态

### 状态管理分离

系统 SHALL 严格分离三种状态：服务端数据用 React Query、流式临时状态用 Zustand chatStore、UI 交互状态用 Zustand uiStore。

#### Scenario: Zustand selector 规则

- GIVEN 组件需要从 Zustand store 订阅数据
- WHEN 使用 selector
- THEN selector MUST 只订阅原始数据，禁止调用会产生新引用的函数
- AND 派生计算 MUST 在组件内用 useMemo 完成

### 数据流方向

AppLayout SHALL 是唯一的数据获取入口，子组件通过 props 接收数据，不直接调用 React Query hooks。

#### Scenario: 数据流向

- GIVEN AppLayout 获取了 agents 列表
- WHEN Sidebar 需要 agents 数据
- THEN AppLayout SHALL 通过 props 传递给 Sidebar
- AND Sidebar 不得直接调用 useAgents hook

### 类型安全

系统 SHALL 确保每次改动后 `npx tsc -b --noEmit` 零错误。

#### Scenario: 禁止 any

- GIVEN 需要定义不确定类型
- WHEN 编写 TypeScript 代码
- THEN 禁止使用 `any`，不确定时 MUST 使用 `unknown` + type guard

### Mock 数据独立开发

系统 SHALL 支持前端独立于后端开发，通过 Mock 数据模拟所有 API 响应和 SSE 事件序列。

#### Scenario: Mock SSE 事件序列

- GIVEN 后端未就绪
- WHEN 前端使用 Mock 模式
- THEN SSE 事件序列 MUST 完整（message_start → token → message_end）
- AND 切换环境变量即可切换到真实 API
