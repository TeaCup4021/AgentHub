# 2026-05-26 前端 P0 核心体验链路 完成总结

## 1. 环境变更与基础设施

- **新增依赖**：`react-markdown`, `remark-gfm`, `rehype-raw`, `shiki`, `sonner`
- **新增文件**：
  - `src/components/chat/MarkdownBubble.tsx` — react-markdown 封装组件
  - `src/components/chat/HighlightedCode.tsx` — shiki 代码高亮共享组件
  - `src/lib/formatTime.ts` — 时间格式化工具函数
- **项目结构**：`src/components/chat/` 新增 2 个组件，`src/lib/` 新增 1 个工具

## 2. 完成的模块

| 模块 | 内容 | 涉及文件数 |
|------|------|-----------|
| M1 | Markdown渲染 + shiki代码高亮 | 4 |
| M2 | 消息列表自动滚底 + 浮动按钮 | 2 |
| M3 | 消息时间戳分组 + hover tooltip | 2 |
| M4 | 全局Toast通知（sonner） | 4 |
| M5 | Mock新对话模板生成 | 2 |
| M6 | SSE断连重试 + Banner | 3 |

## 3. 测试结果

- **类型检查**：`npx tsc -b --noEmit` 零错误
- **Markdown渲染**：表格/列表/引用/代码块在消息气泡中正确渲染
- **shiki高亮**：17种语言正确高亮，代码折叠（>30行）+ 一键复制可用
- **自动滚底**：新消息自动smooth滚动，向上浏览时浮动"↓N"按钮，点击回底
- **时间戳**：5分钟间隔分组，"今天/昨天/周X/MM-DD HH:mm"格式，hover精确到秒
- **Toast**：发送失败（含重试按钮）、Agent创建成功/失败、删除失败回滚
- **Mock模板**：新Agent无预设数据时自动生成引用用户输入的SSE流回复
- **SSE断连**：`mock_fail_mode=sse_disconnect` 触发黄色重连Banner（1/3→2/3→3/3）→红色失败Banner + 重连/关闭按钮
- **失败模拟**：`mock_fail_mode=message/agent/delete` 四种场景可测试

## 4. 消息发送失败UI

- 乐观插入消息标记为 `status: "failed"`
- 气泡显示红色 `!` 头像 + 红底边框 + "发送失败" 标签
- sonner toast 含重试按钮

## 5. 下一步

- 前端P1：暗色模式、代码块增强、Agent管理完整化、消息操作、会话功能补全、响应式、Token图表
- shadcn/ui 迁移：等P1完成后统一升级UI体系
