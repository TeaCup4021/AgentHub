---
id: TASK-PREVIEW-PPT-INLINE-001
type: task
title: 建立 Gotenberg 转换服务与客户端
status: implemented
owner: Backend A
created: 2026-06-10
updated: 2026-06-10
plan: PLAN-PREVIEW-PPT-INLINE-001
specs:
  - SPEC-PREVIEW-PPT-INLINE-001
source_assets:
  - vibeCodingSummary/PPT内联浏览-实施总结-2026-06-06.md
depends_on: []
relates_to: []
implements:
  - backend/docker-compose.yml
  - backend/app/core/config.py
  - backend/app/services/converter.py
traces:
  - TRACE-PREVIEW-PPT-INLINE-001
blocked_by: []
acceptance:
  - 后端具备 Gotenberg URL 配置。
  - converter.py 提供 bytes、URL 和同步转换入口。
  - httpx 客户端禁用系统代理以访问本地 Gotenberg。
---

# 建立 Gotenberg 转换服务与客户端

## 目标

为 PPT/PPTX 转 PDF 提供可复用的后端转换基础设施。

## 前置条件

- Docker 环境可运行 Gotenberg 服务。
- 后端配置可读取 Gotenberg URL。

## 预期触达路径

- `backend/docker-compose.yml`
- `backend/app/core/config.py`
- `backend/app/services/converter.py`

## 执行步骤

1. 配置 gotenberg 容器。
2. 添加 `GOTENBERG_URL`。
3. 实现 `convert_to_pdf`、`convert_url_to_pdf`、`convert_bytes_sync`。
4. 确保本地转换请求不走系统代理。

## 验收标准

- [ ] PPTX 字节可提交给 Gotenberg 并返回 PDF 字节。
- [ ] 转换失败能返回空结果或异常被上游捕获。

## 实施记录

见 `TRACE-PREVIEW-PPT-INLINE-001`。

## Obsidian 双链

Related:

- [[SPEC-PREVIEW-PPT-INLINE-001]]
- [[PLAN-PREVIEW-PPT-INLINE-001]]
- [[TRACE-PREVIEW-PPT-INLINE-001]]
