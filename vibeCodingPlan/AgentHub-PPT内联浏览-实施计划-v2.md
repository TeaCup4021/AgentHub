# PPT 内联浏览 — 实施计划（方案 A：后端 Gotenberg 转换）

## 上下文

**需求来源**：`AgentHub-产物预览与编辑-未完成功能补全计划.md` 第 4 项 — Agent 回复中内联预览 PPT 幻灯片。

**当前状态**：后端转换管线已 80% 就绪，但只覆盖「Agent 回复中检测到 pptx URL → 转换」路径，「用户上传 pptx 文件」路径未触发转换；前端 `DocumentCard` 对 pptx 仍落下载分支。

### 已有资产（可直接复用）

| 资产 | 位置 | 作用 |
|------|------|------|
| Gotenberg Docker 服务 | `backend/docker-compose.yml:44-51` | LibreOffice 无头转换容器，端口 3001 |
| Gotenberg URL 配置 | `backend/app/core/config.py:40` | `GOTENBERG_URL = "http://localhost:3001"` |
| `converter.py` | `backend/app/services/converter.py` | `convert_to_pdf(bytes, filename)` / `convert_url_to_pdf(url)` — 调用 Gotenberg API |
| `_maybe_convert_pptx()` | `backend/app/services/artifact_detector.py:126-175` | 在 artifact 检测时自动转换 pptx→pdf，返回 `(pdf_url, "pdf")` |
| `_doc_ext_to_type` | `backend/app/services/artifact_detector.py:35-38` | `.pptx` → `"pptx"` 映射 |
| `_doc_extensions` | `backend/app/services/artifact_detector.py:33` | 包含 `.ppt`, `.pptx` |
| PDF iframe 渲染 | `agenthub-web/src/components/cards/DocumentCard.tsx:98-99` | `c.fileType === "pdf"` 分支已可用 |
| MinIO storage | `backend/app/services/storage.py` | `upload_file` / `get_file` / `stat_object` 均可用 |
| Download endpoint | `backend/app/api/v1/files.py:73-103` | 已遍历 `files/`, `previews/`, `conversions/` 三个前缀 |

### 当前数据流

```
Agent 回复中有 pptx URL
  → artifact_detector._detect_urls()
  → _is_document_url() 匹配 .pptx 扩展名
  → _maybe_convert_pptx() → Gotenberg 转换 → PDF 存 MinIO (conversions/{uuid}.pdf)
  → artifact.fileType = "pdf", artifact.fileUrl = /api/v1/files/{pdf_id}/download
  → 前端 DocumentCard 渲染 PDF iframe ✅

用户上传 pptx 文件
  → POST /api/v1/files/upload → 原样存 MinIO (files/{uuid})
  → 返回 fileType 为原始 content_type，无 previewUrl
  → 缺少转换步骤 ❌
```

### 目标

1. 用户上传 pptx 文件时，后端自动转换为 PDF 并存储，返回 `previewUrl`
2. Agent 回复路径的 pptx→pdf 转换保持现有行为（已工作）
3. 前端 `DocumentCard` 清理 pptx 早期退出逻辑，统一走 pdf iframe 渲染
4. 转换失败时优雅降级为下载

---

## 实施步骤

### 步骤 1：后端 — 文件上传时自动转换 PPTX→PDF

**文件** `backend/app/api/v1/files.py` — `upload_file` 端点

**改动**：在上传完成后检测文件是否为 PPTX（通过 `content_type` 或文件名扩展名），若是则调用 Gotenberg 转换为 PDF 并存 MinIO。

```python
# 在 upload_file 中，storage.upload_file() 之后增加：

# PPTX → PDF 转换
is_pptx = (
    content_type in (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
        "application/octet-stream",  # 兜底：通过扩展名判断
    )
    and (filename or "").lower().endswith((".pptx", ".ppt"))
)
preview_url = None
preview_file_id = None

if is_pptx:
    try:
        from app.services.converter import convert_to_pdf
        pdf_bytes = await asyncio.get_event_loop().run_in_executor(
            None, lambda: convert_bytes_sync(content, filename)
        )
        if pdf_bytes:
            preview_file_id = str(uuid.uuid4())
            await asyncio.get_event_loop().run_in_executor(
                None, lambda: storage.upload_file(
                    pdf_bytes, f"conversions/{preview_file_id}.pdf", "application/pdf"
                )
            )
            preview_url = f"/api/v1/files/{preview_file_id}/download"
    except Exception:
        logger.exception("PPTX upload conversion failed: %s", filename)

return FileUploadResponse(
    ...,
    previewUrl=preview_url,      # 新增字段
    previewFileId=preview_file_id, # 新增字段
)
```

**需同步修改**：
- `backend/app/schemas/file.py` — `FileUploadResponse` 新增 `previewUrl: Optional[str]` 和 `previewFileId: Optional[str]`
- 复用 `artifact_detector.py:178-203` 的 `convert_bytes_sync` 函数（或提取到 `converter.py`）

**改动量**：~20 行 Python

### 步骤 2：后端 — 提取 `convert_bytes_sync` 到 `converter.py`

**文件** `backend/app/services/converter.py`

`artifact_detector.py:178-203` 中的 `convert_bytes_sync` 是一个独立函数，当前仅在 artifact_detector 内部使用。应移到 `converter.py` 作为公开函数，供 `files.py` 和 `artifact_detector.py` 共用。

```python
# converter.py 新增：
def convert_bytes_sync(file_bytes: bytes, filename: str) -> bytes | None:
    """Synchronous wrapper for Gotenberg conversion (runs in executor)."""
    ...
```

