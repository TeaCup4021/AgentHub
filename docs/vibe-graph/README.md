# AgentHub Vibe Graph

本目录是 AgentHub Vibecoding 工作的可追溯索引层。

它不替代现有的 spec、plan、summary、decision 或业务代码，而是为这些已有资产补充稳定的图谱节点和关系，让人类与 AI 都能沿着同一条链路理解、追踪和复现项目演进。

## 目标

建立一套轻量、人类可读、AI 可操作的知识图谱链路：

```text
spec -> plan -> task -> implements -> trace -> summary
```

这套图谱需要帮助回答以下问题：

- 某个功能由哪个 spec 定义？
- 某个 spec 派生出了哪些 plan 和 task？
- 某个 task 最终修改或实现了哪些源码文件？
- 哪份 summary 或验证记录可以证明工作已经完成？
- 哪些旧的 Claude Code 或 Codex 文档目前仍只是源资产，还没有被索引为图谱节点？

## 范围

本索引层只负责整理、链接和追溯现有项目知识。

可以包含：

- spec、plan、task、trace 的稳定 ID。
- 指向 `docs/`、`agenthub-web/docs/`、`archive/development/plans/`、`archive/development/summaries/` 中已有文档的链接。
- 指向 `backend/` 和 `agenthub-web/src/` 中实现文件的链接。
- 将历史文档补录为图谱节点时的迁移说明。

不应该包含：

- 对既有设计文档的大段重写。
- 与历史总结重复的大段实施记录。
- 业务源码。
- 无法追溯到源资产或用户请求的生成内容。

## 目录结构

```text
docs/vibe-graph/
  README.md
  index.md
  rules.md
  handoff.md
  prompts.md
  obsidian.md
  source-assets.md
  SKILL.md
  references/
  scripts/
  specs/
  plans/
  tasks/
  traces/
  templates/
```

## 当前阶段

当前阶段已经完成索引层、规则、模板、仓库内 Skill、校验脚本、负责人交付说明，以及多条历史补录样例。

历史文档仍保持原位，不搬迁、不重写。

已补录的业务能力包括：

- 群聊 DAG 执行。
- PPT 内联浏览。
- 富媒体产物卡片。
- Diff 应用到源产物。
- 轻量级部署预览。
- CodeCard 编辑回写。
- Agent 管理与模型配置。
- 会话、消息和 PinSpec 基础链路。

后续阶段可以继续补充：

- 更多历史功能迁移，例如 Context Assembler、CapabilityRegistry、Planner 两阶段协议和 SSE Translator。
- 更完整的 Obsidian 式双链。
- 更严格的自动化校验。
- 将仓库内 Skill 安装为个人 Codex Skill。

## 使用入口

- 新需求或历史补录先读 `rules.md`。
- 交付给项目负责人时先读 `handoff.md`。
- 与 Codex 协作时可直接复制 `prompts.md` 中的固定口令。
- 在 Obsidian 中查看图谱时打开 `obsidian.md`。
- 创建节点时使用 `templates/`。
- 补录历史文档时参考 `references/migration-guide.md`。
- 修改图谱后运行 `scripts/validate-vibe-graph.py`。

