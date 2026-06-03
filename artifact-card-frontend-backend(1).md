# 产物卡片（Artifact Card）前后端分工 & 后端待办

---

### 核心问题

`artifact_detector.py` 用正则从 AI 文本中"猜"产物。但 AI 输出是自由文本，不会主动遵循正则格式。结果是：Mock 数据能展示卡片，连真实后端就什么都没有。

### 需要做的（按优先级）

#### 1. 在 `artifact_detector.py` 中新增 XML 标签解析（核心）

在 `detect_artifacts()` 函数最前面加一个 `_detect_xml_artifacts(content)` 函数，解析 `<artifact>` 标签。标签格式如下，参考了 OpenHands / Cline 等产品的做法：

**文件产物：**
```
<artifact type="file" name="report.pdf" url="https://minio.local/files/report.pdf" mime="application/pdf" size="1048576" />
```

**预览产物：**
```
<artifact type="preview" url="https://example.com/demo" title="Demo 页面" />
```

**Diff 产物：**
```
<artifact type="diff" filename="app.tsx" language="typescript">
--- original
function greet(name: string) { return "Hello " + name; }
+++ modified
function greet(username: string) { return "Hello " + username; }
</artifact>
```

解析后生成的标准 artifact 结构（前端已适配）：

```python
# file
{"artifactType": "file", "title": "report.pdf", "content": {"fileName": "report.pdf", "fileUrl": "https://...", "fileType": "application/pdf", "fileSize": 1048576}}

# preview
{"artifactType": "preview", "title": "Demo 页面", "content": {"url": "https://...", "title": "Demo 页面", "previewType": "web"}}

# diff
{"artifactType": "diff", "title": "变更对比", "content": {"oldCode": "function greet(name: string)...", "newCode": "function greet(username: string)...", "language": "typescript", "fileName": "app.tsx"}}
```

**关键**：用 `re.finditer` 从文本中提取所有 `<artifact>` 标签（包括自闭合和带闭合标签的），XML 解析出的 artifact 优先级高于正则检测。现有的正则逻辑保留作为兜底（代码块检测对部分模型仍然有效）。

#### 2. 在 Agent 的 System Prompt 中注入输出格式规范

创建 Agent 或发送消息时，在 System Prompt 末尾追加一段输出格式说明，告诉 Agent 用标签包裹产物。参考文本：

```
When you create or modify files, preview pages, or show code diffs, wrap them in <artifact> tags:

For files you created:
<artifact type="file" name="filename.ext" url="download_url" mime="mime/type" size="bytes" />

For web pages or documents to preview:
<artifact type="preview" url="https://..." title="Preview Title" />

For code changes (show both original and modified):
<artifact type="diff" filename="file.ext" language="typescript">
--- original
old code here
+++ modified
new code here
</artifact>

The platform will render these as rich cards in the chat. Always use these tags when presenting your work products.
```

这确保了 AI 的输出是**确定性的**——只要 AI 遵守格式，产物就能被识别。

#### 3. 确认以下链路已通（无需改动）

- SSE 下发：`conversations.py` 的 `_adk_sse_stream` 和 `_accumulate_stream_events` 已经在 `message_end` 时调用 `detect_artifacts`，并将结果通过 `event: artifact` SSE 推送
- 持久化：`artifact.py` 的 `ArtifactService.append_version` 处理去重 + 版本管理
- REST 返回：`message.py` 的 `list_messages` 已在 artifact dict 中使用 camelCase 键名

---

## 完整原理说明

### 整体数据流

```
AI 输出文本 (stdout)
    ↓
artifact_detector.py 解析文本 → 生成结构化 Artifact 对象
    ↓
两条路同时走:
    ├─ SSE event: artifact → 前端流式渲染卡片 (实时)
    └─ PostgreSQL 持久化 → REST API 返回 → 前端重新拉取渲染 (刷新后)
```

### 第一阶段：AI 输出文本

Agent（Claude Code CLI / Codex CLI 等）作为子进程运行在后端。**CLI 工具输出的是纯文本流（stdout），不是结构化的 API 回调**。后端通过 ADK Runner 启动子进程，捕获的是一串字符串，类似：

