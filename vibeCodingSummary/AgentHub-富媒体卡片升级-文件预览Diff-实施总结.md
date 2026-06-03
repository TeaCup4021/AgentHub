# 富媒体卡片升级实施总结 — 文件附件 · 网页预览 · Diff 视图

## 概述

为 AgentHub 实现了四张富媒体产物卡片：**DiffCard**（并排代码对比）、**FileCard**（文件下载）、**PreviewCard**（网页预览）、**LinkPreviewCard**（链接预览）。后端基于 MinIO 存储 + SSE 事件推送，前端基于 Monaco Editor + Semi Design 渲染。

## 架构

```
Agent 回复文本
     │
     ▼
artifact_detector (后端正则扫描)
     │
     ├─ ```python → code artifact      → CodeCard (已有)
     ├─ ```diff   → diff artifact      → DiffCard (重写)
     ├─ 外部URL   → link_preview       → LinkPreviewCard (新增)
     ├─ create_file 工具结果JSON       → file artifact     → FileCard (升级)
     └─ preview_publish 工具结果JSON   → preview artifact  → PreviewCard (修复)
     │
     ▼
SSE artifact 事件 → 前端 chatStore → CardRenderer → 卡片渲染
     │
     ▼
ArtifactService → PostgreSQL (产物工作台持久化)
```

**前端兜底**：如果后端正则漏了，前端 MessageList 会直接解析消息文本中的 `\`\`\`diff` 和 URL，自己构造临时卡片。

## 四张卡片

### DiffCard — 代码变更对比
- 渲染：Monaco `<DiffEditor>` (`@monaco-editor/react`，已安装)
- 功能：并排/统一视图切换、语法高亮、增删统计
- "保存文件"按钮：`POST /api/v1/files/apply-diff` → MinIO → 下载

### FileCard — 文件下载
- 类型图标：按文件扩展名分颜色（PDF 红、表格绿、文档蓝…）
- 图片缩略图：`image/*` 类型自动展示
- 下载：优先走 `GET /files/{id}/download`（MinIO 代理），无 URL 时用前端 Blob 兜底
- 空状态：文件未生成时显示"暂未生成"

### PreviewCard — 网页预览
- 安全模型：独立 Origin 沙箱（预览服务端口 8100，不同端口 = 浏览器级隔离）
- `<iframe sandbox="allow-scripts">`，移除 `allow-same-origin`
- 预览服务返回 CSP 头：`sandbox; default-src 'self'; connect-src 'none'`
- 全屏：Semi Modal fullScreen
- 对标：Claude Artifacts 的 `claudeusercontent.com`

### LinkPreviewCard — 链接预览
- 后端 `og_fetcher.py` 抓取 OG 元数据（标题、描述、缩略图、favicon）
- SSRF 防护：禁止 localhost、私有 IP、云元数据地址
- 降级：OG 抓取失败时显示域名 + favicon + URL
- 点击整卡 `window.open(url)`

## 后端新增文件

| 文件 | 说明 |
|------|------|
| `app/services/storage.py` | MinIO 客户端（upload/get/delete/presigned/ensure_bucket） |
| `app/services/og_fetcher.py` | OG 元数据抓取 + SSRF 白名单 |
| `app/services/preview_server.py` | Starlette 预览服务（端口 8100，CSP 头） |
| `app/api/v1/files.py` | 6 个端点：upload / download / content / apply-diff / preview / get |
| `app/schemas/file.py` | Pydantic 模型 |

## 后端修改文件

| 文件 | 改动 |
|------|------|
| `app/core/config.py` | +PREVIEW_SERVER_PORT (8100) +PREVIEW_SERVER_URL |
| `app/api/router.py` | 注册 files_router (`/v1/files`) |
| `app/services/adk/cli_tools.py` | create_file 升级（写磁盘+上 MinIO+返 JSON）；新增 preview_publish 工具 |
| `app/services/artifact_detector.py` | 新增 _detect_file_artifacts / _detect_preview_artifacts / link_preview 分类；删除凭空造 file artifact；mergeKey 内容哈希去重 |
| `app/services/artifact.py` | mergeKey 改为 content_hash 去重 |
| `app/core/seed.py` | Agent UUID 固定化；DeepSeek 预设 create_file+preview_publish 工具；更新 system_prompt |