`artifact_detector.py` 中的 `convert_bytes_sync` 改为 `from app.services.converter import convert_bytes_sync`。

**改动量**：~5 行移动 + 1 行 import 变更

### 步骤 3：前端 — DocumentCard 清理 pptx 逻辑

**文件** `agenthub-web/src/components/cards/DocumentCard.tsx`

**现状问题**：
- 第 26 行：`if (c.fileType === "pdf" || c.fileType === "pptx")` — pptx 与 pdf 同走提前退出，跳过 mammoth/XLSX 加载（合理）
- 第 98 行：仅 `c.fileType === "pdf"` 走 iframe，pptx 无分支落到 else → Empty + 下载

**改动**：
1. 第 26 行保留不变（pptx 仍需跳过 mammoth/XLSX 加载）
2. 第 98 行 pdf 分支扩展为同时匹配 pptx（均走 iframe）：

```tsx
) : (c.fileType === "pdf" || c.fileType === "pptx") ? (
  <iframe
    src={c.fileUrl}
    style={{ width: "100%", height: "100%", border: "none" }}
    title={c.fileName}
    onError={() => setError(true)}
  />
)
```

**说明**：后端转换成功后 `fileType` 会变成 `"pdf"`，ptpx 分支主要作为**降级兜底**（转换失败/旧数据时仍尝试 iframe 渲染，浏览器可能原生支持）。若 iframe 加载失败，`onError` 触发 error 状态显示「预览不可用」。

**改动量**：~3 行 TypeScript

### 步骤 4：前端 — 类型定义同步

**文件** `agenthub-web/src/types/chat.ts`

`DocumentArtifactContent.fileType` 类型当前为 `"pdf" | "docx" | "xlsx" | "pptx"`，无需修改。确认 `FileUploadResponse` 前端类型（`types/api.ts`）是否需要新增 `previewUrl` 字段。

**改动量**：~2 行（如需要）

---

## 涉及文件清单

| 文件 | 改动 | 复杂度 |
|------|------|--------|
| `backend/app/services/converter.py` | 收入 `convert_bytes_sync`（从 artifact_detector 移入） | 低 |
| `backend/app/services/artifact_detector.py` | 移除 `convert_bytes_sync`，改为 import converter | 低 |
| `backend/app/api/v1/files.py` | upload 端点增加 pptx→pdf 转换逻辑 | 中 |
| `backend/app/schemas/file.py` | `FileUploadResponse` 新增 `previewUrl` / `previewFileId` | 低 |
| `agenthub-web/src/components/cards/DocumentCard.tsx` | pptx 分支改为 iframe 渲染（复用 pdf 分支） | 低 |
| `agenthub-web/src/types/api.ts` | 如有 `FileUploadResponse` 类型则同步新增字段 | 低 |

---

## 边界情况处理

| 情况 | 处理 |
|------|------|
| Gotenberg 不可用/转换超时 | `except Exception` 捕获，日志记录，`previewUrl` 返回 `null`，前端降级显示下载按钮 |
| 用户上传非 pptx 文件 | `is_pptx` 判断为 False，跳过转换，行为不变 |
| Agent 回复的 pptx URL 无法下载 | `_maybe_convert_pptx` 已有 try/except，返回原始 URL + `fileType: "pptx"`，前端走 pptx iframe 尝试或下载 |
| pptx 文件超大（>50MB） | Gotenberg 默认无大小限制，但可加 `timeout` 配置（已在 converter 中设 60s） |
| 已有旧数据中 `fileType: "pptx"` 的 artifact | 本次修改后前端尝试 iframe 加载，失败则 `onError` → 降级下载 |
| PDF iframe 渲染的 sandbox 权限 | DocumentCard 的 iframe 无 sandbox 属性（与 PreviewCard 不同），PDF 渲染不需要额外权限 |

---

## 验证标准

1. **上传转换**：通过 Swagger (`/docs`) 或 curl 上传 `.pptx` 文件 → 响应包含 `previewUrl` 字段，指向 PDF 下载地址
2. **PDF 可访问**：`GET /api/v1/files/{preview_file_id}/download` 返回 `application/pdf`，`Content-Disposition: inline`
3. **Agent 回复路径**：发送「帮我生成一个关于 AI 的 PPT 文件」→ Agent 输出 pptx 链接 → 前端 DocumentCard 内嵌 PDF iframe（现有逻辑已验证，回归确认）
4. **前端渲染**：DocumentCard 收到 `fileType: "pptx"` 时尝试 iframe 渲染，失败显示「预览不可用」+ 下载按钮
5. **降级不白屏**：关闭 Gotenberg 容器后上传 pptx → 仍返回成功（`previewUrl` 为 null），前端显示下载
6. **不改动现有 PDF/Word/Excel**：回归确认 pdf/docx/xlsx 预览行为不变
7. **Gotenberg 未启动**：上传 pptx 不报 500，正常返回（`previewUrl` 为 null）

---

## 工作量评估

| 步骤 | 内容 | 时间 |
|------|------|------|
| 步骤 1 | upload 端点增加转换 | 20 分钟 |
| 步骤 2 | `convert_bytes_sync` 提取到 converter | 10 分钟 |
| 步骤 3 | DocumentCard 清理 | 10 分钟 |
| 步骤 4 | 类型定义同步 | 5 分钟 |
| 验证 | 端到端测试 | 15 分钟 |
| **合计** | | **1 小时** |
