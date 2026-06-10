# AI 协作文档物理分类迁移总结

## 1. 背景

用户指出 `context-index.md` 本身未来也会变长，从而重新制造上下文压力。因此本次将 `docs/ai-collab/` 现有文件按类型和功能进行物理分类，让目录结构承担第一层上下文路由。

## 2. 完成内容

- 新增分类目录：
  - `docs/ai-collab/contracts/`
  - `docs/ai-collab/runtime/`
  - `docs/ai-collab/playbooks/`
  - `docs/ai-collab/playbooks/debug/`
  - `docs/ai-collab/reference/`
  - `docs/ai-collab/decisions/*/`
- 移动现有 `ai-collab` 文件到对应目录。
- 为根目录和各分类目录补充短 README。
- 将 `context-index.md` 移入 `reference/`，标记为历史索引。
- 更新 `docs/` 和 `archive/` 中的旧路径引用。
- 新增 Vibe Graph 链路：
  - `SPEC-AICOLLAB-DOC-TAXONOMY-001`
  - `PLAN-AICOLLAB-DOC-TAXONOMY-001`
  - `TASK-AICOLLAB-DOC-TAXONOMY-001`
  - `TRACE-AICOLLAB-DOC-TAXONOMY-001`

## 3. 迁移后的读取方式

后续 AI 应按以下顺序读取：

1. `docs/ai-collab/README.md`
2. 目标子目录的 `README.md`
3. 与需求直接相关的具体文件

通常不需要读取超过 1 个子目录。

## 4. 关键取舍

没有保留旧路径 stub 文件。原因是 stub 会制造重复入口，后续 AI 仍可能把旧入口和新入口都读进上下文。

## 5. 验证

已运行：

```text
python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
```

结果：通过，0 errors，0 warnings。
