# Vibe Coding 工作流程

## 概览

每个开发日严格遵循以下闭环：

```
Plan → Review → Implement → Summarize
```

目标是确保所有开发行为与 20 天计划对齐，并与前后端约定保持一致。

---

## Phase 1: 生成执行计划（Plan）

1. 打开 `AgentHub-后端开发20天实施计划.md`，定位**指定日期**的**指定任务**。
2. 从该任务提炼当天执行目标与范围。
3. **遵循** `docs/response-and-alignment-conventions.md` 中的响应格式与对齐规范。
4. 使用 `.vibe-coding/plan-template.md` 作为模板，生成执行计划并存放到 `vibeCodingPlan/`。

**Plan 文件命名规范：**
```
vibeCodingPlan/AgentHub-后端{A|B}-Day{NN}-{主题}.md
```

---

## Phase 2: 用户确认（Review）

1. 将生成的 Plan 提交给用户检查。
2. **只有用户明确确认后**，才进入实现阶段。

---

## Phase 3: 实施（Implement）

1. 读取将要修改的代码并理解上下文。
2. **严格按 Plan 执行**（类名、方法签名、路径、验收标准必须一致）。
3. **必须遵循** `docs/response-and-alignment-conventions.md` 中的所有对齐要求：
   - 统一响应包裹 `{ code, data, message }`
   - snake_case 存储 + camelCase 序列化
   - 分页格式、日期格式、SSE 事件规范等
4. 实现后进行必要验证（导入检查、接口可见性、响应格式）。

---

## Phase 4: 写总结（Summarize）

1. 使用 `.vibe-coding/summary-template.md` 作为结构模板。
2. 总结内容必须符合 `docs/response-and-alignment-conventions.md` 的约定表述。
3. 将总结存放到 `vibeCodingSummary/`。

**Summary 文件命名规范：**
```
vibeCodingSummary/AgentHub-后端{A|B}-Day{NN}-{主题}.md
```

---

## 每日开始前检查清单

- [ ] 指定日期与角色（后端 A / 后端 B）已确认
- [ ] 已从 `AgentHub-后端开发20天实施计划.md` 提取当日任务
- [ ] `vibeCodingPlan/` 中 Plan 文件已生成
- [ ] 用户已确认 Plan
- [ ] `vibeCodingSummary/` 中尚无当日总结（如已有，则当天任务视为完成）
