# Phase: Plan Interaction Redesign — 计划交互重构

**日期**: 2026-06-01  
**对应 Spec**: [2026-06-01-plan-interaction-redesign.md](../specs/2026-06-01-plan-interaction-redesign.md)  
**状态**: completed

---

## 任务列表

### T1: 类型修复 (G3) — `planner_agent_id` → `plannerAgentId`

**文件**: `src/lib/api.ts`, `src/components/layout/ChatArea.tsx`  
**依赖**: 无  
**状态**: completed

- [ ] `SendMessageRequest.planner_agent_id` 改为 `plannerAgentId`
- [ ] ChatArea.tsx 第269行 `planner_agent_id` 改为 `plannerAgentId`
- [ ] ChatArea.tsx 第270行移除 `as any`

### T2: Planner Select 替换 (G4) — 原生 `<select>` → Semi Design `<Select>`

**文件**: `src/components/layout/ChatArea.tsx`  
**依赖**: 无  
**状态**: completed

- [ ] 引入 `Select` from `@douyinfe/semi-ui`
- [ ] 替换 ChatArea.tsx 第600-622行原生 `<select>` 为 Semi `<Select>`
- [ ] 样式匹配现有设计

### T3: 计划消息嵌入 MessageBubble

**文件**: `src/components/chat/MessageList.tsx`  
**依赖**: T1  
**状态**: completed

- [ ] `MessageBubble` 中判断 `contentType === "plan"`
- [ ] 渲染 `OrchestratorPlan` 组件（传入 `onEdit`, `onRefine`, `onConfirm` 回调）
- [ ] 计划消息样式与普通气泡一致

### T4: OrchestratorPlan 重构 — 消息气泡样式 + 编辑态 + 三个按钮 (G1, G2)

**文件**: `src/components/chat/OrchestratorPlan.tsx`  
**依赖**: T3  
**状态**: completed

- [ ] 移除悬浮卡片样式，适配消息气泡容器
- [ ] 新增"对话修改"按钮，触发 `onRefine`
- [ ] 编辑态：Textarea + Select + 增删改 + 取消/保存
- [ ] 确认执行按钮保留
- [ ] `onRefine` 属性被实际使用（修复 TS6133）

### T5: ChatArea 重构 — 计划融入消息流 + refine_plan 自动附加 (G1)

**文件**: `src/components/layout/ChatArea.tsx`  
**依赖**: T2, T3, T4  
**状态**: completed

- [ ] 移除第635-641行 `OrchestratorPlan` 悬浮渲染
- [ ] 从 `filteredMessages` 派生 `displayMessages`，注入 pendingPlan 为合成消息
- [ ] `handleSend` 中判断 `pendingPlan` 非空时自动附加 `mode: "refine_plan"` + `plan_id`
- [ ] 新增 `handleRefinePlan` callback，切换输入框提示文本

### T6: 类型检查 + 回归验证

**文件**: 全部  
**依赖**: T1-T5  
**状态**: completed

- [ ] `npx tsc -b --noEmit` 零错误
- [ ] `npx vitest run` 全部通过
- [ ] 确认无 TS6133 (unused variable) 错误

---

## 依赖图

```
T1 (类型修复) ──┬──→ T3 (消息气泡) ──→ T4 (OrchestratorPlan)
                │                        │
T2 (Select) ────┘                        │
                                         ▼
                                    T5 (ChatArea)
                                         │
                                         ▼
                                    T6 (验证)
```
