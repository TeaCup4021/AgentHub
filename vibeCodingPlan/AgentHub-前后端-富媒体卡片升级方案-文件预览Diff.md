# 富媒体卡片升级方案 · 最终版

## 一、方案定案

| 卡片 | 渲染方案 | 数据来源 | 对标 |
|------|----------|----------|------|
| **DiffCard** | Monaco `<DiffEditor>` | artifact_detector 扫描 Agent 文本中的 `\`\`\`diff` 块 | Cursor / Copilot |
| **FileCard** | 类型图标 + 三态渲染 | Agent 调用 `create_file` 工具 → 工具结果 JSON → artifact_detector 提取 | Claude / ChatGPT |
| **PreviewCard** | 独立 Origin 沙箱 iframe（:8100 预览服务） | Agent 调用 `preview_publish` 工具 → 工具结果 JSON → artifact_detector 提取 | Claude Artifacts |
| **LinkPreviewCard** | OG 元数据卡片（标题+描述+缩略图+favicon） | artifact_detector 扫描 URL → og_fetcher 抓取 → 异步更新 | Slack / Telegram |

### 核心设计原则

**双层检测：后端 artifact_detector 主力 + 前端文本解析兜底。**

后端 artifact_detector 用正则从 Agent 文本中提取 artifact，这是主力路径（产物工作台需要持久化数据）。但正则永远有遗漏——Agent 输出格式稍变就可能匹配不到。前端兜底直接解析消息文本里的代码块和 URL，不依赖后端 SSE artifact 事件，确保卡片渲染不缺位。

```
Agent 输出纯文本（代码块 / URL / diff / 工具调用结果）
        │
 artifact_detector 正则扫描
        │
 SSE artifact 事件
        │
 CardRenderer → 对应卡片渲染
```

Agent 只需要输出文本和使用工具。artifact 的概念完全由后端 artifact_detector 负责，前端只管渲染。

---

## 二、技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 19 + TypeScript 6 + Semi Design 2.x + Zustand + React Query + Vite 8 + Tailwind CSS 3 |
| 代码渲染 | Shiki（HighlightedCode）+ Monaco Editor `@monaco-editor/react` v4.7.0（已安装） |
| 后端 | FastAPI + PostgreSQL + MinIO（已配置未接线） |
| Agent 框架 | Google ADK + LiteLLM（100+ Provider） |
| 实时通信 | SSE（Server-Sent Events） |
| 文件存储 | MinIO（S3 兼容对象存储） |

---

## 三、每条卡片的完整链路

### DiffCard

```
DeepSeek/GPT/... 输出 ```diff 代码块
  → artifact_detector._detect_diffs() 正则提取 oldCode/newCode/language/fileName
  → SSE artifact 事件
  → 前端 CardRenderer → DiffCard
  → Monaco <DiffEditor original={oldCode} modified={newCode} />
  → "保存文件"按钮 → POST /files/apply-diff { fileName, code, language }
  → 后端 StorageService 写入 MinIO → 返回 { fileId, downloadUrl }
  → 前端 fetch downloadUrl + Blob 下载（带 token）
```

| 需开发 | 端 | 说明 |
|--------|-----|------|
| DiffCard 重写 | 前端 | Monaco DiffEditor 替换自研 LCS、splitView 切换 |
| "保存文件"按钮 | 前端 | 文案+交互改为保存+下载 |
| useBlobDownload hook | 前端 | fetch+Blob 带 token 下载 + revokeObjectURL |
| StorageService | 后端 | MinIO 客户端封装 |
| POST /files/apply-diff | 后端 | 接收 { fileName, code, language } → 写 MinIO |

### FileCard

```
Agent 调用 create_file 工具（DeepSeek function calling → ADK FunctionTool）
  → 工具内部：写本地磁盘 + 上传 MinIO
  → 返回 JSON: {"status":"created","download_url":"/api/v1/files/{id}/download","file_name":"...","file_size":...,"mime_type":"..."}
  → artifact_detector._detect_file_artifacts() 扫描工具结果 JSON
  → SSE artifact 事件
  → 前端 FileCard 渲染
