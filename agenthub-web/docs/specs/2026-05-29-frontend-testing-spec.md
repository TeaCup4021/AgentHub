# 前端测试方案

日期：2026-05-29 | 状态：待 review

---

## 一、现状

- `package.json` 无测试脚本，0 个测试文件
- 依赖已安装：vitest + @testing-library/react + @testing-library/jest-dom + @testing-library/user-event + jsdom

---

## 二、测试技术栈

| 工具 | 用途 | 选型理由 |
|------|------|---------|
| **Vitest** | 测试运行器 + 断言 | Vite 原生兼容，零配置启动，API 兼容 Jest |
| **@testing-library/react** | 组件渲染 + 查询 | React 官方推荐，按用户行为测试 |
| **@testing-library/jest-dom** | DOM 断言扩展 | `toBeInTheDocument()` 等语义化匹配器 |
| **@testing-library/user-event** | 用户交互模拟 | 模拟真实键盘/鼠标事件 |
| **jsdom** | DOM 环境 | 无头浏览器环境，比 happy-dom 更接近真实 DOM |

---

## 三、测试规范

### 3.1 文件组织

```
src/
├── __tests__/                  # 全局测试辅助
│   └── setup.ts                # vitest setup（全局配置）
├── stores/
│   ├── chatStore.ts
│   └── __tests__/
│       └── chatStore.test.ts
├── lib/
│   ├── mentionParser.ts
│   └── __tests__/
│       └── mentionParser.test.ts
├── components/
│   ├── chat/
│   │   └── __tests__/
│   │       ├── ChatInput.test.tsx
│   │       └── MessageList.test.tsx
│   └── cards/
│       └── __tests__/
│           └── CardRenderer.test.tsx
```

规则：`__tests__/` 与被测文件同级，文件名 = 被测文件名 + `.test.ts(x)`。

### 3.2 命名规范

```typescript
describe("chatStore", () => {
  describe("initStreamingMessage", () => {
    it("应该创建新的流式消息条目并设置 isStreaming=true", () => { ... });
    it("应该保留已存在的其他流式条目", () => { ... });
  });
});
```

模式：`describe("模块") → describe("函数/方法") → it("应该xxx")`。中文 `应该` 开头，描述行为而非实现。

### 3.3 覆盖率目标

| 类型 | 目标 | 说明 |
|------|------|------|
| Store actions | 100% | 每个 action 至少一条用例，覆盖边界 |
| 纯函数工具 | 100% | 每个分支路径 |
| API 层 | 80% | Mock 拦截器验证请求/响应格式 |
| 组件 | 60% | 核心交互路径 + 边界渲染 |
| SSE | 60% | 事件解析 + Mock 流工厂 |

不追求数字覆盖率。关键链路（消息发送流、SSE 事件解析、@提及输入）必须有测试，纯渲染组件（骨架屏、空状态）可跳过。

### 3.4 不测试的内容

- Semi UI / Tailwind 的样式是否正确（框架已测）
- React Router 路由跳转（e2e 层面测）
- recharts 图表渲染（库已测）
- `dangerouslySetInnerHTML` 的内容（Shiki 输出）

---

## 四、测试分层与优先级

### P0 — 核心业务逻辑（必须有）

| 模块 | 文件 | 用例数 | 理由 |
|------|------|--------|------|
| **chatStore** | `stores/chatStore.ts` | ~15 | 流式内容管理 + 连接状态 + @提及 + pendingPlan，所有聊天功能依赖 |
| **mentionParser** | `lib/mentionParser.ts` | ~8 | @提及是群聊核心交互，纯函数最易测 |
| **utils** | `lib/utils.ts` | ~6 | formatRelativeTime 等多处使用 |
| **SSE 解析** | `lib/sse.ts` | ~6 | 事件路由 + abort 逻辑 |

### P1 — 数据处理层

| 模块 | 文件 | 用例数 | 理由 |
|------|------|--------|------|
| **agentStore** | `stores/agentStore.ts` | ~4 | Agent 选择逻辑 |
| **uiStore** | `stores/uiStore.ts` | ~4 | 主题持久化 |
| **tokenUsageStore** | `stores/tokenUsageStore.ts` | ~5 | 成本计算 + 累加逻辑 |
| **dashboardStore** | `stores/dashboardStore.ts` | ~4 | Agent 状态 upsert |
| **formatTime** | `lib/formatTime.ts` | ~4 | 时间格式化 |
| **exportConversation** | `lib/exportConversation.ts` | ~2 | Markdown 导出 |

### P2 — 组件渲染

| 组件 | 文件 | 用例数 | 理由 |
|------|------|--------|------|
| **ChatInput** | `ChatInput.tsx` | ~8 | 最复杂组件：@提及补全、Enter 发送、输入法、字数统计 |
| **MessageList** | `MessageList.tsx` | ~5 | 消息渲染 + 时间分隔 + 滚动 |
| **CardRenderer** | `CardRenderer.tsx` | ~5 | 卡片路由注册表 |
| **ThinkingBlock** | `ThinkingBlock.tsx` | ~3 | 步骤状态渲染 |
| **HighlightedCode** | `HighlightedCode.tsx` | ~2 | Shiki 加载 + 折叠 |

