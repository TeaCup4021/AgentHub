# Diff 卡片双栏审阅视图实施计划

日期: 2026-06-09
对应 spec: `docs/specs/2026-06-09-diff-card-side-by-side-review.md`

## Task 1: Diff 数据模型

- [x] 在 `src/lib/diff.ts` 中新增双栏行模型。
- [x] 将连续删除/新增配对为修改行。
- [x] 输出真实新增/删除统计。
- [x] 为修改行生成简单行内变化片段。

## Task 2: 双栏展示组件

- [x] 新增 `SideBySideDiffViewer.tsx`。
- [x] 渲染源代码和修改后两个板块。
- [x] 支持折叠长上下文。
- [x] 保持行号、标记符、代码文本稳定对齐。

## Task 3: DiffCard 集成

- [x] 移除 Monaco DiffEditor 主体依赖。
- [x] 保留应用到源文件、另存、全屏、恢复大小、冲突处理。
- [x] 将标题栏统计改为真实 diff 统计。

## Task 4: 样式与验证

- [x] 在 `src/index.css` 补充双栏 diff 样式。
- [x] 运行 `npx.cmd tsc -b --noEmit`。
- [x] 修复类型错误。