## 前端新增文件

| 文件 | 说明 |
|------|------|
| `hooks/useBlobDownload.ts` | fetch+Blob 下载 + 自动 revokeObjectURL |
| `components/cards/LinkPreviewCard.tsx` | OG 链接预览卡片 |

## 前端修改文件

| 文件 | 说明 |
|------|------|
| `types/chat.ts` | +link_preview 类型 + LinkPreviewArtifactContent + ApplyDiffResponse |
| `components/cards/DiffCard.tsx` | 重写：Monaco DiffEditor + 保存文件按钮 |
| `components/cards/PreviewCard.tsx` | 移除 allow-same-origin + iframe 加载失败兜底 |
| `components/cards/FileCard.tsx` | 类型图标 + 图片缩略图 + 三态渲染 + Blob 兜底 |
| `components/cards/CardRenderer.tsx` | +link_preview 注册 |
| `components/cards/index.ts` | +LinkPreviewCard + DocumentCard 导出 |
| `lib/api.ts` | applyDiff 签名修正（参数改为 fileName+code） |
| `components/chat/MessageList.tsx` | 前端兜底检测（renderFallbackCards） |
| `components/cards/__tests__/CardRenderer.test.tsx` | 更新 diff 测试匹配新组件 |

## 文件 API 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| `POST` | `/api/v1/files/upload` | multipart 文件上传 → MinIO |
| `GET` | `/api/v1/files/{id}` | 文件元数据 |
| `GET` | `/api/v1/files/{id}/download` | MinIO 代理下载流 |
| `PUT` | `/api/v1/files/{id}/content` | 覆盖文件文本内容 |
| `POST` | `/api/v1/files/apply-diff` | 将 newCode 存为 MinIO 文件并返回下载 URL |
| `POST` | `/api/v1/files/preview` | 发布 HTML 到预览服务，返回预览 URL |

## 启动方式

```bash
# 1. 后端（带 --reload 自动重启）
cd backend
python -m uvicorn app.main:app --reload --port 8080 --host 0.0.0.0

# 2. 预览服务器（另一个终端，PreviewCard 需要）
cd backend
python -c "import uvicorn; from app.services.preview_server import preview_app; uvicorn.run(preview_app, port=8100)"

# 3. 前端
cd agenthub-web
npm run dev
```

## 测试卡片的方法

**重要**：每次重启后端后，seed 重新执行可能生成新 UUID 的 agent。已修复为固定 UUID，但已有旧会话仍绑旧 UUID。**新建会话**后再测试。

测试 prompt（三个）：
1. `帮我写一个 Python 脚本，用来读取 CSV 文件并统计行数。然后模拟一下如果有改进，用 diff 格式展示改了什么。`
2. `帮我写一个简单的 HTML 计算器页面，然后调用 preview_publish 工具发布。`
3. `介绍一下 https://github.com/tiangolo/fastapi`

## 已知注意事项

1. **Seed agent UUID 固定化**：重启后端不会变，但如果清空数据库重建 → 旧会话 agent 绑定失效
2. **预览服务器需单独启动**：端口 8100，和生产部署时需映射为子域名 `preview.agenthub.com`
3. **OG 抓取超时 5 秒**：某些网站可能抓取失败，前端降级显示简化卡片
4. **SSRF 防护**：og_fetcher 禁止抓取 localhost / 私有 IP / cloud metadata 地址
5. **DeepSeek function calling**：工具调用可靠性取决于 DeepSeek 模型，GPT-4o / Claude 表现更稳定
6. **MinIO**：docker-compose 已配置但需确保 MinIO 容器已启动，否则文件上传/下载/预览均失败
