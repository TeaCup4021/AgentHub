# Vibe Graph 三组核心能力补录总结

> 日期：2026-06-10 | 状态：已完成

## 1. 补录范围

本次按优先级补录三组已有实现且历史资产较完整的能力：

- 富媒体产物卡片。
- Diff 应用到源产物。
- 轻量级部署预览。

## 2. 新增图谱节点

### ARTIFACT

- `SPEC-ARTIFACT-RICH-CARD-001`
- `PLAN-ARTIFACT-RICH-CARD-001`
- `TASK-ARTIFACT-RICH-CARD-001` 至 `TASK-ARTIFACT-RICH-CARD-006`
- `TRACE-ARTIFACT-RICH-CARD-001`

### DIFF

- `SPEC-DIFF-APPLY-SOURCE-001`
- `PLAN-DIFF-APPLY-SOURCE-001`
- `TASK-DIFF-APPLY-SOURCE-001` 至 `TASK-DIFF-APPLY-SOURCE-004`
- `TRACE-DIFF-APPLY-SOURCE-001`

### DEPLOYMENT

- `SPEC-DEPLOYMENT-PREVIEW-001`
- `PLAN-DEPLOYMENT-PREVIEW-001`
- `TASK-DEPLOYMENT-PREVIEW-001` 至 `TASK-DEPLOYMENT-PREVIEW-005`
- `TRACE-DEPLOYMENT-PREVIEW-001`

## 3. 源资产

- `vibeCodingPlan/AgentHub-前后端-富媒体卡片升级方案-文件预览Diff.md`
- `vibeCodingSummary/AgentHub-富媒体卡片升级-文件预览Diff-实施总结.md`
- `docs/ai-collab/decisions/artifact-preview/2026-06-04-web-preview-fix.md`
- `docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-artifact-edit-writeback.md`
- `docs/ai-collab/decisions/artifact-edit-diff/2026-06-05-diff-apply-to-source.md`
- `vibeCodingSummary/deployment-feature-2026-06-07.md`
- `vibeCodingSummary/cli-deploy-card-fix-2026-06-07.md`

## 4. 验证结果

本次为历史补录，未重新运行业务测试；各 trace 中区分了历史验证与本次未运行项。

图谱校验：

```powershell
python docs/vibe-graph/scripts/validate-vibe-graph.py docs/vibe-graph
```

结果：

```text
Validation passed: 0 errors, 0 warning(s).
```

## 5. 后续建议

- 将 `CodeCard 编辑回写` 从 ARTIFACT 中拆出独立 `SPEC-ARTIFACT-EDIT-WRITEBACK-001`。
- 补录 `Agent 管理与模型配置`。
- 补录 `会话、消息和 PinSpec` 基础链路。
