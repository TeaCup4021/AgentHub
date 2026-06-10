# CLI Deploy Existing File Link Fix - 2026-06-07

## Background

When testing Claude Code CLI with "创建一个 Hello XUPT Welcome页面并部署到本地,生成本地链接给我让我可以直接打开", the frontend bubble showed a local link, but clicking it opened the FastAPI backend and returned `{"code":404,"data":null,"message":"Not Found"}`. The deployment card also failed.

## Root Causes

1. The CLI reply referenced existing files such as `hello-world/index.html`, but the backend deployment fallback only scanned files modified after the current stream started.
2. The CLI reply exposed `http://localhost:8080/index.html` and `http://localhost:8080/xupt.html`; port 8080 is the AgentHub backend, not a static deployment server.
3. Backend artifact detection and frontend fallback cards both treated those backend URLs as normal links, creating misleading clickable cards.

## Changes

- Added CLI deployment fallback that extracts referenced static file paths and local static URLs from the final CLI text.
- Resolved referenced files strictly under the CLI workspace and collected the referenced file's static directory for deployment.
- Preserved the recent-file fallback for newly created files.
- Reordered CLI message persistence so the final saved content can replace backend `8080` static links with the real deployment URL once the deployment artifact exists.
- Filtered backend `localhost:8080/*.html` links in backend artifact detection.
- Filtered the same backend static links from the frontend fallback link-card renderer.
- Added regression tests for existing-file deployment collection, deployment-link sanitization, and backend static URL filtering.

## Verification

- `D:\AgentHub\.venv\Scripts\python.exe -m py_compile backend\app\services\adapters\cli_adapter.py backend\app\services\artifact_detector.py`
  - passed
- `D:\AgentHub\.venv\Scripts\python.exe -m pytest backend\tests\services\test_artifact_detector.py backend\tests\services\adapters\test_cli_adapter_deployment.py`
  - 8 passed
- `npm.cmd run build` in `agenthub-web`
  - passed
  - existing warnings: `lottie-web` direct eval and large bundle chunks
