# CLI Deploy Card Fix - 2026-06-07

## Background

When testing Claude Code CLI with "创建一个 Hello XUPT 页面并部署到本地", the frontend only showed the text prefix of the CLI reply. The expected deployed URL and deploy status card were missing.

## Root Causes

1. `artifact_detector.py` only parsed body artifacts for `code|diff|preview`; `deploy_status` was ignored.
2. The self-closing artifact parser required a fixed attribute order, while the CLI prompt emitted `url` before `title`.
3. CLI streams did not have a robust fallback when the CLI created real files but did not emit XML artifacts.
4. `CardRenderer` did not pass the conversation id into `DeployStatusCard`.
5. `DeployStatusCard` used `/api/v1/...` paths even though the Axios base URL is already `/api/v1`.

## Changes

- Updated artifact XML parsing to support arbitrary attribute order, single/double quotes, body/self-closing tags, and `deploy_status`.
- Stripped artifact XML before fallback code/URL detection to avoid duplicate link cards from artifact attributes.
- Added CLI deploy fallback:
  - scans files generated after the current CLI stream starts;
  - collects static web files such as HTML/CSS/JS/SVG;
  - creates a local deployment and emits a persisted `deploy_status` artifact with URL, port, deployment id, and source files.
- Updated document artifact scanning to use the same per-run file cutoff.
- Reworked `DeployStatusCard` to use artifact-provided deployment data first, and only call the deployment API for `DEPLOY_REQUEST`.
- Fixed deployment API paths in the frontend.
- Added nested directory support and path boundary checks in `DeploymentService`.
- Added regression tests for deploy artifact detection.

## Verification

- `D:\AgentHub\.venv\Scripts\python.exe -m pytest backend/tests/services/test_artifact_detector.py backend/tests/services/test_artifact_service.py`
  - 10 passed
- `D:\AgentHub\.venv\Scripts\python.exe -m py_compile backend/app/services/artifact_detector.py backend/app/services/adapters/cli_adapter.py backend/app/services/deployment.py`
  - passed
- `npm.cmd run build` in `agenthub-web`
  - passed
  - existing warnings: `lottie-web` direct eval and large bundle chunks

## Notes

- `backend/tests/api/test_conversation_stream_artifact_persistence.py` currently fails because it monkeypatches the removed `build_single_chat_agent` symbol. This is an existing stale test issue, unrelated to the deploy card fix.
