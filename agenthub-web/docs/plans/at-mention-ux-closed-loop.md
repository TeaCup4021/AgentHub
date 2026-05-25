# @mention 体验闭环 — 实施计划

## Task 1: mentionParser 工具库 ✅
**依赖**: 无  
**文件**:
- 新建 `src/lib/mentionParser.ts`

**Checklist**:
- [x] InputSegment 类型定义
- [x] parseMentions: 按 agent 名长度降序做字面量匹配，拆分为 segments
- [x] mentionsFromText: 提取文本中所有 @AgentName 对应的 agentId[]

---

## Task 2: ChatInput 覆盖层 chip 渲染 ✅
**依赖**: Task 1  
**文件**:
- 修改 `src/components/chat/ChatInput.tsx`

**Checklist**:
- [x] 覆盖层 div 同步 textarea 文本，渲染 mention chip
- [x] textarea 文字透明，覆盖层显示彩色 chip + 普通文字
- [x] 覆盖层高度/滚动与 textarea 同步
- [x] 替换旧 mentionsFromText 为 mentionParser 版本
- [x] 修复多词 Agent 名（Claude Code）解析

---

## Task 3: MentionSwitchDialog + ChatArea 集成 ✅
**依赖**: Task 2  
**文件**:
- 新建 `src/components/chat/MentionSwitchDialog.tsx`
- 修改 `src/components/layout/ChatArea.tsx`
- 修改 `src/types/chat.ts`（UpdateConversationParams 加 type 字段）
- 修改 `src/components/chat/index.ts`（导出新组件）

**Checklist**:
- [x] MentionSwitchDialog 三种选项 UI
- [x] ChatArea handleSend 前检测外部 mentions
- [x] 选项 A: 创建新单聊并发送
- [x] 选项 B: 升级当前为群聊并发送
- [x] 选项 C: 忽略，原样发送

---

## Task 4: 类型检查 + 验收 ✅
**依赖**: Task 1-3  
**Checklist**:
- [x] `npx tsc -b --noEmit` 零错误