```

**三种渲染状态**：
- 有 fileUrl + image/* → 缩略图 + 下载按钮
- 有 fileUrl + 非图片 → 类型图标 + 文件名 + 大小 + 下载按钮
- fileUrl 为空 → "文件暂未生成"禁用态

| 需开发 | 端 | 说明 |
|--------|-----|------|
| FileCard 升级 | 前端 | 类型图标映射 + 三态渲染 + fetch+Blob 下载 |
| create_file 工具改造 | 后端 | 写磁盘同时上传 MinIO，返回含 download_url 的 JSON |
| _detect_file_artifacts() | 后端 | 从 create_file 工具结果 JSON 提取 file artifact |
| StorageService | 后端 | MinIO 客户端（同 DiffCard） |
| GET /files/{id}/download | 后端 | 代理下载流 + Content-Disposition |

### PreviewCard

```
Agent 调用 preview_publish 工具（传入 HTML 内容 + title）
  → 工具内部：POST /files/preview → MinIO 存 HTML key=previews/{uuid}.html
  → 返回 JSON: {"preview_url":"http://localhost:8100/preview/{uuid}","title":"..."}
  → artifact_detector._detect_preview_artifacts() 扫描工具结果 JSON
  → SSE artifact 事件
  → 前端 PreviewCard iframe 加载
```

**安全模型**（对标 Claude Artifacts）：
```
主站 http://localhost:8000    预览服务 http://localhost:8100
        │                              │
        │ 不同 Origin = 浏览器级隔离    │
        │                              │
  <iframe sandbox="allow-scripts"     CSP: sandbox;
   src="http://localhost:8100/         default-src 'self';
        preview/{id}">                 connect-src 'none';
                                       script-src 'self'>
```

| 需开发 | 端 | 说明 |
|--------|-----|------|
| PreviewCard 修复 | 前端 | 移除 allow-same-origin、iframe 加载失败兜底 |
| preview_publish 工具 | 后端 | 新增 builtin 工具，接收 HTML → 调 /files/preview |
| POST /files/preview | 后端 | 存 MinIO → 返回预览 URL |
| 预览服务器 | 后端 | Starlette 应用，端口 8100，GET /preview/{id}，CSP 头 |
| 预览服务器启动 | 后端 | 子线程自启动；生产 docker-compose 独立 service |
| _detect_preview_artifacts() | 后端 | 从 preview_publish 工具结果 JSON 提取 |
| StorageService | 后端 | MinIO 客户端（同上） |

### LinkPreviewCard

```
Agent 文本含普通 URL（非可嵌入域名）
  → artifact_detector._detect_urls() 分类为 link_preview
  → og_fetcher.fetch_og_metadata(url) 抓取 OG 标签
  → 先发占位 artifact → 前端渲染 Skeleton
  → 抓取完成后更新 artifact → 前端渲染完整卡片
```

| 需开发 | 端 | 说明 |
|--------|-----|------|
| LinkPreviewCard 组件 | 前端 | OG 卡片 + Skeleton 加载态 + CardRenderer 注册 |
| LinkPreviewArtifactContent 类型 | 前端 | types/chat.ts |
| og_fetcher.py | 后端 | httpx 抓取 + 解析 OG 标签 + SSRF 白名单 |
| artifact_detector 改造 | 后端 | URL 分类 link_preview + 异步 og 抓取策略 |
| SSRF 白名单 | 后端 | 禁止 localhost/私有 IP/云元数据地址 |

---

## 四、已识别问题与解决方案

| # | 问题 | 端 | 方案 |
|---|------|-----|------|
| 1 | `<a href>` 不带 token 鉴权 | 前端 | fetch+Blob 下载 + useBlobDownload hook |
| 2 | OG fetcher SSRF | 后端 | URL 白名单：禁止 localhost + 私有 IP + cloud metadata |
| 3 | OG 抓取阻塞 message_end | 两端 | 后端异步抓取 + 先占位后更新；前端 Skeleton 态 |
| 4 | 预览服务器生命周期 | 后端 | 子线程自启动；生产 docker-compose service |
| 5 | FileCard 无数据源 | 两端 | create_file 工具改造 + _detect_file_artifacts 扫描 |
| 6 | artifact 重复 | 后端 | mergeKey 加内容哈希 |
| 7 | Monaco 多实例性能 | 前端 | 折叠策略 + IntersectionObserver 懒加载 + 纯文本降级 |
| 8 | "应用修改"按钮语义 | 前端 | 改为"保存文件" + 自动触发下载 |
| 9 | Blob URL 内存泄漏 | 前端 | useBlobDownload hook 管理 revokeObjectURL |
| 10 | CSP 内联脚本宽松 | 后端 | script-src 'self'，后续按需放宽 |

### 前端兜底检测

artifact_detector 是正则扫描，不保证 100% 命中。前端在以下场景直接解析消息文本，不依赖后端 artifact 事件：

**DiffCard 兜底**：消息文本含 ` ```diff ` 但后端未发 diff artifact
→ 前端自己用正则提取 `oldCode`/`newCode`，构造临时 DiffCard 渲染

