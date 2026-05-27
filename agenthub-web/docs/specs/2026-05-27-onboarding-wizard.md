# Spec: Onboarding 引导流程

**日期**: 2026-05-27 | **状态**: 待实现

---

## 目标

首次打开 AgentHub 时，3 步引导用户完成初始化，降低上手门槛。

---

## 触发逻辑

- `localStorage.getItem("agenthub-onboarded")` 为 null → 显示引导
- 第 3 步点"开始使用" → `localStorage.setItem("agenthub-onboarded", "true")`
- 设置页提供"重新运行引导"入口
- 跳过标记：任何步骤点"跳过"直接进入主界面

---

## 步骤设计

### Step 1 — 欢迎

```
┌──────────────────────────┐
│                          │
│       🏠 AgentHub         │
│                          │
│   多 Agent 协作代码平台   │
│                          │
│   • 多个 AI Agent 协同工作│
│   • 实时流式对话          │
│   • 代码生成 + Diff 对比  │
│                          │
│      [开始配置] [跳过]    │
└──────────────────────────┘
```

### Step 2 — 配置 LLM

```
┌──────────────────────────┐
│  配置模型提供商           │
│                          │
│  ● Anthropic Claude      │
│    API Key [___________] │
│                          │
│  ○ OpenAI GPT            │
│  ○ DeepSeek              │
│                          │
│  注：可后续在设置中修改   │
│                          │
│      [上一步] [下一步]    │
└──────────────────────────┘
```

- 提供商列表从 LLMConfigSection 复用
- API Key 保存到 localStorage（已有逻辑）
- 这一步数据写入现有的 `llm_config` localStorage key

### Step 3 — 试用

```
┌──────────────────────────┐
│  开始你的第一次对话       │
│                          │
│  ┌─ Claude Code ────────┐│
│  │                      ││
│  │ 你好，我是 Claude     ││
│  │ Code，你的代码助手。  ││
│  │ 请描述你的任务。      ││
│  │                      ││
│  └──────────────────────┘│
│                          │
│  [输入你的第一个问题...]  │
│                          │
│      [开始使用]           │
└──────────────────────────┘
```

- 自动创建第一个对话（单聊，默认选中 Step 2 配置的 Agent）
- 预发送一条欢迎消息

---

## 实现

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/components/onboarding/OnboardingWizard.tsx` | 主容器，步骤切换 |
| `src/components/onboarding/WelcomeStep.tsx` | Step 1 |
| `src/components/onboarding/ConfigStep.tsx` | Step 2，复用 LLMConfigSection 逻辑 |
| `src/components/onboarding/TryStep.tsx` | Step 3，内嵌一个简化聊天区 |

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/App.tsx` | 判断 onboarded 标记，显示引导或主界面 |
| `src/stores/uiStore.ts` | 新增 `showOnboarding: boolean` |
| `src/components/settings/SettingsPage.tsx` | 新增"重新运行引导"按钮 |

### 后端依赖

无。纯前端功能。LLM 配置沿用现有的 localStorage 持久化。