---

## 五、具体测试用例

### 5.1 chatStore

```typescript
describe("initStreamingMessage", () => {
  it("应该创建新条目并设 isStreaming=true");
  it("应该保留其他条目的内容");
});

describe("appendStreamToken", () => {
  it("应该在已有内容后追加 delta");
  it("对不存在的 messageId 应无操作");
});

describe("appendThinkingStep", () => {
  it("应该为新的 phase+text 追加步骤");
  it("同 phase+text 的步骤应原地更新状态(status: running→done)");
});

describe("finalizeStreamingMessage", () => {
  it("应该从 streamingContent 中移除条目");
  it("应该设置 isStreaming=false");
});

describe("setPendingQuote", () => {
  it("应该设置引用消息");
  it("传 null 时清除引用");
});

describe("setPendingPlan", () => {
  it("应该设置待确认计划");
  it("传 null 时清除计划");
});

describe("连接状态管理", () => {
  it("setConnectionStatus 应更新状态");
  it("setRetryCount 应更新重试计数");
  it("初始状态应为 'connected' + count=0");
});
```

### 5.2 mentionParser

```typescript
describe("parseMentions", () => {
  it("纯文本无 @ 应返回单个 text segment");
  it("@完整Agent名 应解析为 mention segment");
  it("多个 @Agent 应正确分段");
  it("@不存在的Agent 应保留为文本");
  it("@部分匹配不应解析(@Cla 不是 @Claude Code)");
  it("Agent 名长度降序匹配（@Claude Code 优先于 @Claude）");
  it("空字符串返回空数组");
});

describe("mentionsFromText", () => {
  it("应提取所有被 mention 的 Agent ID");
  it("同一 Agent 多次出现应去重");
});
```

### 5.3 SSE (lib/sse.ts)

```typescript
describe("createSSEStream", () => {
  it("应调用 fetch 正确的 URL");
  it("prompt 存在时应添加到 query params");
  it("事件名未注册时应静默忽略(如 message 映射到 token)");
  it("JSON 解析失败时不应崩溃");
  it("返回的 abort 函数应能取消请求");
  it("Mock 模式启用时应调用 mockSSE 而非 fetch");
});
```

### 5.4 tokenUsageStore

```typescript
describe("addUsage", () => {
  it("新会话应创建新条目");
  it("追加同一会话应累加 Token 计数和费用");
  it("应追加 TokenEvent 到 events 数组并带时间戳");
});

describe("estimateCost", () => {
  it("claude-sonnet-4-6 应使用 $3/$15 每百万定价");
  it("未知模型应使用默认定价 $2.5/$10");
  it("零 Token 应返回 $0");
});
```

### 5.5 ChatInput 组件

```typescript
describe("ChatInput", () => {
  it("空内容时发送按钮应禁用");
  it("Enter 键应触发 onSend");
  it("组合输入中 Enter 不应触发发送 (compositionstart)");
  it("输入 @ 应弹出 Agent 补全列表");
  it("选择补全项应插入 mention chip");
  it("超过字数限制时发送按钮应禁用");
  it("disabled 模式下点击应触发 onStop");
  it("pendingQuote 存在时显示引用条");
});
```

### 5.6 MessageList 组件

```typescript
describe("MessageList", () => {
  it("应渲染所有消息");
  it("间隔超 5 分钟的消息之间应显示时间分隔条");
  it("streaming 消息应显示流式气泡");
  it("isWaiting 时显示等待动画（三点弹跳）");
  it("orchestrator 消息 + pendingPlan 应渲染 OrchestratorPlan");
});
```

### 5.7 CardRenderer

```typescript
describe("CardRenderer", () => {
  it("code artifactType 应渲染 CodeCard");
  it("diff artifactType 应渲染 DiffCard");
  it("未知 artifactType 应返回 null");
});
```

---

## 六、Vitest 配置

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    css: false,                       // 不解析 CSS
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

`setup.ts` 内容：

```typescript
import "@testing-library/jest-dom/vitest";
```

`package.json` 新增 scripts：

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

---

## 七、执行计划

| 阶段 | 内容 | 预估 | 产出 |
|------|------|------|------|
| Phase 1 | 配置 vitest + setup + 写 P0 纯函数测试 | 1h | vitest.config.ts + mentionParser + utils + formatTime 测试 |
| Phase 2 | P0 Store 测试 | 1h | chatStore + agentStore + uiStore 测试 |
| Phase 3 | P1 Store + SSE 测试 | 1h | tokenUsageStore + dashboardStore + sse 测试 |
| Phase 4 | P2 组件测试 | 2h | ChatInput + MessageList + CardRenderer + HighlightedCode |

---

## 八、开发流程集成

1. **改代码前** → 确保已有测试通过 `npm test`
2. **加新功能** → 先写测试，再写实现（TDD 核心链路）
3. **修 Bug** → 先写能复现 Bug 的测试，再修代码
4. **提交前** → `npx tsc -b --noEmit && npm test` 双零才算完成
5. **不考虑覆盖率数字** → 关注关键路径是否被覆盖
