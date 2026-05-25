# Phase 6 实施计划 — @提及 + 部署卡片

## Task 1: DeployStatusCard 组件 + 注册 ✅
**依赖**: 无  
**文件**:
- 新建 `src/components/cards/DeployStatusCard.tsx`
- 修改 `src/components/cards/CardRenderer.tsx`（加一行注册）
- 修改 `src/components/cards/index.ts`（重新导出）

**Checklist**:
- [x] 实现 DeployStatusCard 三种状态视图（building/deployed/failed）
- [x] 类型安全：从 artifact.content 提取 DeployStatusArtifactContent
- [x] 在 CardRenderer 注册 deploy_status → DeployStatusCard
- [x] 在 cards/index.ts 重新导出

---

## Task 2: @mention 下拉补全 (ChatInput) ✅
**依赖**: 无  
**文件**:
- 修改 `src/components/chat/ChatInput.tsx`

**Checklist**:
- [x] ChatInput 新增 `agents` prop
- [x] 检测 `@` 输入位置 → 提取 mentionQuery
- [x] 渲染 Agent 下拉列表（绝对定位）
- [x] 键盘导航：↑↓ Enter Esc
- [x] 选中后插入 `@AgentName ` 到光标位置
- [x] 无匹配时显示"无匹配的 Agent"

---

## Task 3: ChatArea 串联 @mention 解析 ✅
**依赖**: Task 1, Task 2  
**文件**:
- 修改 `src/components/layout/ChatArea.tsx`

**Checklist**:
- [x] 传入 `agents` 给 ChatInput
- [x] handleSend 中解析 content 中的 `@AgentName` 模式
- [x] 映射 AgentName → agentId，组装 `mentions` 数组
- [x] 传给 messageApi.send 的 mentions 字段

---

## Task 4: Mock SSE 添加 deploy_status 事件 ✅
**依赖**: Task 1  
**文件**:
- 修改 `src/mocks/sse.ts`

**Checklist**:
- [x] 在模拟 SSE 流中追加 deploy_status artifact 事件
- [x] 模拟 building → deployed 状态变化

---

## Task 5: 类型检查 + 验收 ✅
**依赖**: Task 1-4  
**Checklist**:
- [x] `npx tsc -b --noEmit` 零错误
- [x] 功能验证
