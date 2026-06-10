# Spec: Plan Interaction Redesign — 计划交互重构

**日期**: 2026-06-01  
**状态**: review  
**关联**: G1 (refine_plan 对话式修改), G2 (内联编辑), G3 (类型修复), G4 (Planner Select 组件替换)

---

## 动机

当前 OrcherstratorPlan 作为悬浮卡片渲染在消息列表上方（ChatArea.tsx:586-623），有以下问题：

1. **G1** — `refine_plan` 模式无前端实现，用户无法通过对话修改计划
2. **G2** — 计划编辑仅有"调整分派"按钮触发全局事件，无真正内联编辑 UI
3. **G3** — `SendMessageRequest` 使用 snake_case `planner_agent_id`，导致 `as any` 类型绕过
4. **G4** — Planner 选择器使用原生 `<select>`，未使用 Semi Design 组件

## 设计原则

引用 Claude Code、Devin 2.0、Cursor 等主流平台的共识：
- **计划是对话的产物，应该留在对话里**（不作为独立弹窗）
- **修改计划靠说话，手动编辑是辅助**
- **不暴露 DAG 依赖拓扑给用户**（由 Planner 负责）

## 交互方案

### 核心改动：计划卡片嵌入消息流

OrchestratorPlan 从"消息列表上方悬浮"改为"消息流中的一条特殊消息气泡"。

```
消息列表
├── 👤 用户消息
├── 🤖 计划消息 (OrchestratorPlan 作为消息)
│   ├── 子任务列表
│   ├── [对话修改] [手动编辑] [确认执行]
│   └── 状态标注 (预览态 / 修改中 / 已确认)
├── 👤 refine 消息（可选）
├── 🤖 更新后的计划消息
└── 💬 输入区域
```

### 计划卡片状态机

```
预览态 (preview)
  ├── 用户点"手动编辑" → 编辑态 (editing)
  │     ├── "保存修改" → 预览态（本地更新，不发后端）
  │     └── "取消" → 预览态（丢弃修改）
  │
  ├── 用户点"对话修改" 或 直接发送消息 → 修改态 (refining)
  │     ├── SSE 返回新 plan_draft → 新预览态消息出现
  │     └── 用户可继续对话修改
  │
  └── 用户点"确认执行" → 执行中 (executing)
        └── agent 回复气泡出现在下方
```

### 对话式修改 (G1)

当 `pendingPlan` 非空时，用户发送的任何消息自动附加 `mode: "refine_plan"` + `plan_id`。

- 用户无需感知"进入修改模式"
- 后端返回新 plan_draft 时，消息列表中新增一条计划消息
- 计划消息按时间线排列，用户可追溯修改历史

### 内联编辑 (G2)

点击"手动编辑"后，OrchestratorPlan 进入编辑态：
- 每行子任务的 instruction 变为 `<Textarea>`（Semi Design）
- agent 分配变为 `<Select>`（Semi Design，从 agents 列表加载）
- 每行有删除按钮 `[✕]`
- 底部有 `[+ 添加子任务]` 按钮
- `[取消]` / `[保存修改]` 按钮
- 不暴露 dependsOn

### 类型修复 (G3)

`SendMessageRequest.planner_agent_id` → `plannerAgentId`，移除 `as any` 类型断言。

### Planner Select 替换 (G4)

ChatArea.tsx 中原生 `<select>` 替换为 Semi Design `<Select>` 组件。

---

## 文件变更范围

| 文件 | 改动 |
|------|------|
| `src/components/chat/OrchestratorPlan.tsx` | 重构为消息气泡样式 + 编辑态 + 三个按钮 |
| `src/components/layout/ChatArea.tsx` | 移除悬浮渲染，计划作为消息类型渲染；G4 替换 Select；G1 refine_plan 逻辑；移除 `as any` |
| `src/components/chat/MessageList.tsx` | 支持渲染计划消息类型 |
| `src/types/chat.ts` | 消息类型可能需扩展 `contentType: "plan"` |
| `src/lib/api.ts` | `planner_agent_id` → `plannerAgentId` (G3) |
| `src/stores/chatStore.ts` | pendingPlan 逻辑可能需调整（计划多版本支持） |

---

## 接口对齐

### SSE 事件

| 事件 | 已有 | 前端处理 |
|------|:----:|------|
| `message_start` (mode=auto_orchestrate) | ✅ | 开始组消息气泡 |
| `message_start` (mode=refine_plan) | ✅ | 同上 |
| `token` / `artifact` / `thinking` | ✅ | 流式渲染 |
| `agent_status` | ✅ | AgentProgressBar 更新 |
| `message_end` (finish_reason=plan_draft) | ✅ | 生成计划消息气泡 |
| `error` | ✅ | 错误提示 |

### POST /messages 发送模式

| mode | 触发方式 | 实现 |
|------|------|------|
| `auto_orchestrate` | 用户在群聊中发送消息 | ✅ 已实现 |
| `direct` | 用户在单聊中发送消息 | ✅ 已实现 |
| `refine_plan` | 有 pendingPlan 时发送消息 | ❌ 前端未实现 → G1 |
| `confirm_plan` | 用户点"确认执行" | ✅ 已实现 |

---

## 非目标

- 拖拽排序子任务（不需要，Planner 负责排序）
- 暴露 dependsOn/DAG 给用户（不需要）
- 修改后端 API 契约

---

## 验收标准

1. 计划卡片作为消息气泡出现在对话流中，而非悬浮在消息列表上方
2. 用户可在有 pending plan 时直接说话来修改计划（自动 refine_plan）
3. 点击"手动编辑"进入编辑态，可增删改子任务，保存后本地更新
4. "确认执行"后 SSE 执行结果出现在消息流中
5. `npx tsc -b --noEmit` 零错误，无 `as any` 绕过
6. Planner 选择器使用 Semi Design `<Select>` 组件
7. 所有现有功能不受影响（单聊、群聊、@提及等）
