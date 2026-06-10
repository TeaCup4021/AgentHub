# 网页预览功能修复 — 架构决策

**日期**：2026-06-04  
**类型**：Bug Fix & Performance Optimization  
**影响范围**：后端产物检测、前端预览渲染、SSE 事件流

---

## 问题概述

用户发送请求要求后端生成网页预览卡片时，前端 iframe 显示"localhost 拒绝连接"或"Not Found"，网页预览功能不可用。

## 根本原因分析

### 问题 1：产物上传阻塞事件循环

**症状**：iframe 加载超时，浏览器报"连接拒绝"  
**根因**：`detect_artifacts()` 中调用 `_publish_preview_html()` 进行同步 MinIO 上传，阻塞了 uvicorn 异步事件循环，导致其他请求（包括 iframe 对 `/preview/{id}` 的 GET 请求）无法被处理。

**影响**：SSE 流生成期间，后端无法响应任何新请求，持续到上传完成为止。浏览器为 iframe src 发出的请求在事件循环中排队等待，最终超时。

### 问题 2：预览服务路由重复映射

**症状**：后端日志中没有对应的 GET 请求，前端收到 404  
**根因**：`preview_server.py` 的路由定义为 `/preview/{preview_id}`，而 `main.py` 中以 `/preview` 前缀挂载，导致实际路由变成 `/preview/preview/{preview_id}`。前端请求 `/preview/{id}` 被代理到后端时，无法匹配任何路由。

### 问题 3：前端代理端口不一致

**症状**：Vite 代理错误 `Error: connect ECONNREFUSED 127.0.0.1:8000`  
**根因**：后端实际运行在 8080（`package.json` 启动命令），但 `config.py` 和 `vite.config.ts` 中一度被改为 8000，导致前端 API 请求无法连接。

### 问题 4：iframe sandbox 权限不足

**症状**：网页内容在 iframe 中加载失败或显示空白  
**根因**：`PreviewCard.tsx` 中 iframe 的 sandbox 属性仅设置 `allow-scripts`，缺少 `allow-same-origin`、`allow-forms`、`allow-popups` 权限，导致网页的跨域资源加载、表单提交等功能被阻止。

## 决策与解决方案

### 方案 1：异步化产物上传（关键修复）

**决策**：将 `_publish_preview_html()` 改为 async，使用 `asyncio.get_event_loop().run_in_executor()` 在线程池中执行 MinIO 上传，避免阻塞主事件循环。

**实施**：
- `artifact_detector.py:_publish_preview_html()` → async
- `artifact_detector.py:_detect_xml_artifacts()` → async
- `artifact_detector.py:_build_xml_artifact()` → async
- `artifact_detector.py:detect_artifacts()` → async
- `conversations.py:_adk_sse_stream()` 中调用处 → `await detect_artifacts()`

**效果**：MinIO 上传委托给线程池后，主事件循环立即继续处理其他请求，iframe 加载请求可正常响应。

---

### 方案 2：修复预览服务路由映射

**决策**：预览服务的路由应为 `/{preview_id}`，让 FastAPI 的 `mount()` 处理 `/preview` 前缀，避免路径重复。

**实施**：
- `preview_server.py` 路由改为 `Route("/{preview_id}", serve_preview)`

**效果**：完整路径为 `/preview/{preview_id}`，与前端请求和数据库中存储的 URL 一致。

---

### 方案 3：补全前端 iframe sandbox 权限

**决策**：添加必要的 sandbox 权限以支持网页正常加载和交互。

**实施**：
- `PreviewCard.tsx` iframe sandbox 改为 `"allow-scripts allow-same-origin allow-forms allow-popups"`

**效果**：网页可正常加载外部资源、执行脚本、跨域请求。

---

### 方案 4：扩大产物检测范围

**决策**：产物检测不仅限特定域名（YouTube、Google Docs 等），而是支持所有 http/https 链接作为网页预览。

**实施**：
- `artifact_detector.py:_is_embeddable()` 改为 `return u.startswith("http")`

**效果**：用户发送的普通网站链接（如 `https://react.dev`）自动识别为预览卡片。

---

## 技术架构影响

### 后端层

| 模块 | 改动 | 理由 |
|------|------|------|
| `artifact_detector.py` | 异步化产物检测和上传 | 避免事件循环阻塞 |
| `preview_server.py` | 路由改为 `/{preview_id}` | 正确的路由映射 |
| `config.py` | 保持 `PREVIEW_SERVER_URL = "http://localhost:8080"` | 与后端实际运行端口一致 |

### 前端层

| 模块 | 改动 | 理由 |
|------|------|------|
| `vite.config.ts` | 添加 `/preview` 路由代理 | 确保预览请求可达后端 |
| `PreviewCard.tsx` | 补全 iframe sandbox 权限 | 网页内容正常加载 |

---

## 新增规则

1. **异步事件循环保护**：SSE 流中任何长时间 I/O 操作必须异步化或委托线程池。
2. **端口配置一致性**：后端启动命令、前端代理、配置文件中的端口必须对齐。
3. **路由映射规范**：挂载的子应用路由不能重复包含挂载前缀。
4. **iframe 权限完整性**：根据内容需求设置完整的 sandbox 权限。

---

## 验证清单

- [x] 后端产物检测异步化，MinIO 上传不阻塞事件循环
- [x] 预览服务路由正确映射为 `/preview/{id}`
- [x] 前端代理包含 `/preview` 路由
- [x] iframe sandbox 权限补全
- [x] 网页预览卡片正常显示，可点击展开全屏
- [x] 旧 artifact 仍可正确访问

---

## 后续优化方向

1. **预览服务单独部署**：当前挂载到主应用，可考虑独立部署以提高性能
2. **预览 URL 缓存**：MinIO 上传完成后可生成有效期较长的预签名 URL，减少后续代理开销
3. **异步上传队列**：高并发场景下可使用队列缓冲，避免线程池饱和
