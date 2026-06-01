# Phase: 计划卡片视觉优化

**日期**: 2026-06-01  
**对应 Spec**: [2026-06-01-plan-card-visual.md](../specs/2026-06-01-plan-card-visual.md)  
**状态**: in_progress

---

## 任务列表

### T1: OrchestratorPlan 全面配色替换

**文件**: `src/components/chat/OrchestratorPlan.tsx`  
**依赖**: 无  
**状态**: pending

- [ ] 数字圈：蓝底白字 → 灰底(`#e5e7eb`)深灰字(`#6b7280`)
- [ ] Agent 名：蓝色 → `#4b5563` 深灰
- [ ] 确认按钮：`theme="solid"` 蓝 → 自定义深灰 `#1f2329` 填充
- [ ] 手动编辑：`theme="light"` 蓝描边 → 自定义灰描边
- [ ] 对话修改：`theme="borderless"` 蓝字 → 灰字 `#9ca3af` + 对话图标
- [ ] 任务列表底：`var(--color-bg-hover)` → 白底 + 淡灰分割线
- [ ] 编辑中标签：橙色 → 灰色标签
- [ ] 编辑态行底色：和预览行明显区分
- [ ] 模式标签：蓝色 → 灰色徽章
- [ ] 删除按钮：`type="danger"` 红 → 灰 ×，hover 变淡红
- [ ] `npx tsc -b --noEmit` 零错误
- [ ] `npx vitest run` 全部通过
