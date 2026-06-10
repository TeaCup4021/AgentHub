# 产物卡片（Artifact）联调与排查指南

Agent 回复中的产物卡片（代码 / Diff / 网页预览 / 文件 / 链接 / 文档）走「后端 `artifact_detector` 检测 → SSE `artifact` 事件 → 落库 → 前端 `CardRenderer` 渲染」全链路。本指南覆盖联调前置、按卡片类型的测试提示词、以及常见症状的排查路径。

## 0. 联调前置（每次必查）

| 项 | 要求 | 不满足的症状 |
|----|------|--------------|
| 前端 Mock 开关 | `agenthub-web/.env` 设 `VITE_USE_MOCK=false` | Mock 下卡片是写死的假数据，测不到后端检测/落库 |
| 后端启动方式 | 用项目 `.venv` 的 uvicorn，**不要** `npm run dev:backend` | npm 脚本可能调到系统 PATH 的 Python，报 `python-multipart` 缺失等假错误 |
| 端口一致 | Vite 代理、后端启动端口、`PREVIEW_SERVER_URL` 三者对齐（默认 8080） | 连接拒绝、iframe 空白、`/preview` 404 |

启动后端（venv）：
```bash
! .venv/Scripts/python -m uvicorn app.main:app --reload --port 8080 --app-dir backend
```

## 1. 按卡片类型的测试提示词（用户视角）

| 卡片 | 提示词 | 期望 |
|------|--------|------|
| **代码卡 + 回写** | `用 Python 写一个快速排序函数，带类型注解和 docstring。` | 出现代码卡 → 点「编辑」进 Monaco → 改几行 → 点「保存」弹「已保存」→ **刷新页面后仍是改过的内容**（回写后端，非下载） |
| **选区改写 + 应用回源** | 先出代码卡 → 划选其中几行 → 浮出「引用此片段修改」→ 输入框出现「选区 · 语言」引用条 → 描述「把这段改成列表推导」回车 → Agent 返回 **Diff 卡** → 点 Diff 卡「应用到源文件」 | 自己消息气泡含 `[选区修改]` 拼装内容；Diff 卡只改选中片段；点「应用到源文件」后**源代码卡刷新为改后全文（追加新版本）**，「另存为文件」仅下载 |
| **网页预览 + 全屏** | `生成一个完整的 HTML 页面：深色作品集首页，含导航栏、标题、三个卡片，内联 CSS。` | iframe 加载出页面 → 点右上角全屏图标弹 Modal |
| **Diff 卡** | `这是我的函数：def add(a,b): return a+b。帮我加输入校验，并以 diff 形式展示前后对比。` | DiffCard 并排/统一切换、`+N/−N` 统计、「另存为文件」 |
| **选区改写 + 应用回源** | 先让 Agent 出一张代码卡（如 `quicksort.py`）→ 划选其中一段 → 点「引用此片段修改」→ 输入「改成列表推导式」→ 回车 | Agent 回 **Diff 卡** → 点 Diff 卡上「**应用到源文件**」→ 改动写回 `quicksort.py` 代码卡（追加新版本）→ 刷新仍在 |
| **文档卡** | `把三行数据生成可下载的 CSV/Excel：姓名、年龄、城市各两条。` | PDF/Word/Excel 内联渲染；PPT 仅下载（预期，未实现内联） |
| **链接预览** | `推荐 2 个学习编程的官方网站，附上链接。` | 普通链接走 `LinkPreviewCard`（OG 卡片 + 新标签页打开），**不是** iframe |

## 2. 症状 → 排查路径

| 症状 | 可能原因 | 排查 |
|------|----------|------|
| 网页/链接卡显示「xxx 拒绝连接」 | 普通链接被误用 iframe，撞目标站 `X-Frame-Options: DENY` / CSP | 确认 `artifact_detector._is_embeddable` 只对白名单域名 + 文档文件返回 True，其余降级 `link_preview`。`curl -sI <url>` 看是否有 XFO/CSP |
| 卡片完全不出现 | 检测没命中 / `<artifact>` 标签格式变化 | 看后端日志 `artifacts_found=N`；前端有 `renderFallbackCards` 文本兜底，若兜底也无，多半是内容里既无 XML 标签也无代码块/URL |
| 卡片重复（同一内容两张） | 版本链去重缺失 | `list_messages` 须按 `_mergeKey` 取最新版本（见 `message.py` 的 `latest_by_chain`）。`update_content` 是追加新版本，不去重会并排显示 |
| 代码卡「保存」后刷新丢失 | 走了下载分支而非回写 | fallback 卡（id 以 `fallback-` 开头、无 DB 行）只能下载；真实卡应调 `PATCH /messages/artifacts/{id}` |
| Diff 卡「应用到源文件」提示「未找到匹配的源代码卡」 | diff 的 `oldCode` 片段对不上任何代码卡、且无 `file=` 命名 | 选区改写需 Agent 在 diff 里照抄选中片段（`-- before` 段）。弱模型可能改写了片段导致内容匹配失败；让 Agent 带 `file="原文件名"` 可走文件名匹配兜底。匹配逻辑见 `lib/diffApply.ts` |
| Diff 卡「应用到源文件」提示「临时解析卡无法写库」 | 匹配到的源代码卡是 fallback 卡（无 DB 行） | 源代码卡须是后端落库的真实卡（非文本兜底解析）。手动复制改后代码到真实卡编辑保存 |
| message_end 后卡片闪现又消失 | 先 yield 后落库 | 必须在 yield `message_end` 前完成持久化（见 CLAUDE.md 纠正类规则） |
| iframe 空白但无「拒绝连接」 | sandbox 权限不足 / `/preview` 代理缺失 | `PreviewCard` sandbox 需含 `allow-same-origin allow-forms allow-popups`；`vite.config.ts` 需代理 `/preview` |
| 卡片渲染但 SSE 报错吞掉 | 代理 LLM 异常被 Translator 静默 | 已知技术债 #9，看后端是否有 `Root node failed` 但前端无 error 事件 |

## 3. 检测链路关键文件

| 环节 | 文件 |
|------|------|
| 检测（XML 标签 / 代码块 / URL） | `backend/app/services/artifact_detector.py` |
| 落库 + 版本链 | `backend/app/services/artifact.py`（`append_version` / `update_content`） |
| 读取去重 | `backend/app/services/message.py`（`latest_by_chain`） |
| 回写端点 | `backend/app/api/v1/messages.py`（`PATCH /artifacts/{id}`） |
| 格式指令注入 | `backend/app/services/artifact_format.py` |
| Diff→源卡 匹配/应用 | `agenthub-web/src/lib/diffApply.ts`（`findApplyTarget` / `applySnippet`，纯函数）+ `cards/DiffCard.tsx`（「应用到源文件」按钮） |
| 前端分发 | `agenthub-web/src/components/cards/CardRenderer.tsx` |
| 前端文本兜底 | `agenthub-web/src/components/chat/MessageList.tsx`（`renderFallbackCards`） |

## 4. 已实现 / 未实现速查

**已实现**：网页 iframe 内联 + 全屏、代码卡编辑回写后端（版本链）、Diff 视图 + 冲突解决、文件卡、链接 OG 预览、PDF/Word/Excel 内联渲染、**选区级对话改写（选中代码→定向 Diff）+ Diff 应用回源代码卡**（按文件名/片段匹配、追加新版本）。

**未实现 / 不完整**：PPT 内联浏览（仅下载）、代码卡以外的全屏入口、版本历史 UI（后端版本链已就绪，前端无切换界面）。详见 `vibeCodingPlan/AgentHub-产物预览与编辑-未完成功能补全计划.md`。
