# 2026-06-06 — PPTX 内联预览转换管线架构决策

## 背景

AgentHub 的 DocumentCard 已支持 PDF（iframe）、Word（mammoth→HTML）、Excel（SheetJS→HTML）内联预览，PPTX 仍走下载分支。需要实现 PPTX 的内联预览。

## 决策：后端 Gotenberg 转换（Plan C）而非前端 Office Web Viewer（Plan A）

### 方案对比

| | 方案 A：Office Web Viewer | 方案 C：Gotenberg 后端转换 |
|---|---|---|
| 原理 | 把文件 URL 传给微软服务器，返回 iframe | 后端子进程调 LibreOffice headless 转 PDF |
| 文件位置要求 | **需公网可达** | 无要求（本地 MinIO 即可） |
| 数据隐私 | 文件经过微软服务器 | 数据不离开服务器 |
| 安装依赖 | 无 | Gotenberg Docker 容器（~200MB） |
| 前端改动 | 仅 `DocumentCard.tsx` | 无（复用已有 PDF iframe） |
| 离线可用 | 否 | 是 |

### 选择方案 C 的原因

1. **文件访问限制**：用户上传的 PPTX 存在本地 MinIO，无公网 URL，方案 A 不可行
2. **已有基建**：`artifact_detector.py` 中 `_maybe_convert_pptx` 已实现 80%，Gotenberg 容器已在 `docker-compose.yml` 中配置
3. **架构一致性**：PDF/Word/Excel 均为本地处理，PPTX 亦应如此

## 三条 PPTX 来源路径

```
PPTX 来源
    ├─ 路径 A：用户上传 (ChatInput 拖拽)
    │    → upload 端点即时转换 + prompt 中检测附件链接
    ├─ 路径 B：Agent 回复中的文档 URL
    │    → _detect_urls → _is_document_url → _maybe_convert_pptx
    └─ 路径 C：CLI Agent 本地生成文件
         → _emit_cli_generated_file_artifacts 扫描 workspace
```

三条路径最终汇聚到 `_maybe_convert_pptx()`，统一的 PPTX→PDF 转换入口。

## CLI Workspace 位置

CLI Agent（Claude Code CLI）的工作目录不能放在 `backend/` 下，否则创建文件会触发 uvicorn `--reload` 文件监听并杀死子进程。决策：workspace 放在项目根目录的 `cli-workspace/`，与 backend 同级。

## 前端渲染：复用 PDF iframe

转换后 `fileType` 从 `"pptx"` 变为 `"pdf"`，DocumentCard 已有的 PDF iframe 渲染路径直接生效。下载端点对 PDF 文件返回 `Content-Type: application/pdf` + `Content-Disposition: inline`。

## 涉及文件

| 文件 | 角色 |
|------|------|
| `backend/docker-compose.yml` | Gotenberg 8 容器 |
| `backend/app/services/converter.py` | Gotenberg HTTP 客户端 |
| `backend/app/services/artifact_detector.py` | PPTX 检测 + 转换编排 |
| `backend/app/api/v1/files.py` | 上传即时转换 + inline 下载 |
| `backend/app/services/adapters/cli_adapter.py` | CLI 生成文件自动接入 |
| `agenthub-web/src/components/cards/DocumentCard.tsx` | pptx 分支走 iframe |

## 后果

- **正面**：PPTX 内联预览可离线工作，数据不外泄，与现有 PDF/Word/Excel 预览架构一致
- **负面**：依赖 Gotenberg 容器运行；转换耗时 1-5 秒；Windows 上 httpx 需显式设 `trust_env=False` 绕过系统代理
- **风险**：Gotenberg 不可用时降级为下载按钮，不影响正常使用