**CodeCard 兜底**：消息文本含 ` ```python ` 但后端未发 code artifact
→ 现有的 MarkdownBubble 已经内联渲染代码块（Shiki 高亮），无需额外处理

**FileCard 兜底**：artifact 有 fileName 但 fileUrl 为空
→ 检查是否有 code/content 文本 → `URL.createObjectURL(new Blob([content]))` 生成临时下载链接

**LinkPreviewCard 兜底**：OG 抓取失败，只有 URL 没有 title/description/image
→ 降级渲染简化卡片：域名 + favicon（`https://www.google.com/s2/favicons?domain={hostname}`）+ URL 文字

实现位置：`MessageList.tsx` 的 `MessageBubble` 组件中，在 `{message.artifacts.map(...)}` 之后增加一段兜底检测逻辑。伪代码：

```typescript
// MessageList.tsx — 在 artifacts 渲染之后
{message.artifacts.map((a) => <CardRenderer key={a.id} artifact={a} />)}
{renderFallbackCards(message.content)}  // 新增：前端兜底

function renderFallbackCards(content: string) {
  const cards = [];
  // 检查是否有未被后端检测的 diff 块
  const diffMatch = content.match(/```diff\n([\s\S]*?)```/g);
  if (diffMatch) {
    // 构造临时 DiffCard
  }
  // 检查是否有未被后端检测的 URL
  const urlMatch = content.match(/https?:\/\/[^\s\)\]>]+/g);
  if (urlMatch) {
    // 构造临时 LinkPreviewCard（简化版）
  }
  return cards;
}
```

---

## 五、LLM 兼容性

### 适配原理

方案通过两层机制与 LLM 解耦：

**第一层：文本扫描（任何 LLM 都支持）**
所有 LLM 都输出 Markdown 文本。artifact_detector 纯正则扫描，不依赖 LLM 配合。

**第二层：工具调用（需 function calling 支持）**
DeepSeek V3 / GPT-4o / Claude / Gemini 2.5 均支持 function calling。ADK FunctionTool 统一抽象，定义一次，所有模型共用。

### 各 Provider 能力

| Provider | DiffCard | LinkPreviewCard | FileCard | PreviewCard |
|----------|:---:|:---:|:---:|:---:|
| DeepSeek V3 | ✅ | ✅ | ✅ function calling | ✅ function calling |
| GPT-4o | ✅ | ✅ | ✅ 最强 function calling | ✅ 最强 function calling |
| Claude 4 | ✅ | ✅ | ✅ 最强 function calling | ✅ 最强 function calling |
| Gemini 2.5 | ✅ | ✅ | ✅ 强 | ✅ 强 |
| Qwen 3 | ✅ | ✅ | ✅ 可用 | ✅ 可用 |
| 老旧模型 | ✅ | ✅ | ❌ 无 function calling | ❌ 无 function calling |

### 接入新 Provider 只需

1. `models.py` 加一行 Provider → 模型实例映射
2. 如有特殊行为，微调 Seed 里 Agent 的 system_prompt
3. artifact_detector 不变、前端不变

```python
# backend/app/services/adk/models.py
def resolve_agent_model(provider, model, api_key, base_url):
    if provider == "anthropic":   return AnthropicLlm(...)
    if provider == "litellm":     return LiteLlm(...)     # DeepSeek/GPT/Gemini/100+
    if provider == "google":      return GeminiLlm(...)
```

---

## 六、新建/修改文件清单

### 后端新建（4 个）

