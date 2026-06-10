# Phase 9 — LLM 配置 + Token 用量面板

日期：2026-05-26 | 状态：待确认

---

## 1. 需求范围

### 1.1 设置页面（SettingsPage）

新增 `/settings` 路由，提供独立的设置页面，包含两大区域：

**LLM 配置区域：**
- 管理多个 AI 模型服务商的 API Key（Anthropic、OpenAI、DeepSeek）
- 支持启用/禁用各服务商
- 支持拖动/按钮调整服务商优先级（主模型不可用时自动切换备用）
- API Key 显示/隐藏切换
- 数据持久化到 localStorage（`llm_config`）

**Token 用量面板：**
- 总览卡片：输入 Token 总量、输出 Token 总量、预估成本
- 按会话分组的用量明细列表（会话标题、输入、输出、成本）
- 按 Token 总量降序排列
- 数据来源：从 SSE `message_end` 事件的 `usage` 字段累积

### 1.2 tokenUsageStore

新增 Zustand store 集中管理 Token 用量数据：

- `usageMap`: 按 conversationId 索引的累计用量
- `addUsage`: 累加一次对话完成的 usage 数据
- `getAll`: 获取所有会话的用量列表
- 同一会话多次对话时自动累加（inputTokens/outputTokens/totalTokens/estimatedCost 全部累计）

### 1.3 Sidebar 设置入口

在 Sidebar 底部增加「设置」按钮，点击跳转 `/settings`。

---

## 2. 用户流程

### 2.1 LLM 配置流程

```
用户点击 Sidebar 底部「设置」
  → 进入 /settings 页面
  → 在 LLM 配置区域看到三个服务商卡片
  → 填入 API Key → 自动存储到 localStorage
  → 启用/禁用 → 实时更新
  → 调整优先级 → 上下箭头移动卡片位置
  → 离开页面再回来，配置保留
```

### 2.2 Token 用量流程

```
用户完成一次对话
  → SSE message_end 携带 usage 数据
  → ChatArea 在 onMessageEnd 中调用 addUsage
  → tokenUsageStore 累加该会话的 Token/成本
  → 用户访问 /settings
  → TokenUsagePanel 读取 getAll() 展示统计数据
```

---

## 3. 组件设计

### 3.1 SettingsPage

| 项目 | 说明 |
|------|------|
| 布局 | `max-w-2xl mx-auto py-8 px-4 space-y-8` |
| 标题 | "设置" |
| 子组件 | LLMConfigSection + TokenUsagePanel |

### 3.2 LLMConfigSection

| 项目 | 说明 |
|------|------|
| 默认服务商 | Anthropic（enabled, priority 1）、OpenAI（disabled, priority 2）、DeepSeek（disabled, priority 3） |
| 持久化 | localStorage key: `llm_config` |
| 卡片内容 | 启用复选框 + 服务商名称 + 优先级数字 + 上下调整按钮 |
| API Key 输入 | password 类型 + 显示/隐藏切换 |
| 状态标签 | 启用/禁用 + 优先级排序 |

### 3.3 TokenUsagePanel

| 项目 | 说明 |
|------|------|
| 总览卡片 | 三列 grid：输入 Token(k)、输出 Token(k)、预估成本($) |
| 明细表格 | 四列表头（会话、输入、输出、成本）+ 按 totalTokens 降序 |
| 空状态 | "暂无用量数据，完成对话后自动统计" |
| 数据来源 | useTokenUsageStore.getAll() |

### 3.4 tokenUsageStore

```typescript
interface TokenUsage {
  conversationId: string;
  conversationTitle: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number; // USD
}
```

- 使用 zustand `create`，无持久化（重启后清零，未来可迁移到后端统计）
- `addUsage` 对同一 conversationId 做累加

### 3.5 Sidebar 设置入口

- 在侧边栏底部（`border-t` 分隔线下方）
- 齿轮图标 + "设置" 文字
- 使用 `useNavigate` 跳转到 `/settings`

---

## 4. 数据流

```
SSE message_end.usage
  → ChatArea onMessageEnd
  → tokenUsageStore.addUsage({ conversationId, conversationTitle, inputTokens, outputTokens, ... })
  → usageMap 更新
  → TokenUsagePanel 响应渲染

localStorage llm_config
  → LLMConfigSection useState 初始化
  → 用户修改 → setState + localStorage.setItem
  → LLMConfigSection 重渲染
```

---

## 5. 边界情况

- **无 Token 数据的 message_end**：usage 字段可能不存在，仅当 `data.usage` 存在时才记录
- **同一会话多次对话**：累加而非覆盖，总计持续增长
- **llm_config localStorage 损坏**：try-catch 读取，fallback 到默认配置
- **API Key 为空**：正常显示空输入框，不做必填校验
- **成本计算精度**：保留 4 位小数（USD 精度要求）
- **设置页路由**：仅需 `/settings`，不需要嵌套在 AppLayout 中（独立页面，不用 Sidebar 包裹）

---

## 6. 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/components/settings/SettingsPage.tsx` | 设置页面壳 |
| 新建 | `src/components/settings/LLMConfigSection.tsx` | LLM 配置区域 |
| 新建 | `src/components/settings/TokenUsagePanel.tsx` | Token 用量面板 |
| 新建 | `src/components/settings/index.ts` | barrel 导出 |
| 新建 | `src/stores/tokenUsageStore.ts` | Token 用量状态管理 |
| 修改 | `src/App.tsx` | 添加 /settings 路由 |
| 修改 | `src/components/layout/Sidebar.tsx` | 底部添加设置入口 |
| 修改 | `src/components/layout/ChatArea.tsx` | onMessageEnd 集成 usage 记录 |

## 7. 不复用已有代码

- AppLayout 不包裹 SettingsPage（设置页是独立页面，不需要 Sidebar）
- tokenUsageStore 是新的 Zustand store，与现有的 chatStore/dashboardStore/uiStore/agentStore 职责不重叠
- 不从现有 agentStore 读取模型价格信息（使用内置价格常量）