```
我来帮你写这个组件。

```typescript
import React from "react";
const Button = () => <button>Click</button>;
```

文件已生成，下载地址：https://minio.local/files/report.pdf

修改前后对比：

```diff
- function greet(name: string) {
+ function greet(username: string) {
```

预览地址：https://example.com/demo
```

这就是后端拿到的全部内容——一段 Markdown 格式的文本。没有 tool call 回调、没有结构化 JSON、没有任何标识告诉后端"这里有一个文件产出了"。

### 第二阶段：后端解析文本 → 生成结构化 Artifact

`artifact_detector.py` 的 `detect_artifacts(content)` 函数负责从这段自由文本中提取产物信息。它目前使用的是**正则表达式**来匹配特定文本模式。

**代码块 → CodeCard**

```python
_CODE_BLOCK_RE = re.compile(r"```(\w+)?\s*\n(.*?)```", re.DOTALL)
```

AI 普遍使用 Markdown 围栏代码块（fenced code block），所以代码产物基本能被检测到。后端会记录语言类型（`typescript`、`python` 等），生成代码高亮所需的数据。

**Diff 对比 → DiffCard**

```python
# 仅匹配 language 为 "diff" 的代码块
if language != "diff":
    continue
old_code, new_code = _split_diff(diff_text)
```

要求 AI 使用 ` ```diff ` 语言标识。实际场景中 AI 更常见的是直接贴两段代码用自然语言说"改了这一行"，不会用 diff 格式。所以这个检测不稳定。

**网页预览 → PreviewCard**

```python
_URL_RE = re.compile(r"https?://[^\s\)\]>]+")
```

从文本中提取 URL，区分嵌入类（Google Docs、YouTube 等，生成 `preview` 卡片并在 iframe 中展示）和普通链接（生成 `link_preview` 卡片 + 抓取 OG 元数据）。基本可用，但无法区分"AI 想让你预览的 URL"和"AI 随手引用的文档链接"。

**文件附件 → FileCard**

```python
_CREATE_FILE_JSON_RE = re.compile(
    r'"status"\s*:\s*"created".*?"download_url"\s*:\s*"([^"]+)".*?"file_name"\s*:\s*"([^"]+)".*?"file_size"\s*:\s*(\d+).*?"mime_type"\s*:\s*"([^"]+)"'
)
```

匹配 JSON 片段如 `"status":"created"... "download_url":"..."`。**这是完全不可用的**——没有任何 AI 会在对话文本里输出这种 JSON 结构。这种格式只存在于特定的 tool call API 响应中，而 CLI Agent 的 stdout 不会包含它。

### 为什么正则检测在真实环境下失效

| 检测方式 | AI 实际输出 | 能否匹配 |
|---|---|---|
| ` ```language ` | ` ```python\ncode\n``` ` | 大概率能 |
| ` ```diff ` | "我把 name 改成了 username，改动如下..." | 大概率不能 |
| `https://...` | 文本中的链接 | 能（但如果链接在代码块里会被过滤掉） |
| `"status":"created"` | AI 说"文件已生成" | 完全不能 |
| `📎 File:` | AI 说"这是生成的文件" | 完全不能 |

**根本原因**：检测机制假设 AI 会按照人类预设的格式输出，但 AI 是自由文本生成器——它不知道你的后端有个正则引擎在等着匹配特定 pattern。AI 产出一个文件时，它会说"我已经生成了 report.pdf"或"文件在 /download/report.pdf"，但不会说 `📎 File: report.pdf` 或输出裸 JSON。

### 解决方案：XML 结构化标签

在 System Prompt 中告诉 Agent 输出格式，AI 自然会遵守（就像它遵守 Markdown 格式一样）：

```
当你要展示文件时，用：
<artifact type="file" name="report.pdf" url="https://..." mime="application/pdf" size="1048576" />
```

后端解析这些标签是确定性的——不是"猜测"AI 是否提到了文件，而是"提取"AI 明确标注的内容。这是 OpenHands、Cline 等产品在 CLI Agent 场景下的标准做法。

### 第三阶段：Artifact 分发（SSE + 持久化）

检测（或解析）出的每个 artifact 是一个标准 Python dict：

```python
{
    "id": "uuid",
    "artifactType": "code",    # code | diff | preview | file | deploy_status | document
    "title": "app.tsx",
    "content": {
        "language": "typescript",
        "code": "import React from 'react'; ...",
        "fileName": "app.tsx",
    },
    "version": 1,
}
```

这个 dict 走两条路径同时进行：

**路径 A — SSE 实时推送**

`conversations.py` 中 `_adk_sse_stream` 和 `_accumulate_stream_events` 在 `message_end` 事件处理中调用 `detect_artifacts`，然后对每个检测到的 artifact 发送 SSE 事件：

```
event: artifact
data: {"version":"v1","event_id":"...","conversation_id":"...","message_id":"...","artifact":{...},"timestamp":"..."}
```

artifact 事件的发送顺序在 `message_end` **之前**。所以前端在流式传输结束时，卡片已经渲染好了，体验上不会有闪烁。

**路径 B — 数据库持久化**

`artifact.py` 的 `ArtifactService.append_version()` 将 artifact 写入 PostgreSQL `artifacts` 表：

- 按 `_mergeKey`（由 artifact id 或 type+title 生成）去重，同一 mergeKey 的多次写入作为版本追加（`version` 自增）
- 按 `_eventId` 去重，防止 SSE 重复事件
- 乐观并发控制（`SELECT max(version) WHERE merge_key`）
- IntegrityError 自动回滚重试 2 次

这样在 SSE 断线重连或页面刷新后，前端通过 `GET /conversations/:id/messages` 重新拉取消息时，artifact 已在数据库中。

### 第四阶段：前端渲染

**流式渲染**（SSE 事件到达时立即渲染，不等 message_end）：

```
SSE "artifact" 事件
  → ChatArea.buildCallbacks.onArtifact(data)
  → 提取 data.artifact（内层 Artifact 对象）
  → chatStore.appendStreamArtifact(messageId, artifact)
     → 追加到 streamingContent[messageId].artifacts 数组
  → StreamingMessageBubble 订阅 streamingContent
     → {sc.artifacts.map(a => <CardRenderer artifact={a} />)}
       → CardRenderer 按 artifactType 查表分发:
         "file"    → <FileCard />
         "preview" → <PreviewCard />
         "diff"    → <DiffCard />
         "code"    → <CodeCard />
         ...
```

**持久化渲染**（message_end 后 REST 重新拉取，以及页面刷新时）：

```
GET /conversations/:id/messages
  → useMessages (React Query) 拉取消息列表
  → normalizeMessageArtifacts() 将 artifact dict 的 snake_case 键转 camelCase (防御性)
  → MessageList 渲染 MessageBubble
     → {message.artifacts.map(a => <CardRenderer artifact={a} />)}
     → {renderFallbackCards(message.content, message.artifacts)}
        → 客户端兜底: ```diff 代码块 → DiffCard, URL → LinkPreviewCard
```

CardRenderer 的匹配逻辑（`CardRenderer.tsx`）：

```typescript
const cardRenderers = {
  code:          CodeCard,           // 代码高亮 + Monaco 编辑
  diff:          DiffCard,           // Monaco DiffEditor + 冲突解决
  preview:       PreviewCard,        // iframe 内嵌 + 全屏
  file:          FileCard,           // 文件图标 + 下载
  deploy_status: DeployStatusCard,   // 部署状态
  document:      DocumentCard,       // PDF 内联预览
};
const Renderer = cardRenderers[artifact.artifactType];
if (!Renderer) return null;  // 未知类型不渲染
```

---

## 前端卡片组件功能对照

### FileCard（135 行）

| 功能 | 状态 |
|---|---|
| 文件图标（按扩展名着色：PDF 红、Excel 绿、PPT 橙、Word 蓝） | 已实现 |
| 文件类型 Badge + 文件大小显示 | 已实现 |
| 下载按钮（fileUrl 直接下载 / code 内容生成 Blob） | 已实现 |
| 图片类型自动内联预览 | 已实现 |
| 无可下载内容时显示"文件暂未生成"占位 | 已实现 |
| 拖拽调整高度 + 恢复默认大小 | 已实现 |

需要的数据：
```typescript
content: {
  fileName: string;   // 必填 — 显示在标题栏
  fileUrl: string;    // 下载地址 — 不填则无法下载
  fileType: string;   // MIME 类型 — 用于图标着色
  fileSize: number;   // 字节数 — 显示在副标题
}
```

### PreviewCard（104 行）

| 功能 | 状态 |
|---|---|
| iframe 沙盒内嵌网页（`sandbox="allow-scripts"`） | 已实现 |
| 全屏 Modal 展开 | 已实现 |
| iframe 加载失败 → "预览不可用"占位 | 已实现 |
| 预览标题 + 类型 Badge（web / doc / ppt） | 已实现 |
| 拖拽调整高度 | 已实现 |

需要的数据：
```typescript
content: {
  url: string;           // 必填 — iframe src
  title: string;         // 显示在标题栏
  previewType: string;   // "web" | "doc" | "ppt" — 用于 Badge
}
```

### DiffCard（143 行）

| 功能 | 状态 |
|---|---|
| Monaco DiffEditor（并排 / 统一视图可切换） | 已实现 |
| 新增 +N / 删除 −N 行数统计 | 已实现 |
| 保存文件 → `fileApi.applyDiff` → 冲突时(409)弹出 ConflictResolver | 已实现 |
| 暗色 / 亮色主题自适应 | 已实现 |
| 拖拽调整高度 + 最小尺寸限制 | 已实现 |

需要的数据：
```typescript
content: {
  oldCode: string;    // 必填 — 左侧原始代码
  newCode: string;    // 必填 — 右侧修改后代码
  language: string;   // Monaco 语言标识
  fileName: string;   // 可选 — 用于保存文件
}
```

### 七张卡片组件功能对照总览

| 卡片 | 文件 | artifactType | 核心功能 |
|---|---|---|---|
| CodeCard | `CodeCard.tsx` (104行) | `"code"` | Shiki 语法高亮 + 点击编辑 → Monaco 编辑器 + Ctrl+S 保存 |
| DiffCard | `DiffCard.tsx` (143行) | `"diff"` | Monaco DiffEditor 并排/统一 + 行数统计 + 保存触发 applyDiff + 冲突弹 ConflictResolver |
| PreviewCard | `PreviewCard.tsx` (104行) | `"preview"` | iframe 沙盒 + 全屏 Modal + 加载失败降级 |
| FileCard | `FileCard.tsx` (135行) | `"file"` | 扩展名着色图标 + 下载 + 图片内联预览 |
| DocumentCard | `DocumentCard.tsx` (75行)  | `"document"` | PDF iframe 内联渲染 + 非 PDF 类型下载引导 |
| DeployStatusCard | `DeployStatusCard.tsx` (80行) | `"deploy_status"` | 构建中/已部署/失败 状态展示 + 点击 URL |
| LinkPreviewCard | `LinkPreviewCard.tsx` (127行) | `"link_preview"` | OG 元数据(域名/favicon/图片) + 点击跳转 |

---

## 五、富媒体产物功能详细说明

课题原文要求：
> "Agent 的回复不仅是文字，还可以内联展示代码 Diff、网页预览卡片、文件附件等富媒体产物，用户可直接在聊天流中预览和操作"
> "产物预览：Agent 回复中内联产物预览卡片（网页 iframe、文档渲染），点击卡片展开全屏预览 / 代码编辑器"
> "支持 Diff 视图、版本历史、对话式局部修改"

以下逐项说明实现现状、与后端的依赖关系。

---

### 5.1 网页 iframe + 文档渲染

**涉及的卡片**：PreviewCard + DocumentCard

**预览链路**：Agent 产出 HTML/网页 → 后端 `POST /api/v1/files/preview` 将 HTML 上传到 MinIO → 返回 `/preview/{id}` URL → 通过 `preview_server.py`（Starlette 应用）从 MinIO 读取 HTML 并返回 → 前端 iframe 加载该 URL。

**PreviewCard**（`PreviewCard.tsx`）：
- iframe 沙盒：`sandbox="allow-scripts"`，允许 JS 执行但禁止弹窗/表单提交
- 全屏查看：点击右上角全屏按钮 → Semi Design `Modal` 组件 `fullScreen` 模式，iframe 占满窗口
- 错误处理：`onError` 回调设置 `error` 状态 → 显示"预览不可用"占位
- 类型标记：头部 Badge 显示 `previewType`（web / doc / ppt）

**DocumentCard**（`DocumentCard.tsx`）：
- PDF：直接嵌入 `<iframe src={fileUrl}>` 内联渲染（浏览器原生 PDF 查看器）
- 非 PDF（docx / xlsx / pptx）：显示文件类型标签 + 文件大小 + 下载按钮，引导用户下载后本地打开
- 加载状态：600ms 延迟后显示 Spin 加载动画
- 加载失败：Empty 占位 + "暂不支持内联预览，请下载查看"

**当前问题**：
1. `preview_server.py` 的 Starlette 应用未在 `main.py` 中挂载——`GET /preview/{id}` 返回 404
2. 网页预览依赖 Agent 先产出 HTML 并调用 `/files/preview` 接口上传。如果 Agent（CLI 模式）无法主动调用后端 API，则这个链路走不通——需要后端在 Agent 产出的文件里识别 HTML 文件后自动发布预览

**后端需要做的**：
- `main.py` 中加一行 `app.mount("/preview", preview_app)`
- 如果 CLI Agent 无法主动调用 `/files/preview`，需要在 `artifact_detector.py` 中检测 Agent 产出的 HTML 文件路径，自动读取文件内容并上传到 MinIO 预览

---

### 5.2 点击卡片展开全屏预览

**涉及的功能**：PreviewCard 全屏 + ArtifactWorkbench 产物汇总

**PreviewCard 全屏**（`PreviewCard.tsx:40-100`）：

两个视图状态：
- **卡片内嵌视图**（默认）：iframe 高度 260px，可拖拽调整。适合快速扫一眼
- **全屏 Modal**：点击右上角展开按钮 → Semi `Modal fullScreen` → iframe 占满窗口高度。适合仔细查看

切换逻辑：
```typescript
const [expanded, setExpanded] = useState(false);
// 卡片内的按钮 → setExpanded(true)
// Modal 关闭 → setExpanded(false)
```

**ArtifactWorkbench 产物汇总**（`ArtifactWorkbench.tsx`）：

ChatArea 顶部提供"聊天 / 产物"两个 Tab。切换到"产物"视图时：
- 从所有消息中提取全部 artifact（跨消息、跨 Agent）
- 筛选栏：按类型（代码/差异/预览/文件/文档/部署）、按 Agent、按文本搜索
- 所有 artifact 用 CardRenderer 渲染在同一页面上，相当于一个"项目产出物面板"
- 空状态："开始对话后，Agent 生成的代码和文件将在此汇总"

**当前问题**：
- 产物区的数据来源是 `messages[].artifacts[]`——也就是说 ArtifactWorkbench 完全依赖后端 artifact 检测。后端检测不到，产物区就是空的
- 全屏 Modal 中的 iframe 没有加载进度条，大页面加载慢时用户看到白屏

**后端需要做的**：
- 无。此功能纯前端，只要 artifact 数据到位就能正常工作

---

### 5.3 代码编辑器

**涉及的组件**：CodeCard + MonacoCodeEditor

**编辑模式切换**（`CodeCard.tsx:15-103`）：

CodeCard 有两种模式：
- **查看模式**（默认）：Shiki 语法高亮只读展示，代码行数超过 30 行自动折叠
- **编辑模式**：点击"编辑"按钮 → 切换为 `MonacoCodeEditor`

```typescript
const [editing, setEditing] = useState(false);
const [editedCode, setEditedCode] = useState(c.code);

// 点击编辑 → setEditing(true)
// 取消 → setEditedCode(c.code); setEditing(false)
// 保存 → fileApi.updateContent(artifact.id, code); setEditing(false)
```

**MonacoCodeEditor**（`MonacoCodeEditor.tsx`）：

- 基于 `@monaco-editor/react`，完整 VS Code 编辑器体验
- Ctrl+S 保存：通过 `editor.addCommand(2048 | 49, onSave)` 绑定快捷键
- 自适应高度：`Math.max(200, Math.min(600, lines * 20 + 40))`
- 语法高亮：根据 `language` 参数自动切换（typescript / python / go / rust 等 30+ 语言）
- 暗色/亮色主题：从 `uiStore.theme` 读取，跟随系统或手动切换
- 只读模式：DiffCard 中的 DiffEditor 设为 `readOnly: true`
- minimap 关闭（卡片的编辑区域有限）

**保存链路**：
```
CodeCard 点击保存
  → fileApi.updateContent(artifactId, code)
  → POST /api/v1/files/{id}/content  (后端 files.py:78-86)
  → MinIO 上传新内容
  → toast "已保存"
```

**当前问题**：
- Monaco Editor 每次新建实例，没有多文件 Tab 切换。如果有多个代码 artifact，编辑其中一个时看不到旁边的
- 编辑器没有代码诊断（ESLint / TypeScript 错误提示），只是一个文本编辑器

**后端需要做的**：
- `PUT /files/{id}/content` 的保存端点已实现（`files.py:78-86`），会将内容重新上传到 MinIO。无需额外改动

---

### 5.4 版本历史

**课题要求**："版本历史"（P2）

**现状——基础设施已有，UI 未实现**：

后端 `artifact.py` 中已经实现了完整的版本管理：

```
AppendVersion 逻辑:
1. 按 _mergeKey 查找已有记录
2. SELECT max(version) WHERE merge_key → 得到当前最大版本号
3. INSERT 新版本号 = max_version + 1
4. 同一个 artifact（相同 mergeKey）的多次修改以多行存储，每行 version+1
```

数据库 `artifacts` 表中同一条业务 artifact 对应多条记录（`version` 递增），天然支持版本追溯。但目前：

- **后端**：`GET /messages/{id}/artifacts` 返回所有版本（`order by created_at desc`），但前端没有调用此接口
- **前端**：`Artifact` 类型有 `version: number` 字段，但没有任何版本历史 UI。CodeCard 的"编辑"保存后会更新 version，但用户看不到旧版本

**前端需要做的**（P2）：
- 在 CodeCard / DiffCard 中添加"版本历史"按钮
- 点击后调用 `GET /messages/{id}/artifacts` 获取该 artifact 的所有版本
- 渲染一个 Timeline 组件展示版本列表，支持点击查看某个历史版本

**后端需要做的**：
- 无。版本持久化链路已完整，API 端点已存在

---

### 5.5 对话式局部修改

**课题要求**："对话式局部修改（选中代码 → 在聊天中描述修改）"（P2）

**现状——基础设施已部分实现，完整工作流未打通**：

整个"对话式局部修改"的全链路应该是：
```
用户在聊天中选中一段代码
  → 在聊天输入框中描述修改意图
  → Agent 理解上下文并生成修改后的代码
  → 前端自动生成 Diff 对比卡片
  → 用户确认 → 应用 Diff 到文件
```

当前各环节的状态：

**(A) 代码引用（Quote）—— 已实现**

`MessageActions.tsx` 的引用按钮：点击后设置 `chatStore.pendingQuote`，ChatInput 顶部显示引用横条。但这个引用只包含消息文本，**不包含代码选中**——用户不能"选中代码的某几行然后引用"。

**(B) Diff 展示 + 应用 —— 已实现**

DiffCard 完整实现了：
- `fileApi.applyDiff(fileName, code, language)` 调用后端
- 409 冲突 → `ConflictResolver` 弹出，展示各 Agent 的冲突版本，支持接受/拒绝
- 成功后 → `toast.success("文件已保存")`

ConflictResolver（`ConflictResolver.tsx`）：
- 多 Agent 同时修改同一文件时的冲突解决 UI
- 每个 Agent 的修改以 diff 格式展示（+/- 行着色）
- 按 Agent 逐个接受/拒绝
- 合并结果编辑框（手动编辑合并后的代码）
- "全部接受"按钮提交

**(C) "选中代码 → 描述修改"的完整闭环 —— 未实现**

缺失的环节：
1. 用户在代码块里选中几行 → 右键菜单"描述修改"→ 代码片段 + 用户描述一起发送给 Agent
2. Agent 返回修改后的代码（或 diff）
3. 前端自动生成 DiffCard，展示修改前后对比
4. 用户确认 → 一键应用

**前端需要做的**（P2）：
- `HighlightedCode` 组件加文本选中监听 + 右键菜单
- 选中后自动创建 Quote，附带代码片段和行号
- ChatInput 中显示"正在修改 app.tsx L10-15"上下文

**后端需要做的**：
- 无额外改动。Quote 消息发送、DiffCard 渲染、Diff apply 的接口都已就绪
- System Prompt 中需要告知 Agent：当用户引用代码并描述修改意图时，用 `<artifact type="diff">` 标签返回修改后的 diff

---

## 附录：关键文件索引

| 文件 | 作用 |
|---|---|
| `backend/app/services/artifact_detector.py` | **需要修改** — 产物检测逻辑 |
| `backend/app/api/v1/conversations.py` | SSE 流处理，artifact 事件下发 (已通) |
| `backend/app/services/artifact.py` | Artifact 持久化 / 去重 / 版本管理 (已通) |
| `backend/app/services/message.py` | 消息列表 REST 返回 (已改为 camelCase) |
| `agenthub-web/src/components/cards/CardRenderer.tsx` | 按 artifactType 分发卡片组件 |
| `agenthub-web/src/components/cards/FileCard.tsx` | 文件卡片 |
| `agenthub-web/src/components/cards/PreviewCard.tsx` | 预览卡片 |
| `agenthub-web/src/components/cards/DiffCard.tsx` | Diff 卡片 |
| `agenthub-web/src/components/chat/MessageList.tsx` | 消息渲染（含客户端 fallback） |
| `agenthub-web/src/components/layout/ChatArea.tsx` | SSE 回调绑定 |
| `agenthub-web/src/stores/chatStore.ts` | 流式状态管理 |
| `agenthub-web/src/types/chat.ts` | Artifact 数据接口定义 |
