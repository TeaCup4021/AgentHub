# PPT 内联浏览修复合集 — Gotenberg 代理 · 文件名 · Content-Disposition · CLI 自动预览

> 日期：2026-06-06 | 模块：PPTX→PDF 内联预览 + CLI Agent 生成文件自动预览

---

## 概述

修复了 PPT 上传后无法内联预览的多个 bug，并实现了 CLI Agent 生成的文件自动接入预览管线。最终效果：上传或 CLI 生成 PPTX → 后端 Gotenberg 转换为 PDF → 前端 DocumentCard 以 iframe 内联渲染。

## 架构

```
PPTX 来源（上传 / CLI 生成）
    │
    ├─ 上传: ChatInput → MinIO → prompt 含 [附件文件链接] + fileUrl
    │  └─ _detect_urls → _resolve_internal_file → _maybe_convert_pptx
    │
    └─ CLI 生成: Claude Code CLI → cli-workspace/demo.pptx
       └─ _emit_cli_generated_file_artifacts 扫描 → 上传 MinIO → _maybe_convert_pptx
    │
    ▼
_maybe_convert_pptx()
    ├─ MinIO 读文件 → Gotenberg /forms/libreoffice/convert
    ├─ PDF 字节 → MinIO 新 key → fileType="pdf", fileUrl="/api/v1/files/{id}/download"
    └─ 失败则保持原始 fileType
    │
    ▼
SSE artifact 事件 (artifactType=document, fileType=pdf)
    │
    ▼
DocumentCard.tsx: fileType=pdf → <iframe src={fileUrl} />
    │
    ▼
files.py download 端点: Content-Type=application/pdf, Content-Disposition=inline
```

## 修复清单

### Bug 1: Gotenberg 502 Bad Gateway（Windows 代理）

| 项 | 内容 |
|------|------|
| **文件** | `backend/app/services/converter.py:14,27` |
| **根因** | `httpx.AsyncClient()` 默认 `trust_env=True`，在 Windows 上读系统代理设置，`localhost:3001` 被路由到代理返回 502 |
| **修复** | 两处 `AsyncClient` 加 `trust_env=False` |

### Bug 2: Gotenberg 400 no form file found（文件名无扩展名）

| 项 | 内容 |
|------|------|
| **文件** | `backend/app/services/artifact_detector.py:_resolve_internal_file` |
| **根因** | MinIO 存储的文件构建为 `uploaded_file_{id[:8]}` 无扩展名，Gotenberg/LibreOffice 靠扩展名判断格式 |
| **修复** | 根据 content_type 添加对应扩展名：`.pptx` / `.docx` / `.xlsx` / `.pdf` |

### Bug 3: PDF 转换成功但浏览器不渲染（Content-Disposition: attachment）

| 项 | 内容 |
|------|------|
| **文件** | `backend/app/api/v1/files.py:73-99` |
| **根因** | 下载端点硬编码 `Content-Disposition: attachment` + `media_type: application/octet-stream`，浏览器弹下载框而非内联渲染 |
| **修复** | 用 MinIO `stat_object` 获取真实 content-type；对 `application/pdf` 和 `image/*` 设置 `Content-Disposition: inline` |

### Bug 4: uvicorn reload 反复打断 CLI Agent

| 项 | 内容 |
|------|------|
| **文件** | `backend/.env:29` |
| **根因** | `CLI_DEFAULT_WORKSPACE=.` 导致 CLI 在 backend/ 目录创建文件，触发 uvicorn 文件监听重载，杀死子进程 |
| **修复** | 改为外部目录 `E:\demo04\AgentHubtest02\cli-workspace`；启动加 `--reload-exclude "venv/*"` |

### 功能: CLI Agent 生成文件自动预览

| 项 | 内容 |
|------|------|
| **文件** | `backend/app/services/adapters/cli_adapter.py` |
| **新增函数** | `_emit_cli_generated_file_artifacts(runner, conv_id, message_id, accumulated)` |
| **流程** | CLI 执行完毕 → 扫描 workspace 中 10 分钟内的文档文件（`.pptx/.pdf/.docx/.xlsx`）→ 上传 MinIO → 调用 `_maybe_convert_pptx` 转换 PPTX → 生成 SSE artifact 事件 → `ArtifactService.append_version` 入库 |
| **集成点** | `CliAdapter.stream()` 方法内，在 `message_end` 之前触发 |

### 调试增强

| 项 | 内容 |
|------|------|
| **文件** | `backend/app/services/artifact_detector.py:convert_bytes_sync` |
| **改动** | 转换前日志 `Gotenberg convert: filename= size= url=`；成功日志；失败时打印 HTTP 状态码和响应体 |

---

## 涉及文件

| 文件 | 改动 | 复杂度 |
|------|------|--------|
| `backend/app/services/converter.py` | `trust_env=False` × 2 | 低 |
| `backend/app/services/artifact_detector.py` | 文件名加扩展名 + 调试日志 | 中 |
| `backend/app/api/v1/files.py` | download 端点 Content-Type/Disposition 自适应 | 中 |
| `backend/app/services/adapters/cli_adapter.py` | 新增 workspace 扫描 + artifact 自动生成 | 高 |
| `backend/.env` | CLI_DEFAULT_WORKSPACE 改外部路径 | 低 |

---

## 验证

1. 上传一个 `.pptx` 文件到对话 → 发送消息 → 应出现 DocumentCard 内嵌 PDF 预览
2. 用 Claude Code CLI Agent 发送 `请用python-pptx生成PPT保存为demo.pptx` → 回复中自动出现 DocumentCard
3. 刷新页面 → artifact 卡片仍在