| 文件 | 说明 |
|------|------|
| `backend/app/services/storage.py` | MinIO 客户端封装（upload/get/delete/presigned/ensure_bucket） |
| `backend/app/services/og_fetcher.py` | OG 元数据抓取（含 SSRF 白名单） |
| `backend/app/services/preview_server.py` | Starlette 预览服务（:8100，CSP 头） |
| `backend/app/api/v1/files.py` | 文件 API（6 端点）+ Pydantic schemas |

### 后端修改（4 个）

| 文件 | 改动 |
|------|------|
| `backend/app/core/config.py` | +PREVIEW_SERVER_PORT +PREVIEW_SERVER_URL |
| `backend/app/api/router.py` | 注册 files_router |
| `backend/app/services/adk/cli_tools.py` | create_file 改造 + 新增 preview_publish |
| `backend/app/services/artifact_detector.py` | 新增 file/preview 检测；URL 改 link_preview + 调 og_fetcher；mergeKey 加哈希 |

### 前端新建（2 个）

| 文件 | 说明 |
|------|------|
| `agenthub-web/src/components/cards/LinkPreviewCard.tsx` | OG 卡片 + Skeleton |
| `agenthub-web/src/hooks/useBlobDownload.ts` | fetch+Blob 下载 + revokeObjectURL |

### 前端修改（8 个）

| 文件 | 说明 |
|------|------|
| `agenthub-web/src/types/chat.ts` | +link_preview 类型 + ApplyDiffResponse |
| `agenthub-web/src/components/cards/DiffCard.tsx` | 重写：Monaco DiffEditor + 保存文件 |
| `agenthub-web/src/components/cards/PreviewCard.tsx` | 移除 allow-same-origin + 错误兜底 |
| `agenthub-web/src/components/cards/FileCard.tsx` | 类型图标 + 三态渲染 + fetch+Blob 下载 |
| `agenthub-web/src/components/cards/CardRenderer.tsx` | 注册 link_preview |
| `agenthub-web/src/components/cards/index.ts` | 导出 LinkPreviewCard |
| `agenthub-web/src/lib/api.ts` | 修正 applyDiff 签名（传 fileName+code 不传 artifact.id） |
| `agenthub-web/src/components/chat/MessageList.tsx` | 新增 `renderFallbackCards()` 前端兜底检测 |

---

## 七、实施顺序

```
Phase 1 — 后端基础（共享依赖）:
  1.1 StorageService（MinIO 客户端）
  1.2 文件 schemas（Pydantic 模型）
  1.3 文件 API 路由（/files/* 6 端点）
  1.4 注册路由 + 配置
  1.5 预览服务器（Starlette :8100）
  1.6 create_file 工具改造 + preview_publish 新增
  1.7 artifact_detector 改造（file/preview/link_preview 检测 + mergeKey 哈希）
  1.8 og_fetcher（含 SSRF 白名单）

Phase 2 — 前端（依赖 Phase 1 后端就绪）:
  2.1 类型定义更新（types/chat.ts）
  2.2 useBlobDownload hook
  2.3 DiffCard 重写（Monaco DiffEditor）
  2.4 FileCard 升级（类型图标 + 三态）
  2.5 PreviewCard 修复（安全 + 兜底）
  2.6 LinkPreviewCard 新建（OG 卡片）
  2.7 CardRenderer 注册 + index 导出
  2.8 api.ts applyDiff 修正
  2.9 MessageList 前端兜底检测

Phase 3 — 收尾:
  3.1 类型检查 npx tsc -b --noEmit
  3.2 端到端验证
```

---

## 八、验证清单

1. DiffCard：Agent 返回 `\`\`\`diff` → Monaco 并排视图 + 语法高亮 → 切统一视图 → 点保存文件 → 下载成功
2. FileCard：Agent 调 create_file → 卡片展示文件 + 下载 → 非图片显示类型图标 → 图片显示缩略图
3. PreviewCard：Agent 调 preview_publish → iframe 加载预览（独立 Origin）→ 全屏查看 → XSS 脚本被阻断
4. LinkPreviewCard：Agent 输出 URL → 先显示 Skeleton → 后显示 OG 卡片 → 点击打开链接
5. 安全验证：预览 iframe 无法访问主站 cookie/token；SSRF 白名单生效
6. 类型检查：`npx tsc -b --noEmit` 零错误
7. 测试回归：`npx vitest run` 全通过
